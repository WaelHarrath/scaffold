# PHASE 9 — Repository Audit

**Status:** RESEARCH FREEZE — Pre-consolidation audit
**Date:** 2026-08-28
**Scope:** Full read-only audit of the SCAFFOLD repository before final consolidation. This document identifies architecture, config, behavior, test-coverage, documentation, and reproducibility facts and discrepancies. **No discovered issue is silently changed** — discrepancies are recorded here and, where applicable, resolved only in the Phase 9 consolidation docs (`FINAL-ARCHITECTURE.md`, `README.md`, `ARCHITECTURE.md`, `REPRODUCIBILITY.md`).

---

## 1. Scope and Method

The audit covers:

- Frozen configuration (model, embedding, context budget).
- Source architecture (`src/**`).
- Retrieval configuration (semantic + adaptive).
- State / feedback / governor behavior.
- Benchmark infrastructure and task definitions.
- Test coverage.
- Documentation consistency (README, ARCHITECTURE, PROGRESS, phase reports).
- Stale or unsupported claims.
- Reproducibility gaps.

Method: direct source inspection (Read) + package/gate verification (`npm test`, `npm run typecheck`, `npm run build`) + hash integrity checks. No benchmark reruns were performed (Phase 9 runs no benchmarks).

---

## 2. Frozen Configuration (Verified)

| Item | Value | Source |
|---|---|---|
| Reasoning model | `qwen3:4b-instruct` (fixed) | `src/model/qwen3.ts:6` |
| Embedding model | `all-minilm:latest` (fixed) | benchmark deps |
| Context window | 4096 tokens (hardcoded) | `src/model/qwen3.ts:8`, `context-budget.ts:1` |
| Reserved output | 256 tokens | `context-budget.ts:2` |
| Input budget | 3840 tokens | `context-budget.ts:17` |
| Token estimator | `ceil(text.length / 4)` | `context-budget.ts:21` |
| Loop maxActions | 20 (default) | `scaffold-loop.ts:46` |
| Loop temperature | 0.1 (default) | `scaffold-loop.ts:47` |
| Loop maxTokens | **512 (code default); 256 used by all benchmark phases** | `scaffold-loop.ts:48` |

> Note: `LoopConfig.maxTokens` defaults to 512 in code (`DEFAULT_CONFIG`), but every experimental run (Phases 1-8) invoked the loop with `maxTokens: 256`, which is consistent with the 256-token reserved-output budget. 512 is never the measured operating value.

---

## 3. Source Architecture (Verified Against Source)

Modules present: `src/model`, `src/cognition`, `src/state`, `src/context`, `src/feedback`, `src/execution`, `src/retrieval`, `src/benchmark`.

### 3.1 model
- `types.ts` — `ReasoningModel`, `EmbeddingModel`, `ModelRequest`, `ModelResponse`, `TokenUsage`.
- `qwen3.ts` — `Qwen3Adapter`, Ollama `/api/chat`, `num_ctx=4096`, `num_predict=maxTokens`, `temperature`. Model id `qwen3:4b-instruct`.
- `embedding.ts` — `MiniLMAdapter`, Ollama `/api/embed`.

### 3.2 cognition
- `action-parser.ts` — `parseAction` (structured `ACTION: … TARGET: … CONTENT: …` + bare `<type> <target>`).
- `action-space.ts` — `VALID_ACTIONS`, `isValidAction`.

### 3.3 state
- `state.ts` — `TaskState`, `createInitialState`, `cloneState`.
- `state-manager.ts` — `updateStateOnAction`, `addFailedAction`, `isStuck`.

### 3.4 context
- `context-budget.ts` — budget, estimator, `fitsInBudget`.
- `context-selector.ts` — `ContextCandidate`, `buildCandidates`, `selectContext` (priority + required-category selection).

### 3.5 feedback
- `feedback.ts` — `FeedbackResult`, `formatFeedback`, `estimateFeedbackTokens`.

### 3.6 execution
- `system-prompt.ts` — constant `SYSTEM_PROMPT`.
- `format-prompt.ts` — condition formatters (MODEL_ONLY, MINIMAL, RETRIEVAL, FULL, and Phase-3 ablation formatters).
- `format-compress.ts` — `formatState` (STATE levels), `formatFeedbackCompressed` (FEEDBACK levels), `retrievalBudgetSpec` + `formatRetrievalBudgeted` (RETRIEVAL levels).
- `governor.ts` — `GovernorState`, `govern`, `recordExecution`.
- `executor.ts` — `Executor`, `createExecutor` (inspect/search/edit/run/finish).
- `scaffold-loop.ts` — `runScaffoldLoop` main loop.

### 3.7 retrieval
- `similarity.ts` — `cosineSimilarity`, `rankBySimilarity`.
- `embedding-cache.ts` — LRU `EmbeddingCache`, SHA-256 keyed, default `maxSize = 1000`.
- `retriever.ts` — `SemanticRetriever`.
- `adaptive-budget.ts` — `formatAdaptiveRetrieval`, `adaptiveBudgetSpec`, ADAPTIVE_LENGTH/TOPK/HYBRID (added Phase 8; evaluated **NOT SUPPORTED**).

### 3.8 benchmark
- `types.ts` — `TaskDefinition`, `TaskResult`, `WorkspaceFile`.
- `runner.ts` — condition-matrix runner, checkpoint/resume.
- `tasks.ts` — 30 task definitions.

---

## 4. Retrieval Configuration

### 4.1 Semantic retrieval (frozen, supported)
- `SemanticRetriever` embeds query + items, ranks by cosine similarity, returns top-K.
- Embedding cache used to avoid redundant embedding calls; benchmark instantiated with `new EmbeddingCache(500)` in runs.

### 4.2 Admission budgets (`format-compress.ts`)
Frozen budgets (Phase 6 established `RETRIEVAL_75` as the recommended lean deployment):

| Level | topK | itemCharLimit | maxTotalChars |
|---|---|---|---|
| `FULL` | 3 | 300 | 900 |
| `RETRIEVAL_75` | 3 | 225 | 675 |
| `RETRIEVAL_50` | 2 | 150 | 300 |
| `RETRIEVAL_MIN` | 1 | 80 | 80 |

### 4.3 Adaptive retrieval (`adaptive-budget.ts`) — NOT SUPPORTED
Phase 8 established that adaptive expansion never triggers in practice: 0/33 workspace files exceed 225 chars, and `RETRIEVAL_75` and `FULL` ship byte-identical payloads. Phase 8 parity (200 executions) gave identical 47% success for RETRIEVAL_75 vs ADAPTIVE_HYBRID with zero adaptive expansions. Adaptive retrieval is retained as source but is **not** part of the frozen recommended configuration.

---

## 5. State / Feedback / Governor Behavior (Verified)

### 5.1 State updates (`scaffold-loop.ts`)
- On success, `progress` set to `"YES"`; on failure `"NO"` (for **any** action type, not only edit).
- `relevantFiles` augmented with changed files; `currentFile` set to first changed file.
- Failed actions appended to `failedActions` on failure.
- On `finish`: `completionStatus = "completed"`, `lastAction = "finish …"`, returns success.

> Discrepancy (documentation) — see §7.

### 5.2 Feedback (`feedback.ts` + `format-compress.ts`)
- Default `formatFeedback` produces `RESULT` / `PROGRESS` / `CHANGED` / `OUTPUT` / `ERROR` lines, 400-char cap.
- Compression levels: FULL_FEEDBACK, COMPACT_FEEDBACK, MINIMAL_FEEDBACK (subsets/truncations). Governor rejections render as `REJECTED: <reason>` (compact, identical across levels).

### 5.3 Governor rules (`governor.ts`)
| Rule | Condition | Result |
|---|---|---|
| Duplicate | Same serialized action as previous step | Reject (duplicate) |
| Noop limit | 3+ identical inspect/search/run, no workspace change | Reject (noop_limit) |
| Failed replay | Re-executing previously failed action, no workspace change | Reject (failed_replay) |
| Finish | Any finish | Always allowed |

Governor state: `executedActions`, `failedActions`, `noopCount`.

> Wiring nuance (§7, GOV-1): `scaffold-loop.ts:151` passes `lastObservation !== null` into `govern`'s `workspaceChanged` (third) parameter. This is not a literal workspace-change flag — it is "has there been a prior successful observation." The governor's noop/failed-replay guards therefore key off a coarse "clean-slate" heuristic rather than exact changed-file state. This matches the frozen implementation and is recorded, not changed.

---

## 6. Benchmark Infrastructure & Task Definitions (Verified)

- **Runner:** `benchmarks/phase<k>-runner.ts`, entrypoints `scripts/run-phase<k>.ts`, report writers `scripts/write-phase<k>-report.ts`.
- **Task set:** `src/benchmark/tasks.ts` → **30 tasks**, distributed **10 easy / 10 medium / 10 hard** across **10 categories** (3 tasks each): action_selection, completion_verification, constraint_preservation, cross_file_reasoning, decomposition, error_recovery, multi_step_reasoning, repeated_action_avoidance, state_tracking, tool_output_interpretation.
- Hard (difficulty-3) tasks serve as the "binding"/discriminator subset referenced across reports (e.g., MS2, CF2, RA2, DC1).
- **Infrastructure failures:** recorded with `failureClass=infrastructure`, excluded from success-rate denominators (Phase 1: 10; later phases: 0).
- **Checkpoint/resume + results JSON:** present in `benchmarks/results/`.
- **Phase 5** was analysis-only (no results directory; relies on Phase 4 data + causal trace).

### Cumulative executions
Phases 1-8: 400 + 400 + 1000 + 800 + 1000 + 400 + 200 = **4200 executions**.

---

## 7. Documentation Discrepancies (Recorded, NOT SILENTLY CHANGED)

### 7.1 ARCHITECTURE.md
| # | Location | Stated | Verified reality | Disposition |
|---|---|---|---|---|
| ARC-1 | `max_tokens (default 512)` | Default max tokens 512 | Code default is 512, but **all benchmark runs used 256**. 512 is never the measured value. | Rewrite clarifies benchmark runs use 256 within the 256-token reserved-output budget. |
| ARC-2 | File/module map | Lists only governor/executor/scaffold-loop under `execution/`; no `retrieval/adaptive-budget.ts`; no `tasks.ts` | Missing files exist: `format-compress.ts`, `format-prompt.ts`, `system-prompt.ts`, `adaptive-budget.ts`, `tasks.ts` | Module map updated to full frozen tree. |
| ARC-3 | Embedding Cache "500 alternative" | States default 1000 | Class default is 1000; **benchmark runs use 500** | State both values precisely. |
| ARC-4 | State transitions "edit with success: progress = YES" | Ties progress=YES to edit only | Code sets progress=YES for **any** successful action, NO for any failure | Corrected to reflect actual loop behavior. |
| ARC-5 | Loop diagram lacks retrieval admission per iteration and prompt-building via formatter | Diagram is `parse → govern → execute → feedback → state` | Actual loop retrieves **first** each step, then formats prompt (formatter-driven), then model, then parse | Diagram simplified/annotated to match frozen loop. |
| ARC-6 | `selectContext` "required do not count against the budget" | Implies required consume no budget | Required are always included **and** the running token counter is incremented for them, which influences whether optional items fit | Rephrased for accuracy. |
| ARC-7 | `constraint` category priority 60 | Listed as an active optional category | `buildCandidates` never emits a `constraint` candidate; it is a defined-but-inactive priority bucket | Noted as inactive. |

### 7.2 README.md
| # | Location | Stated | Reality | Disposition |
|---|---|---|---|---|
| README-1 | Experimental Conditions table | Only 4 Phase-1 conditions (MODEL_ONLY, MINIMAL, RETRIEVAL, FULL) | Frozen full stack now recommended at `RETRIEVAL_75`; adaptive evaluated and rejected | README rewritten to public-facing frozen summary. |
| README-2 | Project status | "research experiment" only | Research freeze now declared | README updated with freeze + evidence/limitations/reproducibility pointers. |

### 7.3 PROGRESS.md
| # | Stated | Reality | Disposition |
|---|---|---|---|
| PRG-1 | Up to date through Phase 8 | Needs Phase 9 entry + RESEARCH FREEZE declaration | Phase 9 entry appended; freeze declared. |

### 7.4 Phase reports
- Reports from Phases 0-8 verified present and internally consistent with the numbers recorded here. They are **historical artifacts and are not rewritten**.

---

## 8. Test Coverage (Verified via Gate)

- **11 test files, 175 tests, all passing** (`npm test`).
- Coverage spans model adapters (mock), action parsing, context budgeting/selection, feedback formatting, governor, executor, state transitions, retrieval (similarity/cache/retriever), adaptive-budget, and the scaffold loop.
- Typecheck clean (`tsc --noEmit`); build clean (`tsc` emit).
- Gate executed 2026-08-28 during this audit.

---

## 9. Stale / Unsupported Claims

- **Adaptive retrieval** — Phase 8 marks it `NOT SUPPORTED` (structural proof: no file exceeds 225 chars; byte-identical payloads; zero adaptive expansions; identical 47% parity). Retained as source, not recommended; must NOT be presented as an improvement.
- **"SCAFFOLD increases reasoning"** — historically disclaimed; reaffirmed: evidence supports model-specific *effective reliability* improvements via deterministic orchestration, **not** an increase in intrinsic reasoning capability and **not** generalization to arbitrary small models.
- **Universal improvement** — no such claim is supported by the data (improvements are single-model, single-hardware, single-benchmark).

---

## 10. Reproducibility Gaps (Recorded, Addressed in REPRODUCIBILITY.md)

1. `qwen3:4b-instruct` has no seed support in the adapter → run-to-run stochastic variance; exact numbers are not bit-identical across reruns.
2. Token counts: prompt/completion from Ollama-reported `prompt_eval_count`/`eval_count`; feedback/retrieval token counts are estimator-based (`ceil(len/4)`), not exact.
3. Benchmark memory: `EmbeddingCache(500)` — large workspace runs may exceed cache size and re-embed, affecting wall-time (embedding cost is tracked separately from model-call latency).
4. Phase-dependent report numbers were measured on the same machine/Ollama stack; hardware differences change absolute latency.
5. Historical phase reports reference old models (qwen2.5:1.5b/3b) in the v1 archive; those must NOT be cited as evidence for the current Qwen3-4B system.

---

## 11. Audit Conclusion

The repository is internally coherent and passes its verification gate (175 tests, typecheck, build). The frozen configuration is `qwen3:4b-instruct` + `all-minilm:latest` at a 4096-token window (3840 input / 256 output), with a deterministic loop (state → retrieve → context budget → model → action → governor → executor → feedback → state update). Documentation discrepancies are confined to ARCHITECTURE.md/README.md staleness and minor behavioral nuance, all recorded above and addressed (not silently rewritten) in the Phase 9 consolidation. Historical artifacts (Phases 0-8) remain untouched.

This audit is the basis for `FINAL-ARCHITECTURE.md`, `FINAL-EVIDENCE.md`, `LIMITATIONS.md`, `REPRODUCIBILITY.md`, the rewritten `README.md`, the updated `ARCHITECTURE.md`/`PROGRESS.md`, and `PHASE9-REPORT.md`.
