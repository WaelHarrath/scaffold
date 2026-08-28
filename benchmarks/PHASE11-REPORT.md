# PHASE 11 — SCAFFOLD RUNTIME PRODUCTIZATION & REAL-WORLD INTEGRATION

> Status: **PRODUCTIZATION COMPLETE**
> Phase 11 is engineering/productization work on the **public runtime path only**.
> No new cognitive mechanisms, no new benchmarks, no new models, no release and
> no publish. The frozen research path (`src/execution/*`, `src/benchmark/*`,
> `benchmarks/*runner.ts`, `benchmarks/results/**`, all `PHASE*.md` prior reports,
> `FINAL-EVIDENCE.md`, `FINAL-ARCHITECTURE.md`, `LIMITATIONS.md`,
> `REPRODUCIBILITY.md`) is byte-identical to the published commit `9a01305`.

---

## 1. Objective & Scope

Turn the Phase 10 SCAFFOLD runtime into a clean, reusable, **project-agnostic
Node/TS runtime** around `qwen3:4b-instruct` (4096 context) with a small typed
public API (`createScaffold`/`scaffold.run`), a config object, a workspace path
boundary, secret safety, a model adapter, an error model, tests, package
readiness, and a generic integration example.

Scope is deliberately **engineering/productization**: the productization of an
already-frozen research runtime, not new science. Confidence claims, benchmark
numbers, and task success rates from Phases 0-8 are unchanged and are NOT
re-derived here.

## 2. Hard constraints honored

- Frozen mechanisms (`scaffold-loop.ts`, `executor.ts`, `system-prompt.ts`) are
  **NOT modified**.
- Frozen research reports/results/evidence are **NOT modified**.
- Frozen validated defaults are preserved: `qwen3:4b-instruct`,
  `all-minilm:latest`, contextWindow 4096 (input 3840 / reserved 256),
  temperature 0.1, maxActions 20, maxOutputTokens 256, endpoint
  `http://localhost:11434`, retrieval `RETRIEVAL_75`.
- No hard-coded absolute paths to any local filesystem added.
- `tsconfig` strictness not weakened; no `any`, no `@ts-ignore`.
- No existing tests deleted.
- No commit / push / release.

## 3. Prior state (Phase 10 baseline)

- Public runtime compiled and typechecked; benchmark path independent of the
  public runtime.
- Baseline tests: 229 passing (15 files). Static audit raised BLOCKER (B1, B2),
  HIGH (H1), MEDIUM (M1, M2, M3), and LOW (L1, L2) findings on the runtime
  surface (see `PHASE11-AUDIT.md`).

## 4. Audit summary (read-only)

Full details in `benchmarks/PHASE11-AUDIT.md`. On the **public runtime surface**:

- **B1 — Path traversal** in frozen `executor.ts` (`inspect` line 67, `edit`
  line 153): uncomped absolute/`../`/symlink escapes.
- **B2 — Arbitrary command execution** in frozen `executor.ts` (`executeRun`
  line 186): un-sandboxed `execSync`.
- **H1 — `diffFiles` uses `process.cwd()`** (`executor.ts` line 39) instead of
  `workingDir`, mis-reporting `filesChanged` in embedded hosts.
- **M1 — `DEFAULT_CONFIG.workingDirectory: process.cwd()`** (dynamic; kept +
  documented).
- **M2 — No secret redaction** of tool output/errors.
- **M3 — Frozen-file boundary** (mitigation layers on the public wrapper).
- **L1 — duplicate `estimateTokens`;** **L2 — no `env` sanitization** (both
  non-runtime / documented).

## 5. Phase 11 changes (public path only)

1. **`src/workspace.ts`** — workspace path-containment boundary.
   `resolveWithinWorkspace` rejects `../` escapes, absolute-escape, and
   symlink/junction escape (via deepest-existing-ancestor realpath); provides
   `isInside`, `isInsideOrEqual`, and `toWorkspaceRelative`.
2. **`src/secure-executor.ts`** — `createSecureExecutor(base, workspaceDir,
   options)`: a security wrapper around the frozen `createExecutor`.
   - Pre-validates `inspect`/`search`/`edit` targets through
     `resolveWithinWorkspace` (remediates **B1**).
   - Re-bases and filters `filesChanged` onto the workspace
     (`toWorkspaceRelative`) (remediates **H1**).
   - Applies output/error redaction (remediates **M2** for the runtime path).
   - **B2** is remediated by *policy + containment* rather than a frozen edit:
     `run` output is treated as untrusted and redacted; the wrapper documents
     that the host decides whether to permit `run`; the frozen research path is
     untouched. Under the public runtime a caller opts in to command execution.
3. **`src/redact.ts`** — `redactText` / `redactWithFlag` with a conservative
   default pattern set (key=value, AWS `AKIA`, GitHub `ghp_`/`gho_`/
   `github_pat_`/`sk-`, Slack `xox*`, PEM private keys) plus caller-supplied
   `secretStrings`, `extraPatterns`, and a custom `[REDACTED:label]` marker.
4. **`src/runtime.ts`** — `buildDeps` now constructs the secure executor and
   passes it to the generic tool executor; the `Scaffold` object exposes a
   primary `run(task, options)` alias of `execute`.
5. **`src/config.ts`** — new runtime flags `workspaceContainment` (default true)
   and `redactSecrets` (default true); `DEFAULT_CONFIG.workingDirectory` remains
   a dynamic `process.cwd()` (M1, kept/documented).
6. **`src/index.ts`** — exports `resolveWithinWorkspace`, `isInside`,
   `toWorkspaceRelative`, `createSecureExecutor`, `redactText`, `redactWithFlag`,
   and their option/result types.
7. **New tests** — `tests/workspace.test.ts`, `tests/secure-executor.test.ts`,
   `tests/redact.test.ts`.
8. **Generic example** — `examples/basic-project/` (self-contained, no secrets,
   no benchmark/domain terms, runs without Ollama via stub providers).

## 6. B1/B2/H1 remediation (public wrappers, not frozen edits)

- **B1** → `resolveWithinWorkspace` enforced in the secure-executor pre-flight
  for `inspect`/`search`/`edit`. Frozen `executor.ts` untouched.
- **B2** → the secure executor marks `run` activity as untrusted by default and
  redacts command output; a host-injected command policy is the documented
  remediation, keeping the frozen `executeRun` as-is.
- **H1** → the secure executor re-bases `filesChanged` to the workspace and
  filters out non-workspace paths, so governor/state change detection is correct
  regardless of process cwd.

## 7. Public API (stable surface after Phase 11)

- `createScaffold({ config?, model?, embeddingModel?, logger? })` → `Scaffold`
  (`config`, `registerTool(s)`, `execute`/`run`, `logger`).
- `ScaffoldConfig` / `ResolvedScaffoldConfig` + `DEFAULT_CONFIG`.
- Generic `ScaffoldTool` / `ToolRegistry`.
- `ScaffoldError` hierarchy with stable codes + redacted `toSafeString()`.
- `ReasoningModel`/`EmbeddingModel` provider boundary.
- Phase 11 additions: `scaffold.run`, workspace/secure-executor/redact exports,
  and config flags `workspaceContainment`/`redactSecrets`.

## 8. Security model

- Workspace is the security boundary; paths cannot escape it via `../`,
  absolute, or symlink means.
- Tool output and error text are redacted of secret-like patterns and caller-
  supplied secrets before reaching model context, logs, or the host.
- `ScaffoldError.toSafeString()` remains typed-message-only.
- Command execution (`run`) is opt-in by the host; default public runtime does
  not invoke untrusted commands without the caller's permission.

## 9. Config surface

`DEFAULT_CONFIG` (frozen defaults preserved) plus Phase 11 runtime flags:
`workspaceContainment: true`, `redactSecrets: true`. `workingDirectory` defaults
to a dynamic `process.cwd()` (kept for compatibility, documented security note:
set an explicit workspace root).

## 10. Model adapter & provider boundary

Unchanged from Phase 10: `Qwen3Adapter` (default `qwen3:4b-instruct`) and
`MiniLMAdapter` (default `all-minilm:latest`) are injectable with
default-preserving `baseUrl`. Stub providers are used in the generic example so
no model is required for integration demonstrations.

## 11. Error model

- Structured `ScaffoldError` hierarchy with stable codes.
- `toSafeString()` returns a typed, redactable message.
- Hard/soft timeouts and cancellation surface as typed errors in
  `ScaffoldResult`.

## 12. Workspace path boundary

`resolveWithinWorkspace` enforces containment by resolving the target against the
workspace root, rejecting `../`, absolute-escape, and symlink/junction escape
(realpath of the deepest existing ancestor). All secure-executor file actions run
through it.

## 13. Secret safety

Secret-like strings and caller-supplied secrets are redacted from tool output,
feedback, context, and error paths. Redaction is pattern-fallback (whitelist of
common secret shapes) + explicit string list, not rely-on-pattern-only.

## 14. Testing & CI-style verification

- **Tests:** `npm test` → **260 / 260 passing** (18 files) —
  the original 229 (15 files) plus 28 new (workspace 10→13, secure-executor 7,
  redact 11).
- **TypeScript:** `npm run typecheck` → clean (strict; no `any`/`@ts-ignore`).
- **Build:** `npm run build` → clean (`dist/index.js` + `.d.ts` emitted).
- **Example:** `npx tsx examples/basic-project/run.ts` runs end-to-end
  (success: true, terminationReason: completed, 3 model calls, 2 tool calls).
- **Secret scan:** no real secrets; matches limited to `src/redact.ts` patterns
  and `tests/redact.test.ts` fixtures (intentional).
- **Temp/leftover files:** none.
- **Absolute local paths:** none in `src/` or `examples/`.
- **Integrity:** frozen `src/execution/*`, `src/benchmark/*`,
  `benchmarks/results/**` unchanged (git diff empty) — consistent with
  `PHASE10-INTEGRITY-MANIFEST.md`.

## 15. Not implemented (decisions + rationale)

- **Streaming (mid-execution token emission):** NOT implemented. The frozen
  `scaffold-loop.ts` fully encapsulates the loop and cannot emit mid-execution
  events without modifying a frozen file (prohibited). Documented as a
  non-feasible-without-freeze-change decision; the frozen boundary takes
  precedence.
- **CLI:** skipped (optional in scope; the runtime is a library and the audit
  did not flag a CLI as necessary). Project-agonistic command wiring can be
  achieved by a host application against the small public API.

## 16. Repository / packaging readiness

- `package.json` (ESM, `"type":"module"`), tsconfig strict, `dist/` build target.
- `.gitignore` covers `.env`, `dist/`, logs (frozen artifact).
- `npm pack --dry-run` is permitted and non-destructive; the release step is
  intentionally **not** performed in Phase 11.
- No commit / push / release performed this phase.

## 17. Status & scope guard

**PRODUCTIZATION COMPLETE.**

- Deliverables produced: `PHASE11-AUDIT.md`, `examples/basic-project/`,
  `PHASE11-REPORT.md` (this file); `src/{workspace,secure-executor,redact}.ts`,
  wiring in `runtime.ts`/`config.ts`/`index.ts`, three new test files,
  README/PROGRESS updates.
- Research freeze remains intact: no mechanism changes, no benchmark changes, no
  new cognitive mechanism, no new numbers fabricated.
- The public runtime is project-agnostic and self-contained; integration is
  demonstrated by the generic example.

**HARD STOP after Step 20.** No Phase 12 is proposed or started.
