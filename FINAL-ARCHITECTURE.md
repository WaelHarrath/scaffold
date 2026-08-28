# SCAFFOLD — Final Frozen Architecture

**Status:** RESEARCH FREEZE — Phase 9 consolidation
**Date:** 2026-08-28

This document is the authoritative, frozen description of the SCAFFOLD system as of the research freeze. It supersedes the historical `ARCHITECTURE.md` (which remains for historical reference). The implementation is locked: **no new cognitive mechanisms, no new benchmarks, no new models, no Phase 10**.

---

## 1. Frozen Configuration Summary

| Parameter | Value | Frozen |
|---|---|---|
| Reasoning model | `qwen3:4b-instruct` (Ollama `/api/chat`) | Yes |
| Embedding model | `all-minilm:latest` (Ollama `/api/embed`) | Yes |
| Context window | 4096 tokens (hardcoded, `num_ctx=4096`) | Yes |
| Reserved output | 256 tokens | Yes |
| Input budget | 3840 tokens | Yes |
| Output tokens per call | 256 (benchmark operating value) | Yes |
| Temperature | 0.1 | Yes |
| Max actions / loop | 20 | Yes |
| Token estimator | `ceil(text.length / 4)` | Yes |
| Retrieval admission | `RETRIEVAL_75` (recommended lean) / `FULL` | Yes |
| Adaptive retrieval | Retained as source; **NOT SUPPORTED** | Yes |

---

## 2. Frozen End-to-End Pipeline

```
TASK
  │
  ▼
[1] STATE        — TaskState (task, goal, currentFile, lastAction, lastResult,
                   progress, relevantFiles, failedActions, attemptedActions,
                   completionStatus). Immutable-by-convention; cloneState copies.
  │
  ▼
[2] RETRIEVE     — SemanticRetriever embeds current state + last observation,
                   ranks workspace-content candidates by cosine similarity,
                   returns top-K. Admission budget (RETRIEVAL_75 / FULL) limits
                   the content admitted into context. EmbeddingCache(500) avoids
                   redundant embedding calls.
  │
  ▼
[3] CONTEXT BUDGET — 4096 total / 3840 input / 256 reserved. Context selector
                   allocates input budget across categories by priority:
                   task(100) goal(90) error(85) observation(80) state(70)
                   constraint(60) retrieved(50+score×10) history(30).
                   task & goal are required (always included).
  │
  ▼
[4] QWEN3 4B      — Reasoning/action-selection only. Receives SYSTEM_PROMPT
                   (fixed action grammar) + formatted user prompt. Returns a
                   single action string. num_predict=256, temperature=0.1,
                   num_ctx=4096. The model executes nothing.
  │
  ▼
[5] ACTION        — parseAction: structured `ACTION: type TARGET: t CONTENT: c`
                   or bare `type target`. Validated against action space
                   (inspect, search, edit, run, finish).
  │
  ▼
[6] GOVERNOR      — Deterministic guards: (a) duplicate-of-previous rejected;
                   (b) 3+ identical inspect/search/run with no change rejected;
                   (c) re-execution of a previously failed action with unchanged
                   workspace rejected; (d) finish always allowed. Rejections emit
                   `REJECTED: <reason>` feedback.
  │
  ▼
[7] EXECUTOR      — Executes allowed actions against the ephemeral workspace
                   (file inspect/search/edit, command run with timeout, finish).
                   Records changed files, output, error.
  │
  ▼
[8] FEEDBACK      — Format policy result + execution result into compact
                   structured feedback (RESULT / PROGRESS / CHANGED / OUTPUT /
                   ERROR), 400-char cap, truncated to 200 chars per field.
  │
  ▼
[9] STATE UPDATE  — progress=YES/NO by success; relevantFiles/currentFile
                   updated; failedActions appended on failure; finish sets
                   completionStatus=completed.
  │
  ▼
[10] NEXT DECISION — loop returns to [1] up to maxActions=20, or returns
                   success on finish, or returns failure on exhaustion.
```

---

## 3. Mechanism Classification

Each mechanism is classified against the pipeline stage it implements. Classification is **architectural**, not evidential — the evidential status of each mechanism is in `benchmarks/FINAL-EVIDENCE.md`.

| Pipeline stage | Mechanism(s) | Classification |
|---|---|---|
| [1] STATE | `TaskState`, `formatState` (FULL/COMPACT/MIN/PROGRESS) | **STATE** |
| [2] RETRIEVE | `SemanticRetriever`, `retrievalBudgetSpec`/`formatRetrievalBudgeted`, `EmbeddingCache`, `formatAdaptiveRetrieval` (retained, not supported) | **RETRIEVAL** |
| [3] CONTEXT BUDGET | `createBudget`, `selectContext`, `buildCandidates`, `estimateTokens` | **STATE** (budget management of state/context) / **RETRIEVAL** (admission of retrieved content) |
| [4] QWEN3 4B | `Qwen3Adapter`, `SYSTEM_PROMPT`, condition formatters (`format-prompt.ts`) | **MODEL** |
| [5] ACTION | `parseAction`, `action-space` | **EXECUTOR** (action-space validation) / **MODEL** (emits action) |
| [6] GOVERNOR | `govern`, `recordExecution` | **GOVERNOR** |
| [7] EXECUTOR | `createExecutor` (inspect/search/edit/run/finish) | **EXECUTOR** |
| [8] FEEDBACK | `formatFeedback`, `formatFeedbackCompressed` (FULL/COMPACT/MINIMAL) | **FEEDBACK** |
| [9] STATE UPDATE | `updateStateOnAction`, `addFailedAction`, `isStuck` | **STATE** |
| [10] NEXT DECISION | loop control, rejection/failure handling | **GOVERNOR** (rejection routing) + **STATE** (loop-carried memory) |

### Classification key

- **MODEL** — the reasoning model and its fixed prompt grammar.
- **STATE** — task/execution memory and how it is represented and budgeted into context.
- **FEEDBACK** — how execution/governor results are formatted back to the model.
- **RETRIEVAL** — semantic content selection and admission budgeting.
- **GOVERNOR** — deterministic guard-rails over action execution.
- **EXECUTOR** — deterministic file/command action execution.

---

## 4. Fixed Prompt Contract

`SYSTEM_PROMPT` is frozen and instructs the model to produce exactly one action line per turn, with no explanation, markdown, or code fences. User prompts are assembled by the frozen condition formatters — the frozen recommended deployment is the **FULL** formatter (`formatFullPrompt`) feeding the loop, with retrieval admission at `RETRIEVAL_75`.

---

## 5. Retrieval Admission (Frozen)

| Level | topK | itemCharLimit | maxTotalChars |
|---|---|---|---|
| `FULL` | 3 | 300 | 900 |
| `RETRIEVAL_75` (recommended) | 3 | 225 | 675 |
| `RETRIEVAL_50` | 2 | 150 | 300 |
| `RETRIEVAL_MIN` | 1 | 80 | 80 |

The retrieval **algorithm** is fixed (query embed → cosine rank → top-K). Only the admission budget varies. Adaptive admission (`adaptive-budget.ts`) is retained as source but classified NOT SUPPORTED and **not** part of the recommended frozen deployment.

---

## 6. Frozen Module Tree (Canonical)

```
src/
├── model/
│   ├── types.ts
│   ├── qwen3.ts
│   └── embedding.ts
├── cognition/
│   ├── action-parser.ts
│   └── action-space.ts
├── state/
│   ├── state.ts
│   └── state-manager.ts
├── context/
│   ├── context-budget.ts
│   └── context-selector.ts
├── feedback/
│   └── feedback.ts
├── execution/
│   ├── system-prompt.ts
│   ├── format-prompt.ts
│   ├── format-compress.ts
│   ├── governor.ts
│   ├── executor.ts
│   └── scaffold-loop.ts
├── retrieval/
│   ├── similarity.ts
│   ├── embedding-cache.ts
│   ├── retriever.ts
│   └── adaptive-budget.ts
└── benchmark/
    ├── types.ts
    ├── runner.ts
    └── tasks.ts
```

---

## 7. Frozen Science Statement

SCAFFOLD is a deterministic orchestration layer over a fixed reasoning model. It does not alter model weights or increase intrinsic reasoning. Its measured effect, where supported, is an improvement in the **effective reliability** of `qwen3:4b-instruct` on the SCAFFOLD benchmark through deterministic management of state, feedback, retrieval, and action execution. See `benchmarks/FINAL-EVIDENCE.md` and `LIMITATIONS.md`.

---

## 8. Change Control (Freeze Boundary)

- No new cognitive mechanisms, benchmarks, models, or Phase 10.
- No modification to the governor, feedback semantics, tasks, or prompts to chase performance.
- Historical artifacts (Phases 0-8, v1 archive) are immutable.
- Any future deviation requires explicit re-opening of the research freeze.
