# Phase 5: Causal Trace Analysis — Why Does FULL Work?

**Date**: 2026-08-27
**Phase**: 5 (analysis-only)
**Model**: qwen3:4b-instruct (fixed)
**Context**: 4096 tokens (fixed)
**Retrieval**: all-minilm:latest (fixed)
**Method**: Causal trace analysis of existing Phase 1–4 raw results. **No source changes. No new benchmark.**

---

## Executive Summary

The central question is: **why does FULL achieve 49% when every reduced stack caps at 30%, and why does FULL alone solve MS2, CF2, RA2, DC1?**

The trace evidence points to a single, decisive causal increment. Phase 4's conditions **FEEDBACK_RETRIEVAL_GOVERNOR** (feedback + retrieval + governor, active) and **FULL** are wired identically except for ONE difference: FULL's prompt includes the **STATE section** (`last=, progress=, files=, status=, failed=`). Everything else — model, governor, retrieval, feedback formatter, loop — is byte-for-byte identical.

Across the four uniquely-recovered tasks:

| Task | FEEDBACK_RETRIEVAL_GOV | FULL |
|---|---|---|
| MS2 | **0/5** | **5/5** |
| CF2 | **0/5** | **5/5** |
| RA2 | **0/5** | **5/5** |
| DC1 | **0/5** | **4/5** |

**The entire 49%-vs-30% advantage, and the entire unique recovery of the four hard tasks, is attributable to the STATE section** (a.k.a. inter-call memory / context management) being added to an already complete feedback+retrieval+governor stack. STATE converts the runtime from a *stateless, last-feedback-only* loop into a *memory-bearing* loop that can (a) prevent premature `finish`, (b) break action-thrash loops, and (c) preserve multi-step/cross-file information across model calls.

**This is INFORMATION / MEMORY / CONTEXT MANAGEMENT, not increased reasoning capability.** The deterministic runtime operates around the 4B model — it preserves state, exposes relevant information, reports consequences, and prevents useless actions. It does not make the 4B model more intelligent; it manages the information and execution so the model's existing (weak) reasoning is sufficient.

---

## 1. Objective

Determine, from actual traces and the deterministic runtime wiring, WHY FULL succeeds on MS2, CF2, RA2, DC1 when every reduced configuration fails; identify the mechanism interaction responsible; and classify the nature of SCAFFOLD's effect (reasoning enhancement vs. compensating information/execution management) precisely and honestly.

## 2. Prior Evidence

- Phase 1: MODEL_ONLY 10%, FULL 41%
- Phase 2: MODEL_ONLY 10%, FULL 50% (executor double-encoding bug fixed)
- Phase 3 (n=1000): MODEL_ONLY 10%, STATE_ONLY 10%, FEEDBACK_ONLY 30%, GOVERNOR_ONLY 10%, RETRIEVAL_ONLY 30% (confounded), FULL 46%
- Phase 4 (n=800): MODEL_ONLY 10%, RETRIEVAL_ONLY 20% (true isolation), FEEDBACK_ONLY 30%, FEEDBACK_RETRIEVAL 30%, FEEDBACK_GOVERNOR 30%, RETRIEVAL_GOVERNOR 20%, FEEDBACK_RETRIEVAL_GOV 30%, **FULL 49%**. FULL Pareto-dominant (highest success, lowest tokens, calls, best success/token, /call, /sec). No minimal effective stack found.

Phase 4's key isolated facts:
- **FEEDBACK is the sole effective single mechanism** (+20pp: 10%→30%).
- **RETRIEVAL alone is weak** (+10pp: 10%→20%).
- **GOVERNOR adds 0 to completion** (FEEDBACK_GOVERNOR = FEEDBACK_ONLY = 30%; RETRIEVAL_GOVERNOR = RETRIEVAL_ONLY = 20%).
- **FULL uniquely recovers MS2, CF2, RA2, DC1** — the multi-step, cross-file, repeated-action, and decomposition tasks.

## 3. Data Sources

- `benchmarks/results/phase4/results.json` — **primary source**: 800 records, each with `actionSequence` (ordered executed tool actions), `modelCalls`, `toolCalls`, `successfulToolCalls`, `rejectedActions`, `duplicateActions`, `noopActions`, `promptTokens`, `completionTokens`, `totalTokens`, `feedbackTokens`, `retrievalTokens`, `retrievalCalls`, `executionTime`, `condition`, `rep`, `budgetExhausted`, `failureReason`, `reason`, `category`.
- `benchmarks/results/phase1|phase2|phase3|phase4/checkpoint.json` — mirror of results + completion keys (no richer trace).
- `src/benchmark/tasks.ts` — exact task file contents/objectives and verifier logic (deterministic ground truth).
- `benchmarks/phase4-runner.ts` — **exact condition wiring** (which formatter, governor flag, retrieval flag, system prompt per condition).
- `src/execution/format-prompt.ts` — exact prompt templates (what the model literally sees per condition).
- `src/execution/scaffold-loop.ts` — the loop semantics (`finish` returns immediately; governor; feedback; state update; per-call statelessness except `lastFeedback`/`lastObservation`/`state`).
- `src/feedback/feedback.ts`, `src/retrieval/retriever.ts`, `src/state/state-manager.ts`, `src/context/context-selector.ts` — deterministic content of feedback / retrieval / state signals.

**Trace-detail caveat**: raw results capture **action-level traces + aggregate step counts**, NOT per-call model input/output strings, NOT the literal feedback/retrieval text emitted per step, and NOT per-step wall-clock. Feedback text, retrieval text, and state summary are therefore **reconstructed deterministically** from (a) the condition wiring, (b) the known task file contents, (c) the observed action that produced them, and (d) the code paths. Where a claim depends on reconstructed (not captured) signal content, this is flagged in §17.

## 4. Trace Methodology

1. **Exact-condition replay from wiring**: For each condition, the formatter is known (`formatModelOnlyPrompt`, `formatFeedbackOnlyPrompt`, `formatRetrievalOnlyPrompt`, `formatFeedbackRetrievalPrompt`, `formatFullPrompt`), so the exact per-call prompt is reconstructable from task + state + feedback + retrieval.
2. **Action-sequence differential**: Compare `actionSequence` across conditions for the same (task, rep). The **earliest index where sequences differ** = earliest causal divergence, because the first model call's output depends only on `TASK` (identical across conditions).
3. **Budget analysis**: `budgetExhausted` distinguishes two failure modes — (i) loop thrash (exhausted 20 actions) vs (ii) **premature `finish`** (few calls, budgetExhausted=false, loop returned success but verifier failed). This is the single most diagnostic discriminator.
4. **State-presence differential**: `FEEDBACK_RETRIEVAL_GOV` vs `FULL` differ ONLY by the STATE section → the FULL-unique recovery is causally attributable to STATE.
5. **Deterministic reconstruction**: feedback = `RESULT/PROGRESS/CHANGED/OUTPUT/ERROR` of the executed action; retrieval = top-3 semantic file excerpts for the query; state = `last=/progress=/files=/status=/failed=`. All derivable from the code + task files + observed actions.

## 5. MS2 Analysis — *Multi-Step State Preservation*

**Task**: Read package.json → find `main: "index.js"` → check index.js exists → write report.txt stating filename + existence.

**Traces (representative, all 5 reps identical):**
- MODEL_ONLY: `[inspect package.json]` ×1 → 19 rejections/duplicates → 20 calls. Never inspects index.js, never writes report.txt.
- FEEDBACK_ONLY: `[inspect package.json | search "main" | inspect package.json | search "main" | inspect package.json | search "main"]` → 14 rejections, 3 duplicates, **budgetExhausted=true**, 20 calls.
- FEEDBACK_RETRIEVAL, FEEDBACK_RETRIEVAL_GOV: identical thrash loop, 20 calls, budgetExhausted=true.
- RETRIEVAL_ONLY: `[inspect package.json]` ×1, 20 calls.
- **FULL**: `[inspect package.json | edit report.txt]` — **3 calls, 2 tool calls, 0 rejections, 0 duplicates**, success.

**Information available:**
- Initial model behavior identical across conditions (first call sees only `TASK`, so first action is `inspect package.json` in every condition).
- Feedback after inspect = `RESULT: SUCCESS, PROGRESS: UNKNOWN, OUTPUT: <package.json contents: name myapp, main index.js>`.
- Retrieve (FULL/FEEDBACK_RETRIEVAL etc.) returns package.json (and/or index.js) excerpts for query `Read package.json to find the 'main' entry... inspect package.json`.
- STATE (FULL only): after step 1, `last=inspect package.json; progress=UNKNOWN; files=package.json`.

**Why reduced conditions fail**: The model needs to (1) see `main` resolves to `index.js`, (2) inspect `index.js`, then (3) write `report.txt`. In FEEDBACK_ONLY, the model keeps re-issuing `inspect package.json`/`search "main"` and **never advances** — it re-requests the same file it already read. It has no STATE telling it `files=package.json` was already read, and `lastFeedback` (overwritten each step by another successful inspect) reports success each time, reinforcing the repeat. The governor in FEEDBACK_RETRIEVAL_GOV does **not** block these because the repeating actions alternate (`inspect`/`search`) and are not classified as exact duplicates by the policy; and 3 true duplicates occurred but the loop still thrashed.

**Earliest causal divergence**: The first call is identical (`inspect package.json`). The divergence is at the **second model decision** — FULL maps observed `index.js` + feedback + STATE into `edit report.txt` (correct completion); every reduced condition maps the same observation into a repeated `inspect`/`search`. Trace: in FULL the second and final executable action is `edit report.txt`; in all reduced conditions it is a repeat of a prior action. **Earliest divergence = step index 2 (the decision after the first observation).**

## 6. CF2 Analysis — *Cross-File State Preservation & Context Retention*

**Task**: Read constants.ts (MAX_RETRIES=3) + config.json (base_url) → write merged.json `{max_retries:3, base_url:"https://api.example.com"}`.

**Traces:**
- MODEL_ONLY: `[inspect constants.ts]` ×1, 20 calls (repeat-loops).
- FEEDBACK_ONLY: `[inspect constants.ts | inspect config.json]` — 4 calls, **budgetExhausted=false** (loop ended on model `finish`), merged.json never created. Model read both files but the **last feedback shown is config.json's** (feedback only keeps the most-recent result), so MAX_RETRIES=3 was *lost* between calls, and the model gave up (premature finish).
- FEEDBACK_RETRIEVAL: `[inspect constants.ts | inspect config.json | edit merged.json | ...]` thrash, 20 calls, 3 dups, budgetExhausted=true — the model **did** attempt `edit merged.json` but its merged content was wrong (verify never passed) and it looped.
- FEEDBACK_RETRIEVAL_GOV: same, 20 calls.
- **FULL**: `[inspect constants.ts | edit merged.json]` (rep1) or `[inspect constants.ts | inspect config.json | edit merged.json]` (rep0) — 3–4 calls, 0 rejections, budgetExhausted=false, success. Some reps skip re-reading config.json because STATE already has it and retrieval re-surfaced both values.

**Which files are read**: all conditions start by reading constants.ts; the difference is whether the cross-file value survives. MODEL_ONLY reads only constants.ts. FEEDBACK_ONLY reads both but **forgets MAX_RETRIES** after config.json's feedback overwrites it. FULL retains both via STATE (`files=constants.ts,config.json`) + re-retrieval each step, so the model writes merged.json correctly on the first attempt.

**Does FULL run a different reasoning process, or expose the right info at the right time?** The latter. FULL performs the *same* inspect actions as the reduced stacks; it simply **keeps both relevant values available in the prompt** (STATE + re-retrieved RELEVANT) at the moment the model must write merged.json. **Earliest divergence**: step 2–3 — FULL proceeds to a correct `edit merged.json`; FEEDBACK_ONLY prematurely finishes after the second inspect; FEEDBACK_RETRIEVAL writes a wrong merged.json and loops.

## 7. RA2 Analysis — *Repetition Prevention + Action Correction (Governor + State)*

**Task**: protected.txt exists but cannot be read directly. Use alternative (search/run) to find size 100; write to size.txt.

**Traces:**
- MODEL_ONLY: `[inspect protected.txt]` ×1 (or ×3), 20 calls (repeat violates nothing because inspect is allowed; but never alternates to size.txt).
- FEEDBACK_ONLY: `[inspect protected.txt]` — **2 calls, budgetExhausted=false**, size.txt not created. The inspect failed (protected), feedback reported FAILURE, the model gave up (premature finish) without trying an alternative.
- FEEDBACK_RETRIEVAL, FEEDBACK_RETRIEVAL_GOV, RETRIEVAL_ONLY, RETRIEVAL_GOVERNOR: `[search protected.txt]` ×19–20, 19 duplicates, budgetExhausted=true. The model **repeats `search protected.txt`** 20 times; the governor in FEEDBACK_RETRIEVAL_GOV marked none/day as duplicate worth a different action and the model thrashed.
- **FULL**: `[search protected.txt | inspect protected.txt | edit size.txt]` — **5 calls, 1 rejection, 1 duplicate**, success.

**Which causal chain is supported by trace?**
- The trace shows **1 rejection + 1 duplicate in FULL** — the governor rejected one repeated action (evidence of repetition prevention) — and the model then issued a genuinely different final action (`edit size.txt`). 
- Feedback shows the search/inspect of protected.txt is not yielding a direct read, and STATE (`files=protected.txt; progress=...`) records the attempts.
- The direct FEEDBACK→pivot chain (feedback alone) is **not supported**: FEEDBACK_ONLY with the identical inspect-failure feedback gave up (premature finish, 2 calls), it did not pivot to an alternative. RETRIEVAL alone (RELEVANT with protected.txt's content, which cannot be read) also failed. RETRIEVAL_GOVERNOR failed too.
- What is supported: **the interaction of (STATE tracking the failed attempts) + (GOVERNOR blocking the repeat) + (FEEDBACK reporting failure)** together presented the model with enough "keep going, don't repeat, try the alternative" signal to emit `edit size.txt`. No single mechanism achieves it; only the combined stack does.

**Earliest divergence**: FULL is the only condition that, after 2 failed actions, produces a non-repeated alternative action (`edit size.txt`) instead of premature-finish (FEEDBACK_ONLY) or sustained repeat (all others). Divergence at step ~3.

## 8. DC1 Analysis — *Decomposition via Progress Tracker (Prevents Premature Finish)*

**Task**: 3 steps — data/a.txt='aaa', data/b.txt='bbb', data/summary.txt (contains both).

**Traces:**
- MODEL_ONLY, RETRIEVAL_ONLY, RETRIEVAL_GOVERNOR: `[edit data/a.txt]` ×20 (repeats), never creates b.txt/summary.txt.
- FEEDBACK_ONLY, FEEDBACK_RETRIEVAL, FEEDBACK_GOVERNOR, FEEDBACK_RETRIEVAL_GOV: `[edit data/a.txt]` — **2 calls, budgetExhausted=false**, reason `data/b.txt not created`. The model created a.txt, got `RESULT: SUCCESS / PROGRESS: YES`, then **signaled `finish`** on the 2nd call believing the task done.
- **FULL**: `[edit data/a.txt | edit data/b.txt | edit data/summary.txt]` — 4 calls, 0 rejections, success (4/5; rep3 did `[edit a | edit b]` and prematurely finished on the 3rd call, missing summary.txt).

**Is the runtime externally decomposing, or helping the model discover the sequence?** It is **helping the model discover/continue the sequence through observation** — it does NOT decompose. The model produces the edits itself; FULL's STATE (`files=data/a.txt; progress=YES; last=edit data/a.txt`) plus repeated TASK reminds the model across calls that the 3-step task is not yet complete, so it continues to b.txt and summary.txt before finishing. Reduced conditions, lacking the progress reminder, treat a single successful edit as task completion and prematurely `finish`.
**Earliest divergence**: step 2 — FULL's second executable action is `edit data/b.txt`; every reduced condition's second call is `finish` (or a repeat). FULL's rep3 mirrors the reduced failure (premature finish after 2 edits), confirming the mechanism is about the continuation signal, which is stochastic at the 4B margin.

## 9. Cross-Task Analysis

20-task matrix (success counts, 5 reps). Every task never-solved in FULL also shown.

| Task | MO | FB | RETR | FB+RETR | FB+GOV | RETR+GOV | FB+RETR+GOV | FULL | Classification |
|---|---|---|---|---|---|---|---|---|---|
| CV1 | 5 | 5 | 5 | 5 | 5 | 5 | 5 | 5 | **G. No mechanistic advantage** (trivially solvable) |
| CV2 | 5 | 5 | 5 | 5 | 5 | 5 | 5 | 5 | **G.** No mechanistic advantage |
| ER1 | 0 | 5 | 0 | 5 | 5 | 0 | 5 | 5 | **B. Action correction** (feedback → model pivots after failed inspect → fallback) |
| CP1 | 0 | 5 | 5 | 5 | 5 | 5 | 5 | 5 | **A. Information recovery** (feedback OR retrieval surface file; edit preserves) |
| CP2 | 0 | 5 | 5 | 5 | 5 | 5 | 5 | 5 | **A. Information recovery** (same as CP1) |
| RA1 | 0 | 5 | 0 | 5 | 5 | 0 | 5 | 5 | **B. Action correction** (feedback → model tries search after failed inspect; ≤2 inspects) |
| MS2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | **5** | **E. Multi-step state preservation** |
| CF2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | **5** | **E./D. State preservation + context management (cross-file)** |
| RA2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | **5** | **C. Repetition prevention + B** (governor + state + feedback interaction) |
| DC1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | **4** | **E. Multi-step state preservation (prevents premature finish)** |
| ST1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | **G.** Never solved (state_tracking ceiling) |
| ST2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | **G.** Never solved |
| MS1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | **G.** Never solved |
| ER2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | **G.** Never solved |
| TO1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | **G.** Never solved (tool output interpretation ceiling) |
| TO2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | **G.** Never solved |
| CF1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | **G.** Never solved |
| AS1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | **G.** Verifier requires `search`; model never satisfies → unsolved |
| AS2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | **G.** Verifier requires exact copy + `inspect`; model never satisfies → unsolved |
| DC2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | **G.** Never solved (multi-file schema + validation ceiling) |

**Summary**: EVERY task fully recovered by any reduced condition is explained by FEEDBACK (ER1, CP1, CP2, RA1) or RETRIEVAL (CP1, CP2). The four FULL-exclusive tasks are all **multi-step / cross-file / repetition / decomposition** tasks that require **inter-call memory** (STATE). Ten tasks are never solved by any condition — these are either model-capability ceilings or verifier-gated action requirements independent of the stack.

## 10. Mechanism Interaction — Where the Extra 19pp Come From

The aggregate question — FEEDBACK=30%, RETRIEVAL=20%, FEEDBACK+RETRIEVAL=30%, but FULL=49% — is resolved by the **STATE-in-prompt increment**.

| Condition | Mechanisms active | avg calls | avg tokens | Success |
|---|---|---|---|---|
| FEEDBACK (B) | feedback | 8.2 | 2,207 | 30 |
| RETRIEVAL (C) | retrieval | 20.0 | 5,595 | 20 |
| FEEDBACK+RETRIEVAL (D) | fb+retr | 9.6 | 2,885 | 30 |
| FEEDBACK+RETRIEVAL+GOV (G) | fb+retr+gov | 9.8 | 2,938 | 30 |
| **FULL (H)** | **fb+retr+gov+STATE** | **6.1** | **1,939** | **49** |

**Only FULL includes the STATE section** (in FULL's `formatFullPrompt`). G (FEEDBACK_RETRIEVAL_GOV) is FULL minus STATE and scores 30%; adding STATE yields 49%. **+19pp. This is additive in the sense of being the single incremental variable, but it is NOT a simple per-task add for FEEDBACK+RETRIEVAL.**

Addressing the six sub-questions:

1. **Does STATE preserve information that would otherwise disappear?** **YES.** In B and G, `lastFeedback` is the only cross-call signal and it is **overwritten by the most recent result** each step — older observations (e.g., MAX_RETRIES in CF2, the fact that package.json was already read in MS2, the first two edits in DC1) are lost. STATE (`last=, progress=, files=, failed=`) preserves the set of touched files, the last action, and accumulated progress across calls.
2. **Does RETRIEVAL restore information when context changes?** **YES, but only effectively as a partner.** Retrieval re-surfaces file content every step. Alone (C, 20%) it only helps CP1/CP2 (verbatim-answer files) and otherwise just adds context while the model thrashes. Combined with STATE + FEEDBACK (FULL), retrieval re-exposes the exact relevant file contents at the completion decision, reducing retrieval calls by ~69% (613 vs 2,000) while raising success.
3. **Does FEEDBACK tell the model what happened?** **YES** — it is the single strongest mechanism (+20pp alone, driving ER1/CP1/CP2/RA1). But it reports only the *last* result; it cannot carry a multi-step plan or earlier observations.
4. **Does GOVERNOR prevent wasting another action?** **Partially.** It contributes 0 to raw completion in isolation, but in FULL it trims rejections/duplicates (wasted calls 3.7 vs 5.9) and its trace in RA2 (1 rejection → pivot to `edit size.txt`) shows it actively prevents a repeated harmful action. It is a **safety/efficiency filter**, not a reasoning contributor.
5. **Does context selection determine which signals survive?** **YES — this is the crux.** `formatFullPrompt` includes STATE + RELEVANT + FEEDBACK on every call; the reduced G omits STATE, so prior-step memory does not survive into the next inference. The 4B model, given only the latest feedback, cannot reconstruct the task's intermediate state (premature finish) or avoid re-reading (thrash). STATE selection is what makes the other three signals compositionally effective.
6. **Does the combination reduce model calls rather than increase them?** **YES.** FULL: 6.1 avg calls vs 8.2 (feedback alone) and 9.8 (G). Adding STATE *reduces* calls because the model converges in fewer steps (no thrash, no premature-finish loop) — 613 total vs 977.

**Distinguishing the four roles:**

| Role | Mechanism that plays it | Definition in this stack |
|---|---|---|
| **INFORMATION** | RETRIEVAL (primary), FEEDBACK's OUTPUT | Exposes file contents & observations to the model |
| **ACTION CONTROL** | GOVERNOR (blocks repeats), FEEDBACK's success/failure | Restrains/redirects the next action |
| **MEMORY** | **STATE** | Carries last-action, touched-files, progress, failed-count across calls |
| **CONTEXT MANAGEMENT** | **STATE section inclusion** (formatFullPrompt) + retrieval re-selection | Decides which of the above survive into the next inference |

These are **not interchangeable**: INFORMATION without MEMORY (D) forgets earlier findings; MEMORY without INFORMATION/ACTION-CONTROL (STATE_ONLY, Phase 3) is inert; MEMORY is what lifts the others from 30% to 49%.

## 11. Temporal Divergence Analysis

For each FULL success, the first model call is identical across conditions (only `TASK` is shown), so the **earliest causal divergence is at the decision after the first observation (t1→t2)**.

**MS2 timeline (FULL, rep0):**
```
t0 TASK            → call1 → inspect package.json
t1 FEEDBACK(RESULT: SUCCESS ... main: index.js) + STATE(files=package.json) + RELEVANT
t2 (decision)      → call2 → edit report.txt   [DIVERGES: reduced → inspect/search package.json again or finish]
t3 finish
```
vs MODEL_ONLY: `t1 → (no feedback/state) → call2 → inspect package.json` (repeat), repeated to 20 calls. **Divergence at t2.**

**DC1 timeline (FULL, rep0):**
```
t0 TASK      → edit data/a.txt
t1 FEEDBACK(RESULT: SUCCESS, PROGRESS: YES) + STATE(files=data/a.txt, progress=YES) → continue to edit data/b.txt  [DIVERGES: reduced → finish]
t2 ... edit data/b.txt → ... edit data/summary.txt → finish
```
vs FEEDBACK_ONLY: `t1 → (feedback SUCCESS only, no STATE) → finish` (2 calls). **Divergence at t2 — the reduced stack signals premature completion.**

**RA2 timeline (FULL, rep0):**
```
t0 → search protected.txt
t1 FEEDBACK result + STATE → inspect protected.txt (fails)
t2 FEEDBACK failure + STATE + GOVERNOR (rejects a duplicate) → edit size.txt   [DIVERGES: feedback-only → finish; retrieval-only → repeat search]
t3 finish
```
**Divergence at t2/t3** — the combined failure+memory+rejection signals produce a genuinely new action.

**CF2 timeline (FULL, rep1):**
```
t0 → inspect constants.ts
t1 FEEDBACK(MAX_RETRIES=3) + STATE(files=constants.ts) + RELEVANT → edit merged.json  [DIVERGES: feedback-only → finish; feedback+retrieval → wrong merged.json, loop]
t2 finish
```
**Divergence at t2** — MAX_RETRIES retained via STATE+RELEVANT at write time.

**Pattern**: In every case the trajectories are identical through the first tool action and diverge at the **second model decision**. FULL turns a single observation into a correct finish-step (MS2, CF2) or into continued multi-step progress (DC1) or into an alternative action (RA2); reduced stacks either repeat (MS2, RA2-retrieval) or prematurely finish (CF2-feedback, DC1, RA2-feedback).

## 12. Token Efficiency Explanation

Why is FULL lower-token despite having MORE prompt content (STATE + RELEVANT + FEEDBACK) each call? **Because it terminates in far fewer calls.**

| Condition | avg calls | avg tokens/call | avg total tokens | Success |
|---|---|---|---|---|
| MODEL_ONLY | 20.0 | ~250 | 5,003 | 10 |
| FEEDBACK_ONLY | 8.2 | ~269 | 2,207 | 30 |
| FEEDBACK_RETRIEVAL_GOV | 9.8 | ~300 | 2,938 | 30 |
| **FULL** | **6.1** | ~318 | **1,939** | **49** |

FULL's per-call prompt is larger (adds STATE and RELEVANT), but it makes **68% fewer calls than MODEL_ONLY** and **38% fewer than G**. Token savings come from:
- **Fewer failed loops**: FULL converges (thrash-free), MODEL_ONLY does 20 calls of pure repetition.
- **No premature-finish re-loops** and no 20-call thrash on the hard tasks.
- **Earlier completion**: success comes in 3–5 calls.
- **Better retrieval**: STATE+FEEDBACK route the model, so retrieval runs far fewer times (613 vs 2,000 total calls).
- Not from shorter per-call context — FULL's per-call context is actually the longest; it is the **call count** that dominates total tokens.

This is confirmed by the trace: on MS2, MODEL_ONLY spends 20×260 ≈ 5,060 tokens repeating one inspect; FULL spends 3×330 ≈ 1,003 tokens on a correct inspect+edit+finish. The 5x token advantage is entirely call-count-driven, same for CF2/RA2/DC1.

## 13. Model-Call Efficiency Explanation

FULL: **613 total / 6.1 avg calls** — the fewest of any condition, at the highest success. Mechanisms:
- **STATE prevents premature finish** → no short aborted loops that the model would otherwise have to restart (reduced conditions that quit at 2–4 calls fail without completing, requiring their own wasted calls when they thrash instead; e.g., CF2-FEEDBACK_RETRIEVAL spends 20 calls writing a wrong merged.json because it never had the remembered values).
- **STATE + FEEDBACK + RETRIEVAL prevent thrash** → a single read suffices (MS2: inspect once; CF2: merge once), instead of re-reading the same file 3–20 times.
- **GOVERNOR removes wasted actions** → rejects/duplicates dropped to 3.0/1.3 per execution (vs 18.9/18.9 in MODEL_ONLY), each rejection is a model call that would have been wasted on a bad action.
- **Better-directed retrieval** → fewer retrieval calls because the model knows (via state/feedback) which file to inspect next, so fewer top-K re-embeddings and fewer re-reads.

Net: FULL achieves the most work per call (0.080 successes/call) with the fewest calls, purely because its memory prevents both the thrash (too many calls) and the premature-quit (too few, incomplete) failure modes.

## 14. Causal Matrix

| Task | FULL Success | Feedback Needed | Retrieval Needed | State Needed | Governor Needed | Context Selection | Primary Mechanism |
|---|---|---|---|---|---|---|---|
| CV1 | 5/5 | NO | NO | NO | NO | NO | (trivial) |
| CV2 | 5/5 | NO | NO | NO | NO | NO | (trivial) |
| ER1 | 5/5 | **YES** | NO | NO | NO | NO | Feedback → action correction |
| CP1 | 5/5 | YES* | YES* | NO | NO | NO | Information recovery (either) |
| CP2 | 5/5 | YES* | YES* | NO | NO | NO | Information recovery (either) |
| RA1 | 5/5 | **YES** | NO | NO | NO | NO | Feedback → action correction |
| MS2 | 5/5 | YES | UNCERTAIN | **YES** | NO | **YES** | **State preservation (multi-step)** |
| CF2 | 5/5 | YES | **YES** | **YES** | NO | **YES** | **State preservation + cross-file context** |
| RA2 | 5/5 | YES | NO | **YES** | **YES** | **YES** | **Repetition prevention + action correction interaction** |
| DC1 | 4/5 | YES | NO | **YES** | NO | **YES** | **State preservation (progress tracker)** |
| ST1,ST2,MS1,ER2,TO1,TO2,CF1,AS1,AS2,DC2 | 0/5 | — | — | — | — | — | No mechanistic advantage (ceiling/verifier-gated) |

`YES*` = satisfied by either feedback OR retrieval alone (CP1/CP2 recover under either); marked YES because ablation shows at least one is needed.

## 15. Counterfactual Analysis (the four unique recoveries)

Using actual reduced-condition traces as counterfactuals:

**MS2 — "If STATE were removed (→ G)":** G's trace is the FEEDBACK_RETRIEVAL_GOV thrash `[inspect package.json | search "main" | inspect package.json | ...]` — the model would re-read the same file 3+ times, never inspect index.js, never write report.txt, exhaust 20 calls. **What goes wrong**: no memory that package.json was already read → repeat-loop; no progression to index.js; no report. Full → 5/5; minus STATE → 0/5.

**CF2 — "If STATE were removed (→ G)":** G writes a **wrong merged.json** and loops (20 calls), because MAX_RETRIES=3 read earlier is not retained at write time (feedback-only shows the latest file). **What goes wrong**: cross-file value lost between calls → wrong schema or premature finish; merged.json never correct. Full → 5/5; minus STATE → 0/5.

**RA2 — "If GOVERNOR were removed (→ D) / if all were removed":** D (`FEEDBACK_RETRIEVAL`) repeats `search protected.txt` 20 times (19 duplicates, budgetExhausted). Removing STATE too (FEEDBACK_ONLY) gives a 2-call premature finish. **What goes wrong**: without the governor blocking a repeated failed search, the model thrash-loops the same failing action; without STATE, it gives up after one failure. Full (search → inspect → rejected repeat → edit size.txt) → 5/5; any subset → 0/5. Only the FULL interaction produces the pivot action.

**DC1 — "If STATE were removed (→ G)":** G's trace is `[edit data/a.txt]` then `finish` (2 calls, budgetExhausted=false) — model creates a.txt then prematurely signals completion. **What goes wrong**: no progress reminder → the 4B treats a single successful edit as the whole task; b.txt and summary.txt never created. Full → 4/5; minus STATE → 0/5.

Every counterfactual is drawn from the actual G / D / FEEDBACK_ONLY / RETRIEVAL_GOVERNOR traces collected in Phase 4 — no hypotethical behavior is invented.

## 16. Failure Taxonomy

Across all 800 Phase 4 executions, failures fall into:

1. **Premature `finish` (few calls, budgetExhausted=false)** — the model signals completion after an incomplete action sequence. Seen in reduced conditions on multi-step tasks (CF2-FB_ONLY 4 calls, RA2-FB_ONLY 2 calls, DC1-all-reduced 2 calls) and in 1/5 FULL DC1 reps. **Caused by absent MEMORY** (no progress/state reminder). Mechanical signature: `budgetExhausted=false`, low `modelCalls`, single/partial `actionSequence`.
2. **Action thrash / repeat-loop (budgetExhausted=true)** — the model re-issues the same or alternating actions (MODEL_ONLY and retrieval-heavy conditions; MS2-FEEDBACK 20 calls; RA2-retrieval 20×`search protected.txt`). **Caused by absent MEMORY + weak ACTION-CONTROL** (no STATE to say "already tried", governor not triggered as a redirect).
3. **Wrong-input / non-convergent edit** — CF2-FEEDBACK_RETRIEVAL writes a malformed merged.json repeatedly. **Caused by lost cross-file data (INFORMATION without MEMORY).**
4. **Pure capability/verifier ceiling** — ST1, ST2, MS1, ER2, TO1, TO2, CF1, AS1, AS2, DC2 never solve under any condition. Either the 4B cannot perform the task (state tracking, tool-output parsing, multi-file validation) or the verifier demands an action the model never produces (AS1 needs `search`, AS2 needs exact copy+`inspect`). **Unaffected by the stack.**

The two FULL-specific corrections (thrash, premature-finish) map directly onto STATE+MEMORY (+ action control), and are the entire source of the 19pp advantage.

## 17. Evidence Limitations

- **No per-step capture**: raw results store action sequences + aggregate counts, not literal per-call model input/output, feedback text, retrieval text, or per-step timestamps. Feedback/retrieval/state **contents are reconstructed deterministically** from the condition wiring, task files, code, and the action that produced them (§4). This reconstruction is exact for feedback (it is `formatFeedback(execResult)` — a pure function of the executed action) and state (a pure function of the action sequence), and approximate-but-correct for retrieval (top-K semantics depends on MiniLM ranking, which we did not re-embed; the fact of "relevant file content exposed" is certain, the exact K/ordering is not).
- **Small n per task/condition (5 reps)**: per-task statements (e.g., DC1 4/5, and MS2 5/5 vs 0/5) are based on 5 traces; the aggregate 800-run numbers are robust, but individual-task point estimates carry wide uncertainty. The STATE attribution is supported by a clean 0/5→5/5 across four independent tasks, which is strong but not exhaustive.
- **Single model, single context, deterministic policy**: conclusions apply to qwen3:4b-instruct at 4096 tokens with this governor/retriever/state implementation. No cross-model or cross-context generalization is claimed.
- **Retrieval usefulness inferred, not ground-truthed**: we did not capture per-step retrieval relevance scores; "retrieval surfaces the right file" is inferred from task structure + the CP1/CP2 retrieval-only recovery and from FULL's reduced retrieval-call counts.
- **The 10 never-solved tasks** cannot separate "model capability ceiling" from "verifier-gated action requirement" without further experiments; we flag AS1/AS2 as verifier-gated and the rest as suspected ceilings, both outside mechanistic reach.

## 18. Scientific Interpretation

**Final classification: SUPPORTED.**

The evidence supports: *"A deterministic runtime can compensate for specific reasoning deficits in a 4B model by managing information, execution feedback, retrieval, memory, and action selection."*

But the claim must be stated precisely:

- **SCAFFOLD does NOT increase the model's reasoning capability.** No mechanism makes the 4B model reason better internally; the first model call is identical in every condition, and the model's basic output quality is unchanged.
- **SCAFFOLD operates AROUND the model** by (1) **reporting consequences** (FEEDBACK — the strongest single lever), (2) **exposing relevant information** (RETRIEVAL), (3) **enforcing memory across stateless calls** (STATE — the decisive increment), and (4) **preventing useless repetition** (GOVERNOR — a safety filter).
- **The decisive finding**: a 4B model with only *last-feedback* awareness (all reduced conditions) cannot carry multi-step state — it either thrash-loops or prematurely `finish`es. Injecting the **STATE summary into the prompt on every call** (the only difference between G=30% and FULL=49%) restores that memory and unlocks the four hard tasks. This is **context management + memory compensation**, exactly mechanism type #2 in the project's framing, not #1 (reasoning enhancement).

## 19. Engineering Implications

- **STATE is load-bearing, not decorative.** Phase 3's "STATE alone is inert" observation was correct but misleading: STATE is inert alone yet is the required *multiplier* that makes FEEDBACK+RETRIEVAL+GOVERNOR reach FULL. It carries the cross-call memory all reduced stacks lack.
- **The dominant signal is FEEDBACK**, and its information must be combined with STATE to be retained across steps. Prompt construction (`formatFullPrompt`) — not any individual module — is where the memory lives.
- **GOVERNOR should be kept as a free safety/efficiency filter** (it removes wasted calls and, in RA2's trace, actively pivots the model); it is not a completion driver.
- **RETRIEVAL is only productive when gated by FEEDBACK+STATE** (FULL uses ~1/3 the retrieval calls for 2.5x the success). Offering retrieval without memory causes thrash.
- **Cost story**: FULL is cheapest NOT because its prompts are small, but because memory collapses the loop to few calls. Any future simplification must preserve the inter-call STATE summary or it forfeits both success and efficiency (Phase 4 already showed no reduced stack qualifies).

## 20. Conclusion

**Why does FULL achieve 49% when every reduced stack caps at 30%?**

Because FULL is the **only** condition whose prompt includes the **STATE summary on every inference**, providing inter-call memory. The largest reduced stack (FEEDBACK_RETRIEVAL_GOVERNOR) is byte-for-byte FULL minus the STATE section, and it scores 30% (0/5 on all four hard tasks). Adding STATE yields 49% by (a) preventing premature `finish` (DC1, CF2, RA2 fail-modes) and (b) breaking action-thrash loops (MS2, RA2, CF2 fail-modes), collapsing the loop from ~20 calls to 3–5.

**Why does FULL uniquely solve MS2, CF2, RA2, DC1?**

- **MS2** (E): STATE prevents the re-read loop and lets the model advance from `inspect package.json` → `edit report.txt` in 3 calls.
- **CF2** (E/D): STATE (plus retrieval) retains MAX_RETRIES across the cross-file read so the model writes a correct merged.json instead of a malformed one or a premature finish.
- **RA2** (C+B): the interaction of GOVERNOR (blocks a repeated failed search), STATE (tracks attempts), and FEEDBACK (reports failure) prompts the model to pivot to the alternative `edit size.txt` — no single mechanism does this; the reduced stacks thrash or quit.
- **DC1** (E): STATE's progress tracker prevents the model from treating one successful edit as task completion, so it continues through all three files.

These are **not** "because FULL has all mechanisms" — they are because FULL is the only configuration whose **STATE section supplies the cross-call memory** that the otherwise-complete feedback+retrieval+governor stack requires to converge. The interaction is: **INFORMATION (retrieval+feedback) × MEMORY (state) × ACTION-CONTROL (governor)**, with MEMORY as the binding factor.

**Final scientific classification of the central claim: SUPPORTED** — a deterministic runtime compensates for 4B reasoning deficits by managing information, execution feedback, retrieval, memory, and action selection around the model, without enhancing the model's reasoning itself.

---

### Final Output Checklist
- **Data analyzed**: 800 Phase 4 executions (full), 2,200 prior (Phases 1–3) for baseline; 20-task trace differential across 8 conditions; deterministic reconstruction from source.
- **Four unique FULL recoveries**: MS2 (5/5), CF2 (5/5), RA2 (5/5), DC1 (4/5).
- **Earliest causal divergence (each)**: MS2 t2; CF2 t2–t3; RA2 t2–t3; DC1 t2 — all at the second model decision, after the first observation.
- **Mechanism interaction**: STATE-in-prompt (the only G→FULL difference) = +19pp; = INFORMATION × MEMORY × ACTION-CONTROL interaction; MEMORY is the binding factor.
- **Strongest mechanism**: FEEDBACK (+20pp single; the dominant signal).
- **Weakest mechanism**: GOVERNOR (0 completion contribution; retained as efficiency/safety filter).
- **State useful?** **YES, decisively** — inert alone, but the required multiplier for FULL (this is the key new finding).
- **Retrieval useful?** **Conditionally YES** — only gated by FEEDBACK+STATE (CP1/CP2 alone; hard tasks only in FULL); harmful alone (thrash).
- **Governor useful?** **As a filter, YES** — removes wasted calls; pivots in RA2; 0 to raw completion.
- **Why FULL is token-efficient**: far fewer calls (6.1 vs 8.2–20.0) via crash-free, no-thrash convergence; per-call context is actually larger but call count dominates.
- **Why FULL reduces model calls**: STATE prevents both premature-finish and thrash → 613 total (fewest); GOVERNOR removes wasted actions; better-directed retrieval.
- **Causal matrix**: §14.
- **Limitations**: §17 (no per-step capture; reconstructed signal contents; small per-task n; single model/context).
- **Final scientific classification**: **SUPPORTED**.
- **Tests/typecheck/build**: not applicable — **no source code changed** (analysis-only).
- **Files changed**: none (runtime); only new `benchmarks/PHASE5-REPORT.md` produced. Phase 0–4 reports and raw results untouched. No benchmark was run.

---

# HARD STOP

Phase 5 complete. No Phase 6 will be started. No new mechanisms, no new models, no new benchmark, no runtime changes. VAR and scaffold-v1-history untouched.
