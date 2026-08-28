# Phase 8 Report: Can Retrieval be Made Adaptive?

## 1. Objective

Determine whether retrieval can be made **adaptive** (deterministic, using ONLY existing retrieval-time signals) to preserve RETRIEVAL_75's efficiency while recovering cases where a 225-char slice loses information the model needs. No new cognitive mechanism. Per the objective, this is a **negative-result** investigation: the honest answer is that **no defensible deterministic retrieval-time signal exists** on this benchmark, so adaptive retrieval cannot be justified and adds nothing.

## 2. Phase 6 Findings

Phase 6 (1000 executions) concluded RETRIEVAL_75 was SUPPORTED: 49% (49/100) vs FULL 47% (47/100), with 0 regressions and lower tokens/latency. That conclusion motivated Phase 7 to verify stability at higher N. **Phase 8 re-examines that premise**: if the retrieval slice is never binding, the Phase 6/7 differences could be stochastic call-count variance rather than a real information-preserving efficiency gain.

## 3. Phase 7 Findings

Phase 7 (400 executions, 10 reps) found FULL 47.5% (95/200) vs RETRIEVAL_75 48.5% (96/198), 3 conversions vs 2 regressions, McNemar p=1.0 (NS), 95% CI [-1.7%, +2.7%]. Classification: PARTIALLY SUPPORTED. Per-call prompt tokens were near-identical (FULL 302.6 vs R75 301.6) — already hinting the per-call payload does not differ.

## 4. TO1 Regression Analysis

The TO1 workspace is a single 39-char check.sh. **Neither FULL (300-char) nor RETRIEVAL_75 (225-char) truncates it** — both ship the identical ~10-token payload (Phase 7: FULL_TO1 avgRetr=204 vs R75 avgRetr=211, essentially identical). The Phase 7 TO1 regression (2/10 vs 0/10) is therefore **stochastic noise, NOT retrieval truncation**. A truncation-based adaptive policy cannot restore TO1; attempting to do so would be hard-coding (forbidden).

## 5. Adaptive-Policy Design

Candidate policy (ADAPTIVE_LENGTH / ADAPTIVE_TOPK / ADAPTIVE_HYBRID): start from RETRIEVAL_75 (top-3, 225-char slices) and **expand toward FULL (300-char / more items) only when the deterministic truncation signal fires** — i.e. when a retrieved source's full content length exceeds the base slice limit (the slice is a proper truncation of the available source). This preserves efficiency when sources are short and recovers context when a result genuinely needs more. The policy is a pure function of retrieval-time items: id, full content length, rank, similarity. It was implemented in src/retrieval/adaptive-budget.ts with deterministic unit tests.

## 6. Allowed Signals

The ONLY allowed, deterministic, retrieval-time signal that distinguishes a 'sufficiently informative' slice from a 'truncated' slice is: **available source content length > base slice limit** (i.e. the selected result is truncated). Equivalent signals (result rank, similarity score, result count, retrieved slice length, context budget, duplication) do NOT report truncation — none of them tell the policy that a slice lost information, because none of them compare slice length to available source length. Hindsight, verification outcomes, model confidence, and self-assessment remain forbidden and are not used.

## 7. Threshold Justification

The base threshold is RETRIEVAL_75's 225-char slice (the well-characterized Phase 6/7 config). The expansion ceiling is FULL's 300-char slice. The trigger (content.length > 225) is not an arbitrary knob — it is the exact condition under which the RETRIEVAL_75 slice is a proper truncation of a source that exists in the workspace. Below 225 the model already receives the complete source, so expansion would add redundant text with no information gain; above 225 expansion is the minimal change that restores the information RETRIEVAL_75 dropped. Top-k variant: allow the normally-admitted item to use its full available content (up to 300) once ANY result is truncated.

## 8. Experimental Design

- Tasks: 20 (2 per each of 10 categories), unchanged, deterministic verification.
- Conditions: 2 run for empirical proof — RETRIEVAL_75 (fixed baseline) and ADAPTIVE_HYBRID (deterministic, truncation-triggered).
- Repetitions: 5 per condition (short proof-of-parity), Total: 20 x 5 x 2 = 200.
- **Paired design**: each (task, rep) run under both conditions adjacent, order alternating by (rep+task-index) parity; task order rotates by rep.
- Results stored separately at benchmarks/results/phase8/; checkpoint/resume every 5; 150s per-execution infra timeout.

**Why only 200 executions and not 500:** the trigger is a **structural property** of the task suite. The audit below (section 23) is a *proof* (0/33 sources truncated), not a statistical estimate — no finite run can refute it. Running ADAPTIVE_LENGTH / ADAPTIVE_TOPK / ADAPTIVE_HYBRID at full scale would have produced data byte-identical to RETRIEVAL_75 (already measured across Phases 6-7), proving nothing new. Per the objective's explicit guidance ('if no defensible deterministic signal exists: DO NOT manufacture one'), fabricated large-scale ADAPTIVE runs would be pretending a condition is valid. The 200-execution parity run empirically confirms identity without waste. No condition was invented or faked for this negative result.

## 9. RETRIEVAL_75 Results

| Metric | RETRIEVAL_75 |
|---|---|
| Executions (non-infra) | 100 |
| Completion | 47/100 (47.0%) |
| Model calls (total) | 507 |
| Total tokens (total) | 160 197 |
| Avg model calls / exec | 5.1 |
| Avg retrieval tokens / exec | 76.3 |
| Avg prompt tokens / call | 301.4 |
| Avg total tokens / exec | 1602 |
| Avg latency | 5.6s |

## 10. ADAPTIVE_HYBRID Results

| Metric | ADAPTIVE_HYBRID |
|---|---|
| Executions (non-infra) | 100 |
| Completion | 47/100 (47.0%) |
| Model calls (total) | 523 |
| Total tokens (total) | 165 650 |
| Avg model calls / exec | 5.2 |
| Avg retrieval tokens / exec | 76.3 |
| Avg prompt tokens / call | 302.9 |
| Avg total tokens / exec | 1657 |
| Avg latency | 5.2s |

## 11. Adaptive Results (overall)

The adaptive policy made **zero expansions** (0/33 possible, 0 across all 200 executions). ADAPTIVE_HYBRID therefore renders the identical retrieval text as RETRIEVAL_75 on every execution. Any completion/token difference between the two conditions below is stochastic model-call variance, exactly analogous to the Phase 7 FULL-vs-RETRIEVAL_75 result. Adaptive retrieval provides **no benefit and no cost** on this benchmark — it is inert.

## 12. Per-Task Results

| Task | R75 pass | R75 n | Ad pass | Ad n |
|---|---|---|---|---|
| ST1 | 0/5 | 5 | 0/5 | 5 |
| ST2 | 0/5 | 5 | 0/5 | 5 |
| MS1 | 0/5 | 5 | 0/5 | 5 |
| MS2 | 4/5 | 5 | 5/5 | 5 |
| ER1 | 5/5 | 5 | 5/5 | 5 |
| ER2 | 0/5 | 5 | 0/5 | 5 |
| TO1 | 0/5 | 5 | 0/5 | 5 |
| TO2 | 0/5 | 5 | 0/5 | 5 |
| CP1 | 5/5 | 5 | 5/5 | 5 |
| CP2 | 5/5 | 5 | 5/5 | 5 |
| CF1 | 0/5 | 5 | 0/5 | 5 |
| CF2 | 5/5 | 5 | 5/5 | 5 |
| AS1 | 0/5 | 5 | 0/5 | 5 |
| AS2 | 0/5 | 5 | 0/5 | 5 |
| CV1 | 5/5 | 5 | 5/5 | 5 |
| CV2 | 5/5 | 5 | 5/5 | 5 |
| RA1 | 5/5 | 5 | 5/5 | 5 |
| RA2 | 5/5 | 5 | 5/5 | 5 |
| DC1 | 3/5 | 5 | 2/5 | 5 |
| DC2 | 0/5 | 5 | 0/5 | 5 |

## 13. Hard-Task Analysis

Given the adaptive policy is inert (0 expansions), hard-task completion (MS2, CF2, RA2, DC1) is governed purely by stochastic call-count variance between the two identical-payload conditions. No adaptive mechanism is engaged on any hard task, so no hard-task recovery is possible. The reported hard-task numbers are baseline model variance, not an adaptive effect.

## 14. TO1 Analysis

TO1's check.sh is 39 chars — never truncated by either 225 or 300. Its payload is ~10 tokens in both conditions. The adaptive policy fired 0 times on TO1. Any TO1 difference across conditions is noise (see section 4).

## 15. Conversion Analysis

Pairwise conversions (ADAPTIVE_HYBRID succeeds where RETRIEVAL_75 failed): 2. Since no execution differs at the retrieval layer, every 'conversion' is a stochastic success, not an adaptive-recovery signal.

## 16. Regression Analysis

Pairwise regressions (ADAPTIVE_HYBRID fails where RETRIEVAL_75 succeeded): 2. McNemar on discordants: p=1.000 (small discordant count; exact binomial used). Paired difference of proportions: 0.0% (95% CI [-3.9%, 3.9%]). Both conditions ship identical retrieval, so this is pure model variance — NOT a regression attributable to adaptive retrieval (which is inert and therefore cannot regress anything).

## 17. Retrieval-Token Analysis

Retrieval is formatted from sources < 100 chars (max 200), so the retrieval slice limit never binds. avgRetr/exec: RETRIEVAL_75 76.3, ADAPTIVE_HYBRID 76.3 — identical by construction. Retrieval calls: 507 vs 523. Per-call prompt tokens (the true efficiency metric) are equal; only total call-count varies stochastically.

## 18. Context Utilization

Input budget is 3840 tokens at 4096 context; retrieved text contributes only ~15 tokens/call. Context is never saturated by retrieval in any condition. Adaptive expansion (when it fires on future suites with longer sources) would add at most ~75 chars (~19 tokens) per expanded result — well within budget — so the policy could never overflow context on allowed inputs.

## 19. Model-Call Efficiency

Since the adaptive policy is inert, model-call counts are identical in distribution to RETRIEVAL_75. Avg calls/exec: R75 5.1, ADAPTIVE 5.2. The Phase 6/7-named 'efficiency' of RETRIEVAL_75 vs FULL is shown (Phase 7) to be purely call-count variance — per-call prompt tokens do not differ because no source is truncated.

## 20. Latency

Avg latency: R75 5.6s, ADAPTIVE 5.2s. Deterministic adaptation adds zero compute (a pure length comparison per retrieval). Latency differences are model-response variance.

## 21. Statistical Analysis

Paired design, 100 task-rep pairs. b=2 (adaptive conversions), c=2 (adaptive regressions). McNemar exact p=1.000. Paired diff 0.0% (95% CI [-3.9%, 3.9%]) — includes 0. Because the adaptive layer is provably inert, these statistics estimate stochastic equivalence, not an adaptive effect.

## 22. Failure Analysis

Infrastructure exclusions (timeouts/crashes): 0. All other failures follow the identical distribution across the two conditions (same payloads). The decisive negative result is not a failure-count difference but the **structural proof** that the adaptive trigger can never fire on this suite.

## 23. Limitations

1. **No task source exceeds 225 chars** — the longest (TO3 files/large.txt) is 200 chars. The truncation signal fires on 0 of 33 files. This is the central limitation and the reason adaptive retrieval is inert here.

2. An adaptive *truncation-recovery* policy can only matter on tasks whose sources exceed the base slice. This suite has none, so the policy's benefit (and its potential cost) cannot be measured here. A task suite with long source files would be required to evaluate the mechanism empirically.

3. The audit (max source length = 200 chars; 0 sources over 225; 0 over 300) is a **proof about file contents**, independent of model behavior. No rerun with a different seed/temperature can change the file lengths.

4. Top-k / length variants were designed and unit-tested but not differentially benchmarked, because they share the same non-firing trigger.

5. This is a smaller parity run (200 execs) — sufficient because identity is structural; a larger run would replicate known RETRIEVAL_75 data.

## 24. Final Conclusion

**Adaptive retrieval cannot be justified from the available retrieval-time signals on this benchmark.** The only valid deterministic signal — whether a retrieved source would be truncated by the base slice — never fires, because no task source exceeds 225 characters. Consequently ADAPTIVE_LENGTH, ADAPTIVE_TOPK, and ADAPTIVE_HYBRID are each byte-identical to RETRIEVAL_75; they provide no completion recovery, no efficiency change, and no regression risk. The Phase 6/7 RETRIEVAL_75-vs-FULL and TO1 differences are attributable to stochastic model-call variance, not to retrieval truncation (both levels ship identical payloads).

**Classification: NOT SUPPORTED.** No defensible deterministic retrieval-time signal exists to drive adaptive retrieval on these tasks. Per the objective, no signal was manufactured, and no fabricated adaptive condition was run. If the benchmark is later extended with source files longer than the base slice, the implemented and unit-tested adaptive module (src/retrieval/adaptive-budget.ts) is ready, but it cannot be validated or justified on the current task suite.

---
phase8-audit.ts / tests/adaptive-budget.test.ts: 175 tests pass; typecheck and build clean. ADAPTIVE formatting proven byte-identical to RETRIEVAL_75 for all 33 benchmark source files.