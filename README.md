<p align="center">
  <img src="assets/logo-scaffold.png" alt="SCAFFOLD" width="480">
</p>

# SCAFFOLD

**An experimental execution and context-management runtime for small reasoning models.** This research focuses specifically on improving the **effective reliability** of `qwen3:4b-instruct` under a tight 4096-token context window.

> **Status: RESEARCH FREEZE COMPLETE** — the research program is frozen. This repository is a preserved research artifact, not an actively developed product.
>
> **Phase 10 (engineering):** the frozen prototype has also been packaged as a general-purpose, domain-agnostic runtime with a stable public API (`createScaffold(...)`), a generic tool system, config validation, structured errors, cancellation/timeout, and security-safe logging — **without** changing any frozen research mechanism. See [`PHASE10-REPORT.md`](./PHASE10-REPORT.md).
>
> **Phase 11 (productization):** adds a workspace path-containment boundary, a secure-executor wrapper, secret redaction, and `scaffold.run(...)` — all on the public runtime path, leaving the frozen research internals byte-identical. See [`benchmarks/PHASE11-REPORT.md`](./benchmarks/PHASE11-REPORT.md) and [`benchmarks/PHASE11-AUDIT.md`](./benchmarks/PHASE11-AUDIT.md).

---

## What Is SCAFFOLD?

SCAFFOLD is a lightweight, deterministic execution and context-management layer that sits **between** a reasoning model and a workspace. It does **not** modify the model. It provides structure around the model: deterministic state tracking, formatted feedback, semantic retrieval, action governance, and execution control.

- **qwen3:4b-instruct** — reasoning and action selection only
- **all-minilm:latest** — semantic embedding and retrieval only
- **SCAFFOLD** — deterministic state, feedback, retrieval, governor, and execution management

## The Research Question

> **Can deterministic software infrastructure compensate for the specific reasoning/reliability deficits of a small model — without changing the underlying model?**

SCAFFOLD treats the model as fixed and asks whether careful, deterministic management of the execution loop (state, feedback, retrieval, and action execution) can make a small model *reliably usable* for structured tasks, even if the model's intrinsic capability is unchanged.

## Architecture

```
TASK → STATE → RETRIEVE → CONTEXT BUDGET → QWEN3 4B → ACTION
      → GOVERNOR → EXECUTOR → FEEDBACK → STATE UPDATE → NEXT DECISION
```

```mermaid
flowchart LR
    A[TASK] --> B[STATE]
    B --> C[RETRIEVE]
    C --> D[CONTEXT BUDGET]
    D --> E[QWEN3 4B]
    E --> F[ACTION]
    F --> G[GOVERNOR]
    G -->|reject| FB[FEEDBACK]
    G -->|allow| H[EXECUTOR]
    H --> I[FEEDBACK]
    I --> J[STATE UPDATE]
    J --> B
```

The frozen pipeline: `TASK → STATE → RETRIEVE → CONTEXT BUDGET → QWEN3 4B → ACTION → GOVERNOR → EXECUTOR → FEEDBACK → STATE UPDATE → NEXT DECISION`.

See **[`FINAL-ARCHITECTURE.md`](./FINAL-ARCHITECTURE.md)** for the consolidated canonical pipeline and the full mechanism classification.

## Mechanisms

All mechanisms are **runtime infrastructure around the model** — none modify the model's weights; none change its intrinsic reasoning capability.

| Mechanism | Role | Classification |
|---|---|---|
| **MODEL** | `qwen3:4b-instruct`, fixed prompt contract, action-selection only | External reasoning model |
| **STATE** | Execution memory (task, goals, files, progress, history) formatted into context | Deterministic runtime |
| **FEEDBACK** | Structured format of execution/governor results fed back to the model | Deterministic runtime |
| **RETRIEVAL** | Semantic content selection (embed → cosine rank → top-K) with budgeted admission | Deterministic runtime |
| **GOVERNOR** | Deterministic guard-rails (duplicate, noop-limit, failed-replay prevention) | Deterministic runtime |
| **EXECUTOR** | Deterministic file/command action execution | Deterministic runtime |

## Frozen Model Configuration

The configuration is fixed and measured only with these models:

| Role | Model |
|---|---|
| Reasoning | `qwen3:4b-instruct` |
| Embedding / retrieval | `all-minilm:latest` |

- **Context window:** 4096 tokens (3840 input / 256 reserved output)
- **Temperature:** 0.1
- **Max actions per task:** 20

No other models are claimed to be supported.

## Research Findings

All figures below are taken verbatim from the phase reports and consolidated in **[`benchmarks/FINAL-EVIDENCE.md`](./benchmarks/FINAL-EVIDENCE.md)**. Across **4200 executions** (Phases 1-8):

### Experimentally supported
- The full SCAFFOLD stack raises `qwen3:4b-instruct` task completion from a ~10% raw-model baseline to the ~46-50% range (Phases 1-4, repeated).
- **FEEDBACK** is independently effective on its own (Phase 3: +20pp; Phase 4: FEEDBACK_ONLY 30%).
- **RETRIEVAL** is independently effective on its own (Phase 3: +20pp; Phase 4: +10pp).
- **STATE** is the decisive increment **within the full stack** (Phase 5 causal trace: only STATE differs between the near-full and full configurations; binding hard tasks flip).
- `RETRIEVAL_75` (a 75% retrieval-admission budget) is Pareto-superior to FULL on completion, calls, tokens, and latency (Phase 6) with zero regressions.

### Partially supported
- FULL vs RETRIEVAL_75 parity (Phase 7, n≈200 per arm): no statistically significant completion difference (McNemar p = 1.0; CI [-1.7%, +2.7%]); RETRIEVAL_75 remains the recommended lean default.

### Not supported
- STATE **alone** or GOVERNOR **alone** improving completion (Phase 3).
- Compressing STATE/FEEDBACK to save cost without loss (Phase 6).
- Aggressive retrieval reduction (`RETRIEVAL_MIN`) — degrades hard tasks (Phase 6).
- **Adaptive retrieval** (Phase 8): no file exceeds the base slice, so adaptive policies never trigger and ship byte-identical payloads to RETRIEVAL_75 (NOT SUPPORTED).
- "Increased intrinsic reasoning", "generalization to arbitrary small models".

## Final Conclusion

> SCAFFOLD demonstrates experiment-supported, model-specific improvements in the **effective reliability** of `qwen3:4b-instruct` through deterministic management of **state, feedback, retrieval, and action execution**.

It does **not** demonstrate:
- increased intrinsic model reasoning capability
- general reasoning improvement for arbitrary models
- universal improvement across small language models

See [`LIMITATIONS.md`](./LIMITATIONS.md) for the full boundaries.

## Research Phases

| Phase | Focus |
|---|---|
| **1** | Baseline stack evaluation (MODEL_ONLY / MINIMAL / RETRIEVAL / FULL) |
| **2** | Replication / infrastructure correction |
| **3** | Causal mechanism ablation |
| **4** | Efficiency / minimal-stack investigation |
| **5** | Causal trace analysis — why does the full stack work |
| **6** | Compression experiments (RETRIEVAL_75) |
| **7** | Robustness validation (retrieval-deployment parity) |
| **8** | Adaptive retrieval parity test (negative) |
| **9** | Final audit / research freeze |

See [`PROGRESS.md`](./PROGRESS.md) and the `benchmarks/PHASE*-REPORT.md` files for details.

## Repository Structure

```
.
├── src/                    # Frozen implementation + Phase 10 runtime
│   ├── model/              # Qwen3 + MiniLM adapters
│   ├── cognition/          # Action parsing / validation
│   ├── state/              # Task state representation
│   ├── context/            # Token budget + context selection
│   ├── feedback/           # Feedback formatting
│   ├── execution/          # System prompt, formatters, governor, executor, loop
│   ├── retrieval/          # Similarity, cache, retriever, adaptive budget
│   ├── benchmark/          # Task definitions (30) + runner
│   ├── config.ts           # [P10] runtime config + validation
│   ├── errors.ts           # [P10] structured ScaffoldError hierarchy
│   ├── logger.ts           # [P10] security-aware logging
│   ├── tools.ts            # [P10] generic tool registry + executor seam
│   ├── workspace.ts        # [P11] workspace path-containment boundary
│   ├── secure-executor.ts  # [P11] security wrapper around the frozen executor
│   ├── redact.ts           # [P11] secret redaction for output/errors
│   ├── runtime.ts          # [P10] runtime wiring (execute / cancel / timeout)
│   └── index.ts            # [P10] public API entry point
├── examples/               # [P10/P11] public-API usage
│   ├── basic.ts            #   [P10] basic model usage
│   ├── tools.ts            #   [P10] host-tool usage
│   ├── assistant.ts        #   [P10] assistant-style usage
│   └── basic-project/      #   [P11] generic self-contained integration example
├── benchmarks/             # Phase runners, reports, and research results
│   ├── FINAL-EVIDENCE.md   # Consolidated evidence table
│   ├── PHASE*-REPORT.md    # Phase 1-11 research/engineering reports
│   ├── PHASE11-AUDIT.md    # [P11] read-only productization audit
│   ├── PHASE11-REPORT.md   # [P11] productization report (PRODUCTIZATION COMPLETE)
│   └── results/            # Research evidence (results.json, checkpoint.json, analyses)
├── tests/                  # Vitest unit/regression suite (18 files / 260 tests)
├── scripts/                # Phase entrypoints + report writers
├── assets/                 # Logo
├── ARCHITECTURE.md         # Reference implementation docs
├── FINAL-ARCHITECTURE.md   # Frozen canonical architecture
├── LIMITATIONS.md          # Boundaries of the claims
├── REPRODUCIBILITY.md      # Reproduction guidance
├── PHASE10-REPORT.md       # [P10] engineering release report
├── PHASE10-INTEGRITY-MANIFEST.md # [P10] frozen-artifact integrity hashes
└── PROGRESS.md             # Phase tracker + research freeze + P10 record
```

## Installation / Development

Requires **Node.js** and a running **Ollama** with the frozen models (`qwen3:4b-instruct`, `all-minilm:latest`).

```bash
npm install
npm run build        # compile TypeScript (tsc)
npm run typecheck    # type-check without emitting (tsc --noEmit)
```

## Testing

```bash
npm test             # vitest run (18 files / 260 tests)
npm run test:watch   # vitest watch mode
npm run test:coverage
```

## Engineering / Runtime API (Phase 10)

The frozen prototype is also exposed as a general-purpose, domain-agnostic runtime
library. Full details: [`PHASE10-REPORT.md`](./PHASE10-REPORT.md).

```ts
import { createScaffold, TimeoutError, CancelledError } from "./src/index.js";

const scaffold = createScaffold({
  config: { contextWindow: 4096, maxActions: 20, executionTimeoutMs: 120_000 },
});

// register host-supplied, domain-agnostic tools
scaffold.registerTool({
  name: "query_database",
  execute: async (input) => ({ success: true, output: "rows=5", error: null }),
});

const result = await scaffold.execute("Summarize the workspace");
// { success, response, actions, errors, durationMs, model, modelCalls, toolCalls,
//   tokenEstimates, retrievalStats, terminationReason, executionId, toolExecutions }
```

Key stable API (single entry point `src/index.ts`):
- `createScaffold({ config?, model?, embeddingModel?, logger? })` → `Scaffold`
  (`config`, `registerTool(s)`, `execute`/`run(task, { signal, temperature, maxActions, maxOutputTokens })`, `logger`)
- `ScaffoldConfig` / `ResolvedScaffoldConfig` + `DEFAULT_CONFIG` (frozen validated defaults)
- Generic `ScaffoldTool` / `ToolRegistry` (host tools, dispatched via the model's generic `run` action)
- `ScaffoldError` hierarchy with stable codes and redacted `toSafeString()`
- `Logger`/`LogLevel`, `ReasoningModel`/`EmbeddingModel` provider boundary

**Phase 11 (productization) additions — all on the public runtime path:**
- `scaffold.run(task, options)` — primary alias of `execute`.
- `resolveWithinWorkspace(...)` / `isInside(...)` / `toWorkspaceRelative(...)`
  (`src/workspace.ts`) — workspace path containment (`../`, absolute, symlink escapes).
- `createSecureExecutor(base, workspaceDir, options)` (`src/secure-executor.ts`) —
  security wrapper around the frozen executor: pre-flight target containment,
  workspace-relative `filesChanged` re-basing, and output/error redaction.
- `redactText(...)` / `redactWithFlag(...)` (`src/redact.ts`) — secret redaction.
- New config flags `workspaceContainment` (default true) and `redactSecrets`
  (default true).
- The frozen research executor is **never** modified; the security layer wraps it.

Examples: `npx tsx examples/basic.ts`, `examples/tools.ts`, `examples/assistant.ts`
(require a running Ollama with the frozen models), and the self-contained generic
`examples/basic-project/` (`npx tsx examples/basic-project/run.ts`, no Ollama required).

> **Constraint:** this runtime is built on the frozen research mechanisms and does
> not add new cognitive mechanisms, models, benchmarks, or domain-specific tools. The
> research freeze remains in effect.

## Benchmarking

> **The research is frozen. Benchmarks are preserved research evidence, not an ongoing product benchmark.**

Phase runners exist for historical reproduction (`npm run phase1` … `phase8`; requires Ollama). Results are tracked in `benchmarks/results/` and documented in the phase reports. Do **not** treat these as a live product benchmark, and do **not** run experiments against the frozen record.

## Reproducibility

See **[`REPRODUCIBILITY.md`](./REPRODUCIBILITY.md)** for the frozen environment, reproduction commands, and known reproducibility boundaries. Do **not** cite old-model results from the historical v1 archive as evidence for this system.

## Limitations

See **[`LIMITATIONS.md`](./LIMITATIONS.md)**. In short: results are single-model, single-hardware, single-benchmark; small deltas are within noise; no universal-improvement or general-small-model claim is made.

## Research Status

**SCAFFOLD RESEARCH FREEZE COMPLETE**

The research program is frozen as of 2026-08-28. No new cognitive mechanisms, benchmarks, models, or further phases are planned. Historical artifacts (Phases 0-9 and the v1 archive) are immutable.

## License

MIT License — see the [LICENSE](./LICENSE) file. Copyright (c) 2026 Wael Harrath.
