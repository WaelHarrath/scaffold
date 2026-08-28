# Phase 10 — General-Purpose Runtime Productization

**Project:** SCAFFOLD (frozen research v2)
**Date:** 2026-08-28
**Status: PASS**

Phase 10 turns the frozen SCAFFOLD research prototype into a clean, general-purpose,
domain-agnostic runtime library around the validated model pipeline
(`qwen3:4b-instruct` reasoning + `all-minilm:latest` embedding), exposing a stable
public API without touching any frozen research mechanism.

---

## 1. Objective & Scope

Turn the frozen prototype into a reusable runtime:

- A stable, documented **public API** (`createScaffold(...).execute(...)`).
- A **generic tool system** (host-supplied tools; no hard-coded domain tools).
- A **model-provider abstraction** with a configurable endpoint.
- **Configuration validation** with the frozen validated defaults.
- **Structured errors** (typed `ScaffoldError` hierarchy with stable codes).
- **Cancellation & timeout** (`AbortSignal` + per-execution timeout).
- **Observability & security-safe logging** (execution ids, counts, redaction).
- **Tests and documentation.** No git push / commit / release.

### Hard constraints honored
- **No** new cognitive mechanisms, planning, memory, reflection, or adaptive
  retrieval (adaptive retrieval remains NOT SUPPORTED — frozen).
- **No** new models, benchmarks, or benchmark results.
- Frozen defaults unchanged: model `qwen3:4b-instruct`, embedding
  `all-minilm:latest`, contextWindow 4096, temperature 0.1, maxActions 20,
  maxOutputTokens 256, endpoint `http://localhost:11434`.
- `tsconfig` strictness unchanged; no `any`/`@ts-ignore`.
- Domain-agnostic: `src/` + examples/tests contain no CSR/ESG/KPI/governance/
  compliance/sustainability domain references (verified by scan).
- No git push/commit/release. Stop at the end.

---

## 2. Baseline Gate (pre-change)

Before any Phase 10 work, the frozen baseline was verified:

- `npm test` → **11 files / 175 tests passing**
- `npm run typecheck` → clean
- `npm run build` → clean (pre-existing runtime was research-only; no public API)

---

## 3. Audit Summary (read-only findings)

- Model abstraction was already provider-separated (`ReasoningModel`/`EmbeddingModel`
  interfaces + `Qwen3Adapter`/`MiniLMAdapter`).
- **No public API / entry point existed**; no error model; no config validation;
  no `AbortSignal`/timeout; no execution id; no security-safe logging.
- Loop uses fixed 5-action grammar (`inspect`/`search`/`edit`/`run`/`finish`);
  executor is generic and domain-agnostic.
- Benchmark separation already exists via `src/benchmark/`.

---

## 4. Public API (stable surface)

Everything below is exported from the single entry point `src/index.ts` (compiled
to `dist/index.js` + `dist/index.d.ts`).

```ts
import { createScaffold, TimeoutError, CancelledError } from "scaffold";

const scaffold = createScaffold({
  config: { contextWindow: 4096, maxActions: 20, executionTimeoutMs: 120_000 },
});

scaffold.registerTool({
  name: "query_database",
  execute: async (input) => ({ success: true, output: "rows=5", error: null }),
});

const result = await scaffold.execute("Summarize the workspace.");
// result: success, response, actions, errors, durationMs, model, modelCalls,
// toolCalls, tokenEstimates, retrievalStats, terminationReason, executionId,
// toolExecutions
```

### Exported concepts
- `createScaffold(options)` → `Scaffold` (`config`, `registerTool`, `registerTools`,
  `execute`, `logger`)
- `ScaffoldRuntimeConfig` / `ResolvedScaffoldConfig`, `DEFAULT_CONFIG`, defaults,
  `validateScaffoldConfig`, `resolveConfig`
- `ScaffoldTool`, `ToolResult`, `ToolRegistry`, `ToolInvocationResult`,
  `createToolRegistry`, `createToolExecutor`, `toExecutionResult`
- `ScaffoldError` + subclasses and `ScaffoldErrorCode`
- `Logger` / `LogLevel`, `createLogger`, `isLogLevel`
- `ReasoningModel`, `EmbeddingModel`, `ModelRequest`, `ModelResponse`,
  `TokenUsage`, `Qwen3Adapter`, `MiniLMAdapter`
- `ScaffoldResult`, `ExecuteOptions`, `CreateScaffoldOptions`

Internal modules (state-manager, context-selector, governor internals, retriever
internals, feedback formatter internals, scaffold-loop internals) are **not**
part of the public surface.

---

## 5. What Was Built

| Module | Responsibility |
|---|---|
| `src/config.ts` | Runtime config defaults (frozen validated values) + validation. |
| `src/errors.ts` | `ScaffoldError` base + typed subclasses with stable codes + `toSafeString()` (redacted). |
| `src/tools.ts` | Generic `ScaffoldTool`/`ToolRegistry` + `createToolExecutor` dispatch seam (additive wrapper over the frozen executor) + invocation tracking. |
| `src/logger.ts` | Security-aware logging abstraction (levels, silent mode, custom sink). |
| `src/runtime.ts` | Runtime wiring: resolves config, injects adapters, builds retrieval, wraps the frozen `runScaffoldLoop`, applies timeout/cancellation, returns structured `ScaffoldResult`. |
| `src/index.ts` | Single public-API entry point. |
| `examples/` | `basic.ts`, `tools.ts`, `assistant.ts` — public-API usage. |
| `tests/` | 4 new test files (52 tests); preserved all 175. |

### Tool system design
- **Domain-agnostic:** SCAFFOLD has no opinion about tool behavior; hosts register
  tools by name + `execute`.
- **Dispatch:** when the model emits a `run <name> ...` action whose first token
  matches a registered tool, the tool is invoked (remainder JSON-parsed if
  parseable, else raw string); otherwise the frozen default executor runs.
- **Failure normalization:** a tool result/exception is never silently a success;
  failures reach the loop as structured `ExecutionResult` objects and are surfaced
  in `ScaffoldResult.errors` / `toolExecutions` with no secret exposure.

### Cancellation & timeout
- `execute(task, { signal })` — a pre-aborted or mid-run abort rejects with
  `CancelledError` (`code: "CANCELLED"`).
- `config.executionTimeoutMs` (default 120 s; `0` disables) — expiry rejects with
  `TimeoutError` (`code: "TIMEOUT"`).
- Host-level cancel is race-based over the frozen loop (the frozen loop has no
  cooperative cancel hook); the caller is released promptly. Documented limitation.

### Observability & security-safe logging
- Each execution has a stable `executionId`.
- `ScaffoldResult` carries model/final response, actions, errors, duration,
  modelCalls, toolCalls, tokenEstimates, retrievalStats, terminationReason,
  and tool execution summaries.
- The logger never logs credentials, auth headers, full prompts, or full tool
  payloads; model failure is logged as a short safe message.
- `ScaffoldError.toSafeString()` emits only `code` + `message` (never `causeDetail`
  secrets).

---

## 6. Verification

### Tests: **227 / 227 passing** (15 files)
- 175 existing (frozen) tests preserved — **no regressions**.
- 52 new tests: config validation & defaults; error hierarchy & safety; tool
  registry/dispatch/failure/JSON-args; runtime success/exhausted/tool results;
  model failure → `ModelError`; timeout → `TimeoutError`; cancellation → `CancelledError`;
  disabled mechanisms; retrieval stats; logging security (no secret leakage, level
  filtering, silent mode).

### TypeScript: `npm run typecheck` → clean (strict; no `any`/`@ts-ignore`)

### Build: `npm run build` → clean (`dist/index.js` + `.d.ts` emitted)

### Examples: typechecked via `tsc --noEmit` (clean)

### Domain scan
`src/`, `examples/`, and new tests contain **no** CSR/ESG/KPI/governance/compliance/
sustainability/carbon/scorecard/materiality references (confirmed by grep).

### Secret scan
No real secrets introduced. The only secret-pattern strings are security-model doc
comments and test fixtures deliberately asserting that secrets are **not** leaked.

### Integrity
See [`PHASE10-INTEGRITY-MANIFEST.md`](./PHASE10-INTEGRITY-MANIFEST.md). All frozen
research files (`FINAL-ARCHITECTURE.md`, `LIMITATIONS.md`, `REPRODUCIBILITY.md`,
`src/execution/{scaffold-loop,executor,system-prompt}.ts`, all `benchmarks/results/**`)
are byte-identical to the published commit (SHA-256 recorded). The only tracked-file
modifications are the two additive, default-preserving `baseUrl` constructor params
in `qwen3.ts`/`embedding.ts` and package metadata.

---

## 7. Working-tree status (do NOT push)

- **Modified (tracked):** `package.json`, `src/model/qwen3.ts`, `src/model/embedding.ts`
  — all additive/default-preserving or metadata.
- **Untracked (new):** `src/config.ts`, `src/errors.ts`, `src/logger.ts`,
  `src/tools.ts`, `src/runtime.ts`, `src/index.ts`, `tests/{config,errors,tools,runtime}.test.ts`,
  `examples/{basic,tools,assistant}.ts`, `PHASE10-REPORT.md`,
  `PHASE10-INTEGRITY-MANIFEST.md`, `PROGRESS.md` (Phase 10 entry).
- **No commit, no push, no release** was made.

---

## 8. Status

**PASS** — the frozen SCAFFOLD research prototype has been productized into a
general-purpose runtime with a stable public API, generic tool system, model-provider
abstraction, config validation, structured errors, cancellation/timeout,
observability, security-safe logging, tests, and documentation. All frozen research
behavior and artifacts are preserved and verified byte-identical.

**Documented limitations**
- Cancellation is host-level/race-based (the frozen loop has no cooperative cancel
  hook); a running model call is not forcibly interrupted.
- Retrieval is best-effort: if the embedding model is unavailable it degrades to
  empty retrieval with a logged warning rather than failing the task.
- Retrieval scans a depth-limited workspace tree (skips `node_modules`, `.git`,
  `dist`, `.cache`, `coverage`); very large monorepos may be slow to scan.
