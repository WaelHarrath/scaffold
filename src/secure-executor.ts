import type { ParsedAction } from "./cognition/action-parser.js";
import type { Executor, ExecutionResult } from "./execution/executor.js";
import * as path from "node:path";
import { resolveWithinWorkspace, toWorkspaceRelative } from "./workspace.js";
import { redactText, type RedactOptions } from "./redact.js";

/**
 * Security + workspace-safety wrapper around the base executor, applied on the
 * PUBLIC runtime path only.
 *
 * The base `executor.ts` is treated as part of the fixed execution surface and
 * is never modified. This wrapper layers on top of it:
 *
 *  - containment of `inspect`/`search`/`edit` targets inside the workspace
 *    (rejects `../`, absolute-escape, and symlink escape);
 *  - re-basing + filtering of `filesChanged` onto workspace-relative paths
 *    (the base executor reports them relative to `process.cwd()`);
 *  - secret redaction of tool output/error text before it reaches the host or
 *    the model-feeding feedback layer.
 */

export interface SecureExecutorOptions {
  /** Containment / parity for the `run` action may be relaxed by the caller. */
  readonly containment?: {
    readonly enabled: boolean;
    readonly requireRelative?: boolean;
    readonly followSymlinks?: boolean;
  };
  readonly redact?: RedactOptions;
}

export function createSecureExecutor(
  base: Executor,
  workspaceDir: string,
  options: SecureExecutorOptions = {},
): Executor {
  const containment = options.containment?.enabled ?? true;
  const requireRelative = options.containment?.requireRelative ?? false;
  const followSymlinks = options.containment?.followSymlinks ?? true;

  return {
    async execute(action: ParsedAction): Promise<ExecutionResult> {
      // Pre-flight path containment for file/pattern targets.
      if (containment && action.type !== "run") {
        if (action.type === "inspect" || action.type === "search" || action.type === "edit") {
          if (action.target) {
            try {
              resolveWithinWorkspace(workspaceDir, action.target, {
                requireRelative,
                followSymlinks,
              });
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              return { success: false, output: "", error: msg, filesChanged: [] };
            }
          }
        }
      }

      const result = await base.execute(action);

      // Post-filter + re-base changed files onto the workspace.
      const filesChanged = filterChangedFiles(workspaceDir, result.filesChanged);

      // Redact output / error text.
      return {
        success: result.success,
        output: redactText(result.output, options.redact),
        error: result.error === null ? null : redactText(result.error, options.redact),
        filesChanged,
      };
    },
  };
}

function filterChangedFiles(workspaceDir: string, changed: readonly string[]): string[] {
  const out: string[] = [];
  for (const f of changed) {
    const rel = toWorkspaceRelative(workspaceDir, path.resolve(f));
    // Drop any changed path that still points outside the workspace.
    if (rel.includes("..") || rel.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(rel)) {
      continue;
    }
    if (!out.includes(rel)) out.push(rel);
  }
  return out;
}
