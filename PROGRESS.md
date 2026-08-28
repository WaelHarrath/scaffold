# SCAFFOLD Project Progress

## Phase Tracker

### Phase 0: Architecture — COMPLETE

**Status:** Done

Built the full module system, type definitions, and core logic for all components:

- Model adapters (Qwen3, MiniLM) with Ollama API integration
- Action parser with structured and bare format support
- Task state with immutable-style cloning and transition logic
- Context budget tracking and priority-based context selector
- Feedback formatter with output truncation
- Action governor with duplicate/noop/failed-replay prevention
- File and command executor with workspace change detection
- Main scaffold loop with full metrics collection
- Semantic retriever with cosine similarity and embedding cache
- Benchmark runner with checkpoint/resume and temp workspace management
- 6 test suites covering parser, context, state, governor, feedback, retrieval

**Output:** Source code + tests. No runtime benchmarks executed yet.

---

### Phase 1: Controlled Baseline + Component Ablation — COMPLETE

**Status:** Done

Ran 400 executions (20 tasks × 4 conditions × 5 reps) with qwen3:4b-instruct under 4096-token context.

**Results:**
| Condition | Success Rate | Avg Tokens | Avg Time |
|---|---|---|---|
| MODEL_ONLY | 10.0% (10/100) | 5,004 | 13.6s |
| MINIMAL | 35.0% (35/100) | 2,759 | 6.8s |
| RETRIEVAL | 26.0% (26/100) | 2,837 | 8.8s |
| FULL | 41.0% (41/100) | 1,960 | 6.0s |

**Key findings:**
- SCAFFOLD improves qwen3:4b-instruct from 10% to 41% (4.1× improvement)
- Zero regressions across all conditions
- FULL is best: 61% fewer tokens, 69% fewer model calls than MODEL_ONLY
- MINIMAL (state+feedback+governor) provides +25pp improvement
- RETRIEVAL helps independently (+16pp) but less than MINIMAL
- FULL combines both for maximum improvement (+31pp)

**Output:** benchmarks/PHASE1-REPORT.md, benchmarks/results/phase1/

---

### Phase 2: Replication Experiment — COMPLETE

**Status:** Done

Ran 400 additional executions (different balanced ordering) to replicate Phase 1 findings. Fixed infrastructure bug (executor `\"` double-encoding).

**Bug Fix:** `src/execution/executor.ts` — Added content normalization to handle model-emitted backslash-quotes in edit actions. Eliminated all 10 CP1 infrastructure failures from Phase 1.

**Phase 2 Results (n=100 per condition):**
| Condition | Success Rate |
|---|---|
| MODEL_ONLY | 10.0% (10/100) |
| MINIMAL | 31.0% (31/100) |
| RETRIEVAL | 30.0% (30/100) |
| FULL | **50.0%** (50/100) |

**Pooled Results (Phase 1 + Phase 2, n=200 per condition):**
| Condition | Success Rate | Improvement |
|---|---|---|
| MODEL_ONLY | 10.0% (20/200) | baseline |
| MINIMAL | 33.0% (66/200) | 3.3x |
| RETRIEVAL | 28.0% (56/200) | 2.8x |
| FULL | **45.5%** (91/200) | **4.6x** |

**Key findings:**
- Replication confirms Phase 1: FULL is best at 45.5% pooled (4.6x improvement)
- Zero regressions across all 800 pooled executions
- Infrastructure bug resolved: zero failures in Phase 2 (vs 10 in Phase 1)
- FULL uses 62% fewer tokens while achieving 4.6x higher success
- State/feedback components (MINIMAL) contribute more than retrieval alone
- FULL uniquely enables multi-step reasoning and cross-file tasks

**Output:** benchmarks/PHASE2-REPORT.md, benchmarks/results/phase2/

---

### Phase 3: Controlled Ablation & Mechanism Analysis — COMPLETE

**Status:** Done

Ran 1000 executions (20 tasks × 10 conditions × 5 reps) to isolate WHICH SCAFFOLD mechanisms produce the observed gains.

**Conditions:** MODEL_ONLY, STATE_ONLY, FEEDBACK_ONLY, GOVERNOR_ONLY, RETRIEVAL_ONLY, STATE_FEEDBACK, STATE_RETRIEVAL, FEEDBACK_RETRIEVAL, STATE_FB_GOVERNOR, FULL

**Implementation Changes:**
- `src/execution/scaffold-loop.ts`: Added `governorEnabled?: boolean` to `LoopConfig` to permit governor ablation
- `src/execution/format-prompt.ts`: Added 4 new isolated/partial format functions
- `benchmarks/phase3-runner.ts`: New 10-condition runner with balanced ordering + checkpoint/resume + 20-section analysis

**Phase 3 Results (n=100 per condition):**
| Condition | Success Rate | Δ vs MODEL_ONLY | Avg Tokens | Avg Calls |
|---|---|---|---|---|
| MODEL_ONLY | 10.0% | baseline | 5,005 | 20.0 |
| STATE_ONLY | 10.0% | +0.0pp | 5,352 | 20.0 |
| FEEDBACK_ONLY | 30.0% | +20.0pp | 2,482 | 8.7 |
| GOVERNOR_ONLY | 10.0% | +0.0pp | 5,005 | 20.0 |
| RETRIEVAL_ONLY | 30.0% | +20.0pp | 3,295 | 10.5 |
| STATE_FEEDBACK | 34.0% | +24.0pp | 3,094 | 10.6 |
| STATE_RETRIEVAL | 26.0% | +16.0pp | 6,083 | 20.0 |
| FEEDBACK_RETRIEVAL | 30.0% | +20.0pp | 3,276 | 10.4 |
| STATE_FB_GOVERNOR | 35.0% | +25.0pp | 2,831 | 9.9 |
| FULL | **46.0%** | **+36.0pp** | 1,872 | 6.0 |

**Key findings:**
- **Only FEEDBACK and RETRIEVAL drive gains** (+20pp each); STATE and GOVERNOR are inert alone (+0pp)
- **FULL is best** (46.0%, 4.6x baseline, 62.6% fewer tokens, 70.3% fewer calls)
- The two effective mechanisms are partially redundant (FEEDBACK+RETRIEVAL = −20pp subadditive) yet complementary in the full stack (I→J = +11pp)
- **FULL uniquely unlocks cross-file reasoning** (CF2 5/5) and near-complete repeated-action avoidance (RA2 4/5) — no other condition reaches these
- **Zero regressions** across all 1000 executions; 1 infrastructure failure (vs 0 in Phase 2)
- **Cross-phase consistency**: MODEL_ONLY = 10% across all 3 phases; FULL = 41/50/46%
- Recommendation: FULL architecture is production-ready for qwen3:4b at 4096-token context

**Output:** benchmarks/PHASE3-REPORT.md, benchmarks/results/phase3/

---

### Phase 4: Efficiency Optimization & Minimal Effective Stack — COMPLETE

**Status:** Done

Ran 800 executions (20 tasks × 8 conditions × 5 reps) to determine whether a smaller SCAFFOLD configuration retains nearly all of FULL's benefit at lower cost. Strict mechanism isolation (new `formatRetrievalOnlyPrompt` removes a Phase 3 confound where RETRIEVAL_ONLY co-mingled feedback).

**Implementation Changes:**
- `src/execution/scaffold-loop.ts`: added `successfulToolCalls`, `promptTokens`, `completionTokens`, `feedbackTokens` to LoopResult (additive metrics, no behavior change)
- `src/execution/format-prompt.ts`: new `formatRetrievalOnlyPrompt` (true retrieval isolation)
- `tests/format-prompt.test.ts`: new (8 tests; 148 total)
- `benchmarks/phase4-runner.ts`: new 8-condition runner with cost-effectiveness + minimal-stack analysis

**Phase 4 Results (n=100 per condition):**
| Condition | Success Rate | vs FULL |
|---|---|---|
| MODEL_ONLY | 10.0% | −39.0pp |
| RETRIEVAL_ONLY | 20.0% | −29.0pp |
| FEEDBACK_ONLY | 30.0% | −19.0pp |
| FEEDBACK_RETRIEVAL | 30.0% | −19.0pp |
| FEEDBACK_GOVERNOR | 30.0% | −19.0pp |
| RETRIEVAL_GOVERNOR | 20.0% | −29.0pp |
| FEEDBACK_RETRIEVAL_GOV | 30.0% | −19.0pp |
| **FULL** | **49.0%** | baseline |

**Cost-effectiveness:** FULL is Pareto-dominant — highest completion AND lowest total tokens (193,874) AND lowest calls (613) AND best success/1k tokens (0.253), success/call (0.080), success/sec (0.052).

**Key findings:**
- **FEEDBACK is the sole effective single mechanism** (+20pp); RETRIEVAL alone is weak (+10pp, 20%) once truly isolated; GOVERNOR adds 0 to completion (pure safety filter)
- **FULL uniquely recovers the 4 hardest tasks** (MS2 multi-step, CF2 cross-file, RA2 hard repeat-avoidance, DC1 decomposition) — no reduced condition reaches any
- **NO MINIMAL EFFECTIVE STACK IDENTIFIED**: best candidate (FEEDBACK_ONLY/GOVERNOR) = 30% = 61.2% of FULL, failing the ≥90% criterion; and every candidate uses MORE tokens/calls than FULL, so no resource reduction exists
- **Zero regressions**, 0 infrastructure failures, FULL is a strict superset of all conditions
- **Conclusion: NOT SUPPORTED** — FULL is both the most effective AND the most efficient; the efficiency hypothesis is falsified

**Output:** benchmarks/PHASE4-REPORT.md, benchmarks/results/phase4/

---

### Phase 5: Causal Trace Analysis — Why Does FULL Work? — COMPLETE

**Status:** Done (analysis-only; NO source change, NO new benchmark)

Used existing Phase 1–4 raw results (action sequences + counts + `budgetExhausted`) plus the deterministic condition wiring to explain FULL's 49% vs 30% and the four unique recoveries.

**Key causal finding:**
- **STATE-in-prompt is the decisive increment.** `FEEDBACK_RETRIEVAL_GOVERNOR` differs from FULL only by omitting the STATE section. Across the 4 hard tasks: FEEDBACK_RETRIEVAL_GOV = 0/5 each, FULL = 5/5 each (DC1 4/5). Everything else (model, governor, retrieval, feedback, loop) is identical.
- Two reduced-condition failure modes, both cured by STATE: **(1) premature `finish`** (few calls, budgetExhausted=false — DC1 2 calls, CF2-FB 4 calls, RA2-FB 2 calls) and **(2) action thrash** (budgetExhausted=true — MS2 20 calls, RA2-retrieval 20× repeat).
- **Earliest causal divergence** for MS2/CF2/RA2/DC1 is the **second model decision** (after the first observation), not the first.
- **Mechanism interaction** = INFORMATION (feedback+retrieval) × MEMORY (state) × ACTION-CONTROL (governor); **MEMORY is the binding factor**. IA state preserves cross-call data that `lastFeedback` (overwritten each step) drops.
- **Token/call efficiency**: FULL's per-call context is largest, but it makes fewest calls (6.1 vs 8.2–20.0) via crash-free convergence — call count, not per-call size, drives efficiency.
- **Scientific classification: SUPPORTED** — runtime compensates for 4B reasoning deficits by managing information / feedback / retrieval / memory / action selection AROUND the model; does NOT enhance the model's reasoning.
- Strongest mechanism: FEEDBACK; weakest: GOVERNOR (safety filter only); STATE useful as multiplier (inert alone).

**Output:** benchmarks/PHASE5-REPORT.md (analysis from existing raw data)

---

### Phase 6: Efficiency Optimization of the Proven FULL Stack — COMPLETE

**Status:** Done

Ran 1000 **fresh** executions (20 tasks × 10 conditions × 5 reps) with qwen3:4b-instruct under 4096 tokens to determine whether the proven FULL stack can be made cheaper without losing completion. Pure compression of existing STATE / FEEDBACK / RETRIEVAL information only — NO new cognitive mechanism. Fresh FULL_CONTROL first (47%), satisfying the "do not reuse old results" requirement.

**Implementation Changes:**
- `src/execution/format-compress.ts`: NEW additive pure-formatting module — STATE levels (FULL/COMPACT/MIN/PROGRESS), FEEDBACK levels (FULL/COMPACT/MINIMAL), RETRIEVAL budget scaling (FULL/75/50/MIN). Runtime loop and all existing modules unchanged.
- `benchmarks/phase6-runner.ts`, `scripts/run-phase6.ts`, `scripts/write-phase6-report.ts`: new runner/entrypoint/report writer with balanced ordering (+5 offset), checkpoint/resume, dimension + Pareto + BEST_COMPRESSION analysis.
- `tests/format-compress.test.ts`: 16 new tests (164 total).

**Phase 6 Results (n=100 per condition, fresh):**
| Condition | STATE | FEEDBACK | RETR | Success | avgCalls | avgTotalTok |
|---|---|---|---|---|---|---|
| FULL_CONTROL | FULL | FULL | FULL | 47.0% | 5.2 | 1647 |
| COMPACT_STATE | COMPACT | FULL | FULL | 46.0% | 5.2 | 1649 |
| MIN_STATE | MIN | FULL | FULL | 48.0% | 6.7 | 2056 |
| COMPACT_FEEDBACK | FULL | COMPACT | FULL | 52.0% | 6.6 | 2050 |
| MINIMAL_FEEDBACK | FULL | MINIMAL | FULL | 48.0% | 6.4 | 1991 |
| RETRIEVAL_75 | FULL | FULL | 75 | **49.0%** | **5.1** | **1605** |
| RETRIEVAL_50 | FULL | FULL | 50 | 49.0% | 5.7 | 1771 |
| RETRIEVAL_MIN | FULL | FULL | MIN | 40.0% | 7.6 | 2327 |
| STATE_COMPACT_FB_COMPACT | COMPACT | COMPACT | FULL | **53.0%** | 6.3 | 1947 |
| BEST_COMPRESSION | FULL | FULL | 75 | 48.0% | 6.9 | 2191 |

**Key findings:**
- **RETRIEVAL_75 Pareto-dominates FULL_CONTROL** (the Phase 6 success criterion): higher completion (49% vs 47%), fewer model calls (510 vs 522), fewer total tokens (160,480 vs 164,747), lower latency (4.7s vs 5.0s), **zero regressions** (conversions 2, regressions 0). Retains hard-task recovery: MS2 5/5, CF2 5/5, RA2 5/5 (FULL 4/5), DC1 4/5 (FULL 3/5); hard_total 19/20 vs FULL 17/20.
- **RETRIEVAL_50** also dominates on latency (4.9s, 49%, 2/0 conversions/regressions).
- Aggressive compression degrades: RETRIEVAL_MIN collapses to 40% (10/20 hard, MS2 0/5; 9 regressions), confirming retrieval content volume is load-bearing on the binding tasks.
- **Strongest single finding on STATE/FEEDBACK:** `STATE_COMPACT_FB_COMPACT` reaches the **highest completion (53%, hard 20/20)** but at higher cost (more calls/tokens) than FULL, so it does NOT Pareto-dominate on efficiency — it is a completion-maximizeer, not an efficiency win.
- **Compression to cut tokens/information is NOT the lever** for efficiency in the hard tasks; the **retrieval admission reduction (75%)** is the only variant that trims both cost and preserves/beats completion (call-count, not per-call payload, remains the dominant cost driver — consistent with Phase 5).
- **BEST_COMPRESSION caveat:** the post-hoc selection resolved to the RETRIEVAL_75 spec (FULL STATE + FULL FEEDBACK + 75% retrieval), so condition 10 re-ran a duplicate of a core condition and showed run-to-run variance (48% vs 49%, higher cost). The robust, evidence-based recommendation is **RETRIEVAL_75** (measured directly in the core set).
- **Zero infrastructure failures** across all 1000 executions.
- Success criterion: **MET** — a candidate (RETRIEVAL_75) outperforms FULL on all cost axes with no regression; FULL did NOT remain Pareto-optimal.

**Output:** benchmarks/PHASE6-REPORT.md, benchmarks/results/phase6/

---

### Phase 7: RETRIEVAL_75 Validation & Robustness — COMPLETE

**Status:** Done

Phase 7 is a **validation-only** phase (no new cognitive mechanism, no redesign): does RETRIEVAL_75 reproduce Phase 6's claim as a stable improvement, or was 49% vs 47% another stochastic outlier? Ran ONLY two conditions (FULL_CONTROL, RETRIEVAL_75) × 20 tasks × 10 reps = **400 fresh executions** (10 reps vs Phase 6's 5 to cut variance), with a **paired design** (same task+rep run under both conditions → paired conversions/regressions + McNemar). Balanced condition AND task ordering; checkpoint/resume every 5 execs; results stored separately in `benchmarks/results/phase7/`.

**Implementation Changes:**
- `benchmarks/phase7-runner.ts`: new 2-condition paired runner reusing the exact phase6 `buildDeps` wiring (FULL_CONTROL = top-3×300c; RETRIEVAL_75 = top-3×225c). Balanced ordering, checkpoint/resume, per-execution hard timeout + infrastructure classification, full metric capture incl. action sequences for failure tracing.
- `scripts/run-phase7.ts`, `scripts/write-phase7-report.ts`: entrypoint + 25-section report generator (paired + McNemar + CI + per-task/per-rep variance + hard-task + efficiency + failure-trace analysis).
- `tsconfig-full.json`: separate typecheck config (main tsconfig excludes benchmarks/scripts/tests).

**Phase 7 Results (n=200 FULL, n=198 R75 — 2 infra excluded):**
| Metric | FULL_CONTROL | RETRIEVAL_75 |
|---|---|---|
| Completion | 47.5% (95/200) | **48.5%** (96/198) |
| Total model calls | 1080 | **1032** |
| Total tokens | 341,379 | **325,724** |
| Mean latency | 8.2s | **6.4s** |
| Success / 1000 tokens | 0.278 | **0.295** |
| Success / model call | 0.0880 | **0.0930** |
| Success / second | 0.058 | **0.075** |
| Paired conversions | — | 3 (DC1) |
| Paired regressions | — | 2 (TO1) |

**Key findings:**
- **Phase 6 efficiency claim REPRODUCES on all four cost axes**: RETRIEVAL_75 uses fewer model calls, fewer tokens, lower latency, and better success/1k-tokens, success/call, and success/sec than FULL_CONTROL. Completion directionally reproduced (+1.0pp: 48.5% vs 47.5%, vs Phase 6's +2pp).
- **But the completion difference is NOT statistically robust**: McNemar exact p=1.0 (b=3 conv vs c=2 reg), 95% paired CI [-1.7%, +2.7%] includes 0. Power is limited because 14 of 20 tasks sit at ceiling/floor IDENTICALLY in both conditions (e.g., CF2/CP1/CP2/CV1/CV2/ER1/MS2/RA1 all 10/10; AS1/AS2/CF1/DC2/ER2/MS1/ST1/ST2/TO2 all 0/0), leaving DC1 and TO1 to drive virtually all signal.
- **Strongest single signals**: DC1 improves 6/10 → 9/10 (+3, all conversions); TO1 regresses 2/10 → 0/10 (-2, both regressions — R75 abandons the `run ./check.sh` loop ~3 calls earlier with less retrieval context).
- **Unlike Phase 6 (0 regressions), Phase 7 has 2 TO1 regressions** — the first task-specific regression for RETRIEVAL_75, so it no longer strictly Pareto-dominates on completion.
- Hard tasks: MS2 10/10 both, CF2 10/10 both, RA2 7/10 both — **retrieval 75% compression fully preserves the hard-task causal benefit** (no regression on MS2/CF2/RA2; DC1 actually improves).
- **2 infrastructure failures (0.5%)**: mid-run the local Ollama model slot degraded (trivial generation ~13-17s vs <1s), causing hung requests and two native crashes. Contained (NOT a methodology change) via a per-execution 150s timeout (recorded as `INFRASTRUCTURE`, excluded from analysis) + checkpoint/resume. Ollama restarted once; all 400 execs completed. The degraded window contaminated latency and may bias the TO1 comparison.
- **Classification: PARTIALLY SUPPORTED** — RETRIEVAL_75 is generally beneficial (consistent efficiency gains reproduce; DC1 +3; full hard-task preservation) but the completion edge is small/NS and it carries TO1-specific regressions (absent in Phase 6). It is a reasonable efficiency default for most tasks, but the Phase 6 "higher completion, zero regression, strictly cheaper" claim is only partially reproduced.

**Output:** benchmarks/PHASE7-REPORT.md, benchmarks/results/phase7/

---

### Phase 8: Can Retrieval be Made Adaptive? — COMPLETE (NEGATIVE)

**Status:** Done — **NOT SUPPORTED** (adaptive retrieval cannot be justified from available retrieval-time signals on this benchmark).

The objective was to determine whether retrieval could be made **adaptive** (deterministic, using ONLY existing retrieval-time signals) to preserve RETRIEVAL_75's efficiency while recovering cases where a 225-char slice loses information the model needs. No new cognitive mechanism.

**Decisive finding (structural proof, not a statistical claim):**
- A content-length audit of the **33 workspace files** across the 20 benchmark tasks shows the **longest source is 200 chars** (TO3 files/large.txt). **0 files exceed the 225-char RETRIEVAL_75 base slice; 0 exceed the 300-char FULL slice.**
- Therefore the only valid deterministic retrieval-time signal — **"the retrieved source is truncated by the base slice" (`content.length > 225`)** — fires on **0 of 33 files**. RETRIEVAL_75 and FULL ship **byte-identical retrieval payloads** on every task.
- This also explains Phase 7: per-call prompt tokens were ~identical (FULL 302.6 vs R75 301.6), so the Phase 6/7 "efficiency" and the TO1 regression are **stochastic model-call-count variance**, NOT retrieval truncation. No truncation-based adaptive policy can restore TO1 (its check.sh is 39 chars, never truncated).

**What was done:** Implemented the deterministic truncation-triggered policy in `src/retrieval/adaptive-budget.ts` (ADAPTIVE_LENGTH / ADAPTIVE_TOPK / ADAPTIVE_HYBRID — expand toward FULL 300-char only when a source is truncated) with **11 deterministic unit tests**, including a proof that adaptive formatting is byte-identical to RETRIEVAL_75 for all 33 benchmark sources. Ran a **200-execution empirical proof-of-parity** (RETRIEVAL_75 vs ADAPTIVE_HYBRID, 20 tasks x 5 reps x 2 conditions, paired, balanced ordering, checkpoint/resume, 0 infra failures).

**Phase 8 parity results (n=100 per condition):**
| Metric | RETRIEVAL_75 | ADAPTIVE_HYBRID |
|---|---|---|
| Completion | 47/100 (47.0%) | 47/100 (47.0%) |
| Total model calls | 507 | 523 |
| Total tokens | 160,197 | 165,650 |
| Avg prompt tokens / call | 301.4 | 302.9 |
| Avg retrieval tokens / exec | 76.3 | 76.3 |
| Paired conv / reg | — | 2 / 2 (McNemar p=1.0, CI [-3.9%, +3.9%]) |

- **Zero adaptive expansions** across all 200 executions — ADAPTIVE_HYBRID is empirically byte-identical to RETRIEVAL_75 (0/33 possible triggers fired), confirming the structural proof.
- Classification: **NOT SUPPORTED** — no defensible deterministic retrieval-time signal exists; **no signal was manufactured and no fabricated ADAPTIVE condition was run** (per objective guidance). The unit-tested module is ready for future suites whose sources exceed the base slice, but cannot be validated or justified on the current task suite.

**Output:** benchmarks/PHASE8-REPORT.md (24 sections), benchmarks/results/phase8/, src/retrieval/adaptive-budget.ts, tests/adaptive-budget.test.ts, benchmarks/phase8-parity-runner.ts, benchmarks/phase8-audit.ts, scripts/run-phase8.ts, scripts/write-phase8-report.ts.

---

### Project Final — HARD STOP

Phases 1–8 complete across **4,600 total executions** (Phase 1: 400 + Phase 2: 400 + Phase 3: 1000 + Phase 4: 800 + Phase 6: 1000 + Phase 7: 400 + Phase 8: 200). The FULL architecture (STATE + FEEDBACK + RETRIEVAL + GOVERNOR) remains the recommended deployment — the only Pareto-dominant cognitive configuration, source of the four uniquely-recovered hard tasks (MS2/CF2/RA2/DC1) via its STATE (inter-call memory) increment. **RETRIEVAL_75 (75% retrieval-admission budget)** reproduces Phase 6's efficiency win across every cost axis and fully preserves the hard-task causal benefit, but its completion edge over FULL is small (+1.0pp) and not statistically significant, and it introduces task-specific TO1 regressions — so it is **PARTIALLY SUPPORTED** as an efficiency default. **Phase 8 definitively establishes that retrieval CANNOT be made adaptive on this benchmark**: the slice limits are never binding (0/33 sources truncated), so RETRIEVAL_75 and FULL ship identical payloads, and adaptive retrieval is **NOT SUPPORTED** (no justifiable deterministic signal; the Phase 6/7 cost/completion differences are stochastic call-count variance, not information-loss effects). Final classification: **RETRIEVAL_75 PARTIALLY SUPPORTED as an efficiency default; adaptive retrieval NOT SUPPORTED.** Per project constraints: no new mechanisms, no new reasoning models, no further phases.

## Phase 9 — Research Freeze & Final Consolidation

**Status:** Done — **RESEARCH FREEZE COMPLETE** (2026-08-28)

Phase 9 performed a read-only repository audit and produced the final consolidated research artifact. No new cognitive mechanisms, benchmarks, models, or Phase 10. No modification to the governor, feedback semantics, tasks, or prompts.

**What was done:**
- Completed a full repository audit (`benchmarks/PHASE9-AUDIT.md`) covering frozen config, source architecture, retrieval config, state/feedback/governor behavior, benchmark infrastructure (30 tasks: 10 easy/10 medium/10 hard across 10 categories), test coverage (11 files / 175 tests), documentation inconsistencies, stale claims, and reproducibility gaps. Discrepancies were recorded, not silently changed.
- Authored the canonical frozen pipeline + mechanism classification (`FINAL-ARCHITECTURE.md`).
- Consolidated the causal evidence table with exact measured numbers (`benchmarks/FINAL-EVIDENCE.md`), distinguishing causal vs correlational evidence.
- Authored `LIMITATIONS.md` and `REPRODUCIBILITY.md`.
- Rewrote `README.md` as an explicit **research prototype / experimental runtime** with the research-freeze status; updated `ARCHITECTURE.md` to the frozen implementation (correcting stale module map, max_tokens/256 operating value, embedding-cache 500 vs 1000, progress semantics, loop diagram, and inactive constraint category); updated `PROGRESS.md` (this entry) with the freeze declaration.
- Ran and recorded the verification gate: **npm test → 11 files / 175 tests passing; typecheck clean; build clean**.
- Integrity-checked historical artifacts (Phases 1-8) against recorded hashes; historical reports and results were **not** rewritten.

**Execution-tally correction:** The cumulative executions across Phases 1-8 is **4200** (Phase 1: 400 + Phase 2: 400 + Phase 3: 1000 + Phase 4: 800 + Phase 6: 1000 + Phase 7: 400 + Phase 8: 200; Phase 5 was analysis-only, 0). An earlier entry stated 4,600; the correct total for the executed phases is 4200.

**Final classification (unchanged from the completed phases):** FULL stack SUPPORTED (STATE + FEEDBACK + RETRIEVAL + GOVERNOR); FEEDBACK and RETRIEVAL each independently effective (causal); STATE = decisive inter-call memory increment within the full stack; **RETRIEVAL_75** Partially Supported as an efficiency default (Pareto-superior in Phase 6, statistically indistinguishable from FULL at n≈200 in Phase 7); **adaptive retrieval NOT SUPPORTED** (Phase 8).

**Frozen conclusion:**
> SCAFFOLD demonstrates experimentally supported, model-specific improvements in the effective reliability of `qwen3:4b-instruct` through deterministic management of state, feedback, retrieval, and action execution. The evidence does not establish that SCAFFOLD increases intrinsic model reasoning capability or generalizes to arbitrary small models.

---

### Phase 10: General-Purpose Runtime Productization — COMPLETE (ENGINEERING)

**Status:** Done — **runtime engineering release on frozen research** (2026-08-28)

Phase 10 is an *engineering* phase, not a research phase. It does **not** re-open
the research freeze, add cognitive mechanisms, models, benchmarks, or benchmark
results. It productizes the frozen prototype into a general-purpose, domain-agnostic
runtime library around the validated pipeline. Full details in
[`PHASE10-REPORT.md`](./PHASE10-REPORT.md); integrity in
[`PHASE10-INTEGRITY-MANIFEST.md`](./PHASE10-INTEGRITY-MANIFEST.md).

**What was done:**
- Added a **stable public API** entry point (`src/index.ts`): `createScaffold(...)`
  → `Scaffold` with `config`, `registerTool`, `registerTools`, `execute`, `logger`; a
  structured `ScaffoldResult`; package entry fields (`main`/`module`/`types`/`exports`).
- Added a **generic tool system** (`src/tools.ts`): host-supplied, domain-agnostic
  `ScaffoldTool`s with a registry and an additive `createToolExecutor` dispatch seam
  over the frozen executor (first-token match on `run`; non-matching commands unchanged).
- Added a **model-provider abstraction / configurable endpoint**: `Qwen3Adapter` and
  `MiniLMAdapter` gained additive default-preserving `baseUrl` constructor params.
- Added **configuration validation** (`src/config.ts`) with the frozen validated
  defaults enforced at construction.
- Added a **structured error model** (`src/errors.ts`): typed `ScaffoldError`
  subclasses with stable `code`s and a redacted `toSafeString()`.
- Added **cancellation & timeout**: `execute(task, { signal })` → `CancelledError`;
  `executionTimeoutMs` → `TimeoutError`.
- Added **observability & security-safe logging** (`src/logger.ts`): `executionId`,
  token/tool/retrieval stats, level filtering, silent mode; no credentials/prompts/
  tool payloads logged.
- Added **52 new tests** (config, errors, tools, runtime) — **227/227 passing**,
  all 175 frozen tests preserved. `npm run typecheck` and `npm run build` clean.
- Added `examples/{basic,tools,assistant}.ts` (public-API usage).

**Domain-agnostic + integrity:** `src/`, examples, and new tests contain no domain
terms (CSR/ESG/KPI/governance/compliance/sustainability/carbon/scorecard/materiality —
grep-verified). No secrets introduced. All frozen research files and benchmark
results are SHA-256 byte-identical to the published commit
(see `PHASE10-INTEGRITY-MANIFEST.md`). Frozen mechanism files
(`scaffold-loop.ts`, `executor.ts`, `system-prompt.ts`) are untouched.

**Working tree (NOT committed / pushed / released):** modified `package.json`,
`src/model/qwen3.ts`, `src/model/embedding.ts` (additive/default-preserving); new
`src/{config,errors,tools,logger,runtime,index}.ts`, 4 test files, 3 examples, and
the two Phase 10 documents.

> **Note:** The research freeze remains **FROZEN**. Phase 10 is engineering work
> only; the research claims, mechanisms, and evidence are unchanged.

---

### Phase 11: Scaffold Runtime Productization & Real-World Integration — COMPLETE (PRODUCTIZATION)

**Status:** Done

Phase 11 engineering/productization on the **public runtime path only** — the
frozen research internals (`scaffold-loop.ts`, `executor.ts`, `system-prompt.ts`)
and the frozen benchmark path are left byte-identical. No new cognitive
mechanisms, no benchmarks, no models, no secret handling beyond layered
redaction, no publish/commit/release.

- **Read-only audit** (`benchmarks/PHASE11-AUDIT.md`): classified findings
  (2 BLOCKER, 1 HIGH, 3 MEDIUM, 2 LOW, REST READY) on the public runtime surface.
- **Workspace path containment** (`src/workspace.ts`): `resolveWithinWorkspace`
  rejects `../`, absolute-escape, and symlink/junction escapes; `isInside` and
  `toWorkspaceRelative` helpers.
- **Secure-executor wrapper** (`src/secure-executor.ts`): wraps the frozen
  executor on the public path — pre-flight target containment, re-bases and
  filters `filesChanged` onto the workspace (fixes the frozen `process.cwd()`
  mis-report), and redacts secret-like output/error text.
- **Secret redaction** (`src/redact.ts`): `redactText` / `redactWithFlag` over a
  conservative default pattern set plus caller-supplied secret strings/label.
- **Public API refinements:** `scaffold.run(task, options)` added as the primary
  alias of `execute`; new config flags `workspaceContainment` (default true) and
  `redactSecrets` (default true); new exports in `src/index.ts`.
- **Generic integration example** `examples/basic-project/` (domain-agnostic, no
  secrets, runs without Ollama via stub providers).
- **New tests:** `tests/workspace.test.ts`, `tests/secure-executor.test.ts`,
  `tests/redact.test.ts` → **260 / 260 tests passing (18 files)**, typecheck and
  build clean.

**Integrity:** frozen research mechanism files untouched; frozen benchmark
results/reports unchanged; verified against `PHASE10-INTEGRITY-MANIFEST.md`.
No commit / push / release performed.

---

## RESEARCH FREEZE

The SCAFFOLD research program is **FROZEN** as of 2026-08-28. No new cognitive mechanisms, no new benchmarks, no new models, no Phase 10. The governor, feedback semantics, tasks, prompts, and frozen configuration (`qwen3:4b-instruct` + `all-minilm:latest`, 4096-token window) are locked. Historical artifacts (Phases 0-8 and `scaffold-v1-history`) are immutable. Any future deviation requires explicit approval to re-open the freeze.

## Historical Reference

The original SCAFFOLD v1 research — including all 10 phases of prior experimentation — is preserved at:

**`scaffold-v1-history/`**

This archive contains the full history of the v1 approach and should be referenced for context on what was tried before SCAFFOLD v2.
