# PHASE 11 — READ-ONLY AUDIT

> Status: **AUDIT COMPLETE — STOP / REVIEW before implementation.**
> This document classifies findings from a read-only audit of the SCAFFOLD
> codebase (frozen research internals + Phase 10 public runtime). No files were
> modified. Classification: BLOCKER / HIGH / MEDIUM / LOW / READY.

## 0. Scope & method

Audited (read-only) all `src/**` modules, `package.json`, `tsconfig*.json`,
`.gitignore`, `tests/**`, `scripts/**`, `benchmarks/**`, `examples/**`, and root
docs. Verified baseline: **229/229 tests pass** (15 files), `npm run typecheck`
clean, `npm run build` clean, and no hard-coded absolute local paths in `src/`.

The frozen research path (`src/benchmark/*`, `benchmarks/*runner.ts`) uses the
raw frozen `runScaffoldLoop` + `createExecutor` and is fully independent of the
Phase 10/11 public runtime (`src/runtime.ts`, `src/tools.ts`). Findings below
therefore apply to the **public/runtime** surface, and all planned fixes live in
the public path so the frozen research path stays byte-identical.

## 1. Findings

### BLOCKER

- **B1 — Path traversal in frozen `executor.ts`** (`executeInspect`, line 67;
  `executeEdit`, line 153): `path.resolve(workingDir, action.target)` is not
  checked for containment against `workingDir`. A model action such as
  `inspect TARGET:../../secret.txt` or `edit TARGET:../outside.txt` escapes the
  workspace with read/write access. `executeEdit` also `mkdirSync(recursive)`
  so it can create directories outside the workspace. Applies to the public
  runtime, which reuses `createExecutor`.
- **B2 — Arbitrary command execution in frozen `executor.ts`** (`executeRun`,
  line 186): `execSync(action.target, { cwd: workingDir })` runs any command
  with the OS user's privileges. No allowlist, no sandbox, no workspace
  containment. Command stdout/stderr flows into state -> feedback -> model
  context, and into error strings, so a command can read or leak secrets.

### HIGH

- **H1 — `diffFiles` uses `process.cwd()` instead of the workspace** (`executor.ts`,
  line 39): in `executeEdit`/`executeRun` the changed-file set is computed
  relative to the *process* cwd, not `workingDir`. When the runtime is embedded
  in a host whose cwd differs from the workspace, `filesChanged` paths are
  absolute/incorrect, breaking governor + state change detection.

### MEDIUM

- **M1 — `DEFAULT_CONFIG.workingDirectory: process.cwd()`** (`config.ts`, line 26):
  the file/command executor defaults to the importing process's cwd, resolved at
  import time. Not a hard-coded absolute path (dynamic), but callers must set an
  explicit workspace root for a project-agnostic, security-relevant boundary.
  Existing public-API tests rely on this default, so it is kept but documented.
- **M2 — No explicit secret redaction**: executor output (`inspect`, `search`,
  `run` stdout/stderr) and error text flow into feedback/context and into the
  returned result/error strings. `ScaffoldError.toSafeString()` is already safe
  (typed message only), but raw tool output is not redacted before reaching the
  model context, logs, or host.
- **M3 — Frozen-file boundary**: `executor.ts`, `scaffold-loop.ts`,
  `system-prompt.ts` are frozen and must not be modified. Workspace/security
  hardening must be layered on the public path via a wrapper, leaving the frozen
  path byte-identical.

### LOW

- **L1 — `context-selector.ts` re-implements `estimateTokens`** (duplicate of
  `context-budget.ts`). Not used by the runtime; pure research/internal.
- **L2 — `run` uses `stdio: ["pipe","pipe","pipe"]` + `windowsHide`** (already
  decent); no `env` sanitization. Under the public path we do not invoke
  untrusted commands without the caller opting in.

### READY (already correct — no change)

- Public API isolation: `src/index.ts` exports a clean surface; internals
  (`state-manager`, `context-selector`, `governor`, `retriever`, `feedback`,
  `scaffold-loop` internals) are not re-exported.
- `createScaffold` + `.execute` API exists; `Qwen3Adapter`/`MiniLMAdapter`
  injectable with default-preserving `baseUrl`.
- Context budget enforced at 4096 (`inputBudget = window - reservedOutput`).
- Frozen validated defaults all present: `qwen3:4b-instruct`, `all-minilm:latest`,
  contextWindow 4096, temperature 0.1, maxActions 20, maxOutputTokens 256,
  endpoint `http://localhost:11434`, retrieval `RETRIEVAL_75`.
- Runtime does not consume `process.env`/`process.argv`; no hard-coded absolute
  local paths in `src/`; `.gitignore` covers `.env`, `dist/`, logs.

## 2. Planned Phase 11 changes (public path only; frozen files untouched)

1. `src/workspace.ts` — `resolveWithinWorkspace(workspaceDir, target)`:
   containment check rejecting `../` escapes, absolute escapes, and symlink
   escapes; returns a safe absolute path or throws.
2. `src/secure-executor.ts` — `createSecureExecutor(base, workspaceDir)`:
   wraps the frozen executor; pre-validates `inspect`/`search`/`edit` targets
   (B1), post-filters `filesChanged` to workspace-relative (H1), and, for `run`
   (B2), makes command output + changed-file reporting workspace-relative and
   documents the callers' responsibility for command policy.
3. `src/redact.ts` — secret redaction applied to tool output, feedback, context,
   and error strings (M2).
4. Wire `createSecureExecutor` + `redact` into `src/runtime.ts` (public path
   only; benchmarks unaffected) and expose a `run` alias on the `Scaffold` API.
5. `src/index.ts` — export new modules/types; optional config flags for
   workspace containment + redaction.
6. New tests: `tests/workspace.test.ts`, `tests/secure-executor.test.ts`,
   `tests/redact.test.ts` (existing 15 test files preserved).
7. Generic `examples/basic-project/` (no secrets, no benchmark terms).
8. Update `README.md` (usage) + `PROGRESS.md`.
9. Verify: `npm test` / `npm run typecheck` / `npm run build`, secret scan,
   integrity check vs `PHASE10-INTEGRITY-MANIFEST.md`, then write
   `benchmarks/PHASE11-REPORT.md` ("PRODUCTIZATION COMPLETE").

## 3. Decision point

**STOP for review per execution policy.** BLOCKERS B1/B2 and HIGH H1 are to be
resolved via the public-path wrapper (never by editing frozen files). M1 is kept
as a dynamic default with documentation. M2/M3 are mitigated by redaction and by
keeping the boundary in the public wrapper. Confirm before implementation.
