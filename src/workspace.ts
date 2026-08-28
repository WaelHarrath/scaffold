import * as fs from "node:fs";
import * as path from "node:path";
import { ExecutionError } from "./errors.js";

/**
 * Workspace path containment for the public SCAFFOLD runtime.
 *
 * The frozen research executor resolves action targets with
 * `path.resolve(workingDir, target)` and never verifies the result stays inside
 * the workspace, so a model action like `inspect TARGET:../../secret.txt` can
 * read (or `edit` can write) files outside the sandbox. This module provides a
 * robust containment check that is layered on the PUBLIC runtime path only; the
 * frozen executor and the frozen benchmark runner are untouched.
 */

export interface WorkspaceResolveOptions {
  /**
   * If true, additionally resolves symlinks (via `fs.realpathSync`) on the
   * deepest existing ancestor and rejects if that real path escapes the
   * workspace. Default true.
   */
  readonly followSymlinks?: boolean;
  /**
   * If true, rejects absolute targets outright (the model is expected to emit
   * workspace-relative paths). Default false (absolute paths that still resolve
   * inside the workspace are allowed).
   */
  readonly requireRelative?: boolean;
}

/**
 * Resolve `target` against `workspaceDir`, guaranteeing the result is strictly
 * inside the workspace. Throws {@link ExecutionError} on any escape attempt
 * (`../`, absolute escape, or symlink escape).
 */
export function resolveWithinWorkspace(
  workspaceDir: string,
  target: string,
  options: WorkspaceResolveOptions = {},
): string {
  const { followSymlinks = true, requireRelative = false } = options;
  if (!workspaceDir) {
    throw new ExecutionError("workspace directory is empty");
  }
  if (!target || typeof target !== "string") {
    throw new ExecutionError("action target is empty");
  }

  const root = path.resolve(workspaceDir);
  if (requireRelative && path.isAbsolute(target)) {
    throw new ExecutionError(
      `absolute path escapes the workspace sandbox (target "${target}")`,
    );
  }

  const resolved = path.resolve(root, target);
  if (!isInside(root, resolved)) {
    throw new ExecutionError(
      `target "${target}" resolved outside the workspace sandbox`,
    );
  }

  if (followSymlinks) {
    const realRoot = realpathOrNull(root);
    const realResolved = realpathOfDeepestAncestor(resolved);
    if (realRoot && realResolved && !isInsideOrEqual(realRoot, realResolved)) {
      throw new ExecutionError(
        `target "${target}" escapes the workspace via a symlink`,
      );
    }
  }

  return resolved;
}

/** True if `candidate` is strictly inside the `root` directory (not equal). */
export function isInside(root: string, candidate: string): boolean {
  const rel = path.relative(path.resolve(root), path.resolve(candidate));
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

/** True if `candidate` is inside `root` OR equal to it. */
function isInsideOrEqual(root: string, candidate: string): boolean {
  const rel = path.relative(path.resolve(root), path.resolve(candidate));
  return rel !== ".." && !rel.startsWith("..") && !path.isAbsolute(rel);
}

/**
 * Resolve the real path of the deepest existing ancestor of `p`, so that
 * symlink/junction escapes are detected even when the target leaf does not yet
 * exist (e.g. an edit targeting a not-yet-created file inside a symlinked dir).
 * Returns null when no ancestor (including `p` itself, up to the filesystem
 * root) resolves.
 */
function realpathOfDeepestAncestor(p: string): string | null {
  let current = path.resolve(p);
  const root = path.parse(current).root;
  for (;;) {
    const real = realpathOrNull(current);
    if (real !== null) return real;
    if (current === root) return null;
    current = path.dirname(current);
  }
}

/** Best-effort realpath; returns null when the path does not exist yet. */
function realpathOrNull(p: string): string | null {
  try {
    return fs.realpathSync(p);
  } catch {
    return null;
  }
}

/**
 * Convert an absolute path produced by the frozen executor's `diffFiles` into a
 * workspace-relative path when possible. The frozen executor reports changed
 * files relative to `process.cwd()`, which is wrong when the host cwd differs
 * from the workspace; this re-bases those paths onto the workspace for stable,
 * portable reporting.
 */
export function toWorkspaceRelative(workspaceDir: string, absolutePath: string): string {
  const root = path.resolve(workspaceDir);
  const abs = path.resolve(absolutePath);
  const rel = path.relative(root, abs);
  if (rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel)) {
    return rel;
  }
  return abs;
}
