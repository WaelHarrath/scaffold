import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";
import type { ParsedAction } from "../cognition/action-parser.js";

export interface ExecutionResult {
  readonly success: boolean;
  readonly output: string;
  readonly error: string | null;
  readonly filesChanged: string[];
}

export interface Executor {
  execute(action: ParsedAction): Promise<ExecutionResult>;
}

const DEFAULT_TIMEOUT = 30000;

function snapshotFiles(dir: string): Set<string> {
  const files = new Set<string>();
  try {
    const entries = fs.readdirSync(dir, { recursive: true, withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile()) {
        const dir = (entry as { parentPath?: string; path?: string }).parentPath ?? (entry as { path?: string }).path ?? "";
        files.add(path.join(dir, entry.name));
      }
    }
  } catch {
    // ignore scan errors
  }
  return files;
}

function diffFiles(before: Set<string>, after: Set<string>): string[] {
  const changed: string[] = [];
  for (const f of after) {
    if (!before.has(f)) {
      changed.push(path.relative(process.cwd(), f));
    }
  }
  return changed;
}

export function createExecutor(workingDir: string, timeout: number = DEFAULT_TIMEOUT): Executor {
  async function execute(action: ParsedAction): Promise<ExecutionResult> {
    switch (action.type) {
      case "inspect":
        return executeInspect(action);
      case "search":
        return executeSearch(action);
      case "edit":
        return executeEdit(action);
      case "run":
        return executeRun(action, workingDir, timeout);
      case "finish":
        return { success: true, output: "task complete", error: null, filesChanged: [] };
      default:
        return { success: false, output: "", error: `unknown action type: ${(action as ParsedAction).type}`, filesChanged: [] };
    }
  }

  function executeInspect(action: ParsedAction): ExecutionResult {
    if (!action.target) {
      return { success: false, output: "", error: "inspect requires a target file", filesChanged: [] };
    }
    const filePath = path.resolve(workingDir, action.target);
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      return { success: true, output: content, error: null, filesChanged: [] };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, output: "", error: `failed to read ${action.target}: ${msg}`, filesChanged: [] };
    }
  }

  function executeSearch(action: ParsedAction): ExecutionResult {
    if (!action.target) {
      return { success: false, output: "", error: "search requires a target pattern", filesChanged: [] };
    }

    try {
      const results: string[] = [];
      const searchDir = workingDir;

      function scan(dir: string): void {
        let entries: fs.Dirent[];
        try {
          entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch {
          return;
        }

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            if (entry.name === "node_modules" || entry.name === ".git") continue;
            scan(fullPath);
          } else if (entry.isFile()) {
            try {
              const content = fs.readFileSync(fullPath, "utf-8");
              const lines = content.split("\n");
              for (let i = 0; i < lines.length; i++) {
                const line = lines[i]!;
                if (line.includes(action.target!)) {
                  const relPath = path.relative(searchDir, fullPath);
                  results.push(`${relPath}:${i + 1}: ${line.trim()}`);
                }
              }
            } catch {
              // skip unreadable files
            }
          }
        }
      }

      scan(searchDir);

      if (results.length === 0) {
        return { success: false, output: "", error: `no matches found for "${action.target}"`, filesChanged: [] };
      }

      return { success: true, output: results.join("\n"), error: null, filesChanged: [] };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, output: "", error: `search failed: ${msg}`, filesChanged: [] };
    }
  }

  function executeEdit(action: ParsedAction): ExecutionResult {
    if (!action.target) {
      return { success: false, output: "", error: "edit requires a target file", filesChanged: [] };
    }
    if (!action.content) {
      return { success: false, output: "", error: "edit requires content", filesChanged: [] };
    }

    // Normalize content: decode JSON-stringified strings and unescape backslash-quotes
    // that the model sometimes emits in the CONTENT field
    let content = action.content;
    if (content.startsWith('"') && content.endsWith('"')) {
      try {
        const decoded = JSON.parse(content);
        if (typeof decoded === "string") content = decoded;
      } catch {
        // not valid JSON-stringified — use raw content
      }
    }
    if (content.includes('\\"')) {
      content = content.replace(/\\"/g, '"');
    }

    const filePath = path.resolve(workingDir, action.target);
    const before = snapshotFiles(path.dirname(filePath));

    try {
      const dir = path.dirname(filePath);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(filePath, content, "utf-8");

      const after = snapshotFiles(dir);
      const changed = diffFiles(before, after);

      return { success: true, output: `wrote ${action.target}`, error: null, filesChanged: changed };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, output: "", error: `edit failed: ${msg}`, filesChanged: [] };
    }
  }

  return { execute };
}

function executeRun(
  action: ParsedAction,
  workingDir: string,
  timeout: number,
): ExecutionResult {
  if (!action.target) {
    return { success: false, output: "", error: "run requires a command", filesChanged: [] };
  }

  const before = snapshotFiles(workingDir);

  try {
    const output = execSync(action.target, {
      cwd: workingDir,
      timeout,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });

    const after = snapshotFiles(workingDir);
    const changed = diffFiles(before, after);

    return { success: true, output: output.slice(0, 4000), error: null, filesChanged: changed };
  } catch (err) {
    const after = snapshotFiles(workingDir);
    const changed = diffFiles(before, after);

    const msg = err instanceof Error ? err.message : String(err);
    // Extract stderr/stdout from execSync error
    const execErr = err as { stdout?: string; stderr?: string };
    const detail = execErr.stderr ?? execErr.stdout ?? msg;
    return { success: false, output: "", error: String(detail).slice(0, 2000), filesChanged: changed };
  }
}
