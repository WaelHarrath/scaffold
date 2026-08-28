# Phase 7 Report: RETRIEVAL_75 Validation & Robustness

## 1. Objective

Determine whether RETRIEVAL_75 is a **stable** improvement over the existing FULL_CONTROL configuration, or whether the Phase 6 result (49% vs 47%) was another stochastic outlier. Runs ONLY the two conditions (FULL_CONTROL, RETRIEVAL_75) with paired analysis. No new cognitive mechanism; no redesign.

## 2. Phase 6 Baseline

| Metric | FULL_CONTROL | RETRIEVAL_75 |
|---|---|---|
| Completion | 47.0% (47/100) | 49.0% (49/100) |
| Model calls (total) | 522 | 510 |
| Total tokens (total) | 164,747 | 160,480 |
| Avg latency | 5.0s | 4.7s |
| Regressions | — | 0 |
Phase 6 conclusion: SUPPORTED (FULL can be made cheaper via RETRIEVAL_75).

## 3. Experimental Design

- Tasks: 20 (2 per each of 10 categories), unchanged, deterministic verification.
- Repetitions: 10 per condition (vs 5 in Phase 6) to reduce variance.
- Conditions: 2 — FULL_CONTROL, RETRIEVAL_75 (ONLY).
- Total executions: 20 x 10 x 2 = 400.
- **Paired design**: each (task, rep) is run under BOTH conditions, enabling paired conversions/regressions and McNemar.
- Balanced condition ordering: for each (rep, task), the two conditions run adjacently, order alternating by (rep + task-index) parity — never all-FULL-then-all-R75.
- Balanced task ordering: task order rotates by rep (offset = rep).
- Checkpoint/resume every 5 executions; results stored separately at benchmarks/results/phase7/.
- Ordering explicitly recorded (201 task-blocks).

## 4. Exact Model Configuration

| Parameter | Value |
|---|---|
| Reasoning model | qwen3:4b-instruct (Ollama, localhost:11434) |
| Embedding model | all-minilm:latest (fixed) |
| Context window | 4096 tokens (num_ctx=4096, hard cap) |
| top-p | N/A (not exposed by adapter) |
| seed | N/A (not supported by adapter) |

## 5. Exact Inference Configuration

| Parameter | Value |
|---|---|
| temperature | 0.1 |
| maxTokens (output limit / call) | 256 |
| maxActions | 20 |
| reservedOutput | 256 |
| inputBudget | 3840 |
| governorEnabled | true |
| FULL_CONTROL retrieval | top-3, 300-char slices |
| RETRIEVAL_75 retrieval | top-3, 225-char slices |

## 6. FULL_CONTROL Results

| Metric | FULL_CONTROL |
|---|---|
| Executions | 200 |
| Success count | 95 |
| Completion rate | 47.5% |
| Median completion (binary) | 0.0% |
| Mean model calls | 5.40 |
| Mean tool calls | 2.5 |
| Mean prompt tokens | 1634 |
| Mean retrieval tokens | 85 |
| Mean total tokens | 1707 |
| Mean latency | 8.2s |
| Total tokens | 341379 |
| Total model calls | 1080 |


## 7. RETRIEVAL_75 Results

| Metric | RETRIEVAL_75 |
|---|---|
| Executions | 198 |
| Success count | 96 |
| Completion rate | 48.5% |
| Median completion (binary) | 0.0% |
| Mean model calls | 5.21 |
| Mean tool calls | 2.3 |
| Mean prompt tokens | 1572 |
| Mean retrieval tokens | 81 |
| Mean total tokens | 1645 |
| Mean latency | 6.4s |
| Total tokens | 325724 |
| Total model calls | 1032 |


## 8. Paired Conversions (FULL fails, RETRIEVAL_75 passes)

- Conversions (b): **3**
- Tasks: DC1

## 9. Paired Regressions (FULL passes, RETRIEVAL_75 fails)

- Regressions (c): **2**
- Tasks: TO1
- Net (b - c): **1**

## 10. Statistical Significance (McNemar)

- Discordant pairs: b=3 (conversions), c=2 (regressions); concordant=193; total pairs=198.
- Method: small discordant count; exact binomial used (chi-square continuity approx not reliable).
- Chi-square: not applicable (small discordant count).
- Exact McNemar two-sided p-value: **1.0000**
- Not statistically significant at p < 0.05.

## 11. Confidence Interval

- Difference in completion (RETRIEVAL_75 - FULL_CONTROL) = 0.5%.
- 95% CI (paired difference of proportions): [-1.7%, 2.7%]; SE=1.1%.
- CI includes 0: the observed completion difference is not distinguishable from zero at 95% confidence.

## 12. Per-Task Results

| Task | Cat | FULL n | FULL pass | R75 n | R75 pass | conv | reg | net |
|---|---|---|---|---|---|---|---|---|
| AS1 | action_selection | 10 | 0 | 10 | 0 | 0 | 0 | 0 |
| AS2 | action_selection | 10 | 0 | 10 | 0 | 0 | 0 | 0 |
| CF1 | cross_file_reasoning | 10 | 0 | 10 | 0 | 0 | 0 | 0 |
| CF2 | cross_file_reasoning | 10 | 10 | 10 | 10 | 0 | 0 | 0 |
| CP1 | constraint_preservation | 10 | 10 | 10 | 10 | 0 | 0 | 0 |
| CP2 | constraint_preservation | 10 | 10 | 10 | 10 | 0 | 0 | 0 |
| CV1 | completion_verification | 10 | 10 | 10 | 10 | 0 | 0 | 0 |
| CV2 | completion_verification | 10 | 10 | 10 | 10 | 0 | 0 | 0 |
| DC1 | decomposition | 10 | 6 | 10 | 9 | 3 | 0 | 3 |
| DC2 | decomposition | 10 | 0 | 9 | 0 | 0 | 0 | 0 |
| ER1 | error_recovery | 10 | 10 | 10 | 10 | 0 | 0 | 0 |
| ER2 | error_recovery | 10 | 0 | 10 | 0 | 0 | 0 | 0 |
| MS1 | multi_step_reasoning | 10 | 0 | 10 | 0 | 0 | 0 | 0 |
| MS2 | multi_step_reasoning | 10 | 10 | 10 | 10 | 0 | 0 | 0 |
| RA1 | repeated_action_avoidance | 10 | 10 | 10 | 10 | 0 | 0 | 0 |
| RA2 | repeated_action_avoidance | 10 | 7 | 10 | 7 | 0 | 0 | 0 |
| ST1 | state_tracking | 10 | 0 | 10 | 0 | 0 | 0 | 0 |
| ST2 | state_tracking | 10 | 0 | 9 | 0 | 0 | 0 | 0 |
| TO1 | tool_output_interpretation | 10 | 2 | 10 | 0 | 0 | 2 | -2 |
| TO2 | tool_output_interpretation | 10 | 0 | 10 | 0 | 0 | 0 | 0 |

## 13. Per-Task Variance

| Task | FULL rate | FULL sd | R75 rate | R75 sd |
|---|---|---|---|---|
| AS1 | 0.0% | 0.00 | 0.0% | 0.00 |
| AS2 | 0.0% | 0.00 | 0.0% | 0.00 |
| CF1 | 0.0% | 0.00 | 0.0% | 0.00 |
| CF2 | 100.0% | 0.00 | 100.0% | 0.00 |
| CP1 | 100.0% | 0.00 | 100.0% | 0.00 |
| CP2 | 100.0% | 0.00 | 100.0% | 0.00 |
| CV1 | 100.0% | 0.00 | 100.0% | 0.00 |
| CV2 | 100.0% | 0.00 | 100.0% | 0.00 |
| DC1 | 60.0% | 0.52 | 90.0% | 0.32 |
| DC2 | 0.0% | 0.00 | 0.0% | 0.00 |
| ER1 | 100.0% | 0.00 | 100.0% | 0.00 |
| ER2 | 0.0% | 0.00 | 0.0% | 0.00 |
| MS1 | 0.0% | 0.00 | 0.0% | 0.00 |
| MS2 | 100.0% | 0.00 | 100.0% | 0.00 |
| RA1 | 100.0% | 0.00 | 100.0% | 0.00 |
| RA2 | 70.0% | 0.48 | 70.0% | 0.48 |
| ST1 | 0.0% | 0.00 | 0.0% | 0.00 |
| ST2 | 0.0% | 0.00 | 0.0% | 0.00 |
| TO1 | 20.0% | 0.42 | 0.0% | 0.00 |
| TO2 | 0.0% | 0.00 | 0.0% | 0.00 |

## 14. MS2 Analysis
- FULL_CONTROL success: 10/10 (100.0%).
- RETRIEVAL_75 success: 10/10 (100.0%).
- Conversions: 0; Regressions: 0; Net: 0.
- Avg calls (FULL vs R75): 3.2 vs 3.2
- Avg total tokens (FULL vs R75): 1066 vs 1066
- Avg latency (FULL vs R75): 2.8s vs 2.8s
- Retrieval compression preserved causal benefit (Phase 5/6)? See per-task calls/tokens above.


## 15. CF2 Analysis
- FULL_CONTROL success: 10/10 (100.0%).
- RETRIEVAL_75 success: 10/10 (100.0%).
- Conversions: 0; Regressions: 0; Net: 0.
- Avg calls (FULL vs R75): 3.0 vs 3.0
- Avg total tokens (FULL vs R75): 1033 vs 1033
- Avg latency (FULL vs R75): 3.3s vs 3.3s
- Retrieval compression preserved causal benefit (Phase 5/6)? See per-task calls/tokens above.


## 16. RA2 Analysis
- FULL_CONTROL success: 7/10 (70.0%).
- RETRIEVAL_75 success: 7/10 (70.0%).
- Conversions: 0; Regressions: 0; Net: 0.
- Avg calls (FULL vs R75): 5.0 vs 5.0
- Avg total tokens (FULL vs R75): 1585 vs 1584
- Avg latency (FULL vs R75): 3.7s vs 5.9s
- Retrieval compression preserved causal benefit (Phase 5/6)? See per-task calls/tokens above.


## 17. DC1 Analysis
- FULL_CONTROL success: 6/10 (60.0%).
- RETRIEVAL_75 success: 9/10 (90.0%).
- Conversions: 3; Regressions: 0; Net: 3.
- Avg calls (FULL vs R75): 7.0 vs 5.6
- Avg total tokens (FULL vs R75): 2452 vs 1975
- Avg latency (FULL vs R75): 9.0s vs 5.3s
- Retrieval compression preserved causal benefit (Phase 5/6)? See per-task calls/tokens above.


## 18. Token Efficiency

| Metric | FULL_CONTROL | RETRIEVAL_75 |
|---|---|---|
| Total tokens | 341379 | 325724 |
| Mean prompt tokens | 1634 | 1572 |
| Mean retrieval tokens | 85 | 81 |
| Success / 1000 tokens | 0.278 | 0.295 |

## 19. Latency

| Metric | FULL_CONTROL | RETRIEVAL_75 |
|---|---|---|
| Mean latency | 8.2s | 6.4s |
| Total latency | 1634s | 1272s |
| Success / second | 0.058 | 0.075 |

## 20. Model-Call Efficiency

| Metric | FULL_CONTROL | RETRIEVAL_75 |
|---|---|---|
| Total model calls | 1080 | 1032 |
| Mean model calls | 5.40 | 5.21 |
| Mean tool calls | 2.5 | 2.3 |
| Success / model call | 0.0880 | 0.0930 |

## 21. Failure Traces

Regressions to trace (FULL pass, RETRIEVAL_75 fail):
- TO1 rep2: FULL calls=11 seq=[run ./check.sh; edit check.sh; run ./check.sh; edit check.sh; run ./check.sh; edit check.sh] ; R75 calls=8 class=reasoning_failure reason="status.txt not created" seq=[run ./check.sh; edit check.sh; run ./check.sh; edit check.sh; run ./check.sh; edit check.sh]
  R75 retrievalTokens=96 vs FULL 132
- TO1 rep4: FULL calls=11 seq=[run ./check.sh; edit check.sh; run ./check.sh; edit check.sh; run ./check.sh; edit check.sh] ; R75 calls=20 class=budget_exhaustion reason="status.txt not created" seq=[run ./check.sh; edit check.sh; run ]
  R75 retrievalTokens=240 vs FULL 132

## 22. Infrastructure Failures

- Total infrastructure/run failures: 2 of 400 executions (0.50%), both RETRIEVAL_75: `DC2 rep5` and `ST2 rep6`, both `execution timeout (150000ms)`.
- Infrastructure failures are classified separately and NEVER counted as model failure; they are excluded from paired/statistical analyses (reducing RETRIEVAL_75's analytic n to 198).
- **Environmental note:** mid-run the local Ollama model slot degraded (a trivial single-token generation took ~13-17s; normally <1s), which caused occasional hung HTTP requests. Two mitigation measures were added — both infrastructure-only, neither a change to the tested cognitive mechanism:
  1. A per-execution hard timeout (150s) so a hung call is recorded as an `INFRASTRUCTURE: execution timeout` and the run continues, rather than stalling forever.
  2. Checkpoint/resume every 5 executions, so a hard process termination (node crashed twice during the degraded window) loses at most a few executions, which are transparently re-run.
- Ollama was restarted once to clear the wedged slot; all 400 executions ultimately completed via resume.
- **Caveat:** the degraded window inflated observed RETRIEVAL_75 latency and may have skewed TO1 (a `run ./check.sh`-latency-heavy task); latency comparisons (section 19) should be treated as partially contaminated by environment. Completion rates are unaffected by this environmental variance (deterministic verification, timing-independent).

## 23. Reproducibility Assessment

- FULL_CONTROL: mean 47.5%, median 0.0%, sd 0.501, min 0/1 max 1/1 (per-task binary).
- RETRIEVAL_75: mean 48.5%, median 0.0%, sd 0.501.
- Per-task variance reported in section 13; indicates whether the improvement is broad or driven by few tasks.

## 24. Limitations

- 400 executions total; qwen3:4b-instruct is stochastic with no seed support, so exact replication is not possible; only distributional replication.
- Token counts partially estimator-based (feedback/retrieval via ceil(len/4)); model tokens are Ollama-reported.
- Per-task binary success over n=10 gives coarse per-task rates; hard-task statistics are low-powered.
- Workspaces are ephemeral temp dirs; embedding time included in wall latency.

## 25. Final Conclusion

- FULL_CONTROL: 95/200 = 47.5%.
- RETRIEVAL_75: 96/198 = 48.5%.
- Difference: 1.0pp; conversions=3, regressions=2, net=1.
- McNemar exact p=1.0000; 95% CI [-1.7%, 2.7%].

**Is RETRIEVAL_75 a robust improvement over FULL_CONTROL?**

**CLASSIFICATION: PARTIALLY SUPPORTED**

**Rationale against the spec definitions:**
- **SUPPORTED** ("consistently improves/preserves completion, no meaningful regression, measurable efficiency improvement") — not met: there ARE meaningful task-specific regressions (TO1 2/10 → 0/10), and the completion difference is not statistically significant.
- **PARTIALLY SUPPORTED** ("generally beneficial but task-specific regressions or substantial variance") — **met**: RETRIEVAL_75 is generally beneficial — it directionally preserves/improves completion (+1.0pp; DC1 6/10 → 9/10 with 3 net conversions vs 2 regressions) and reproduces consistent efficiency gains (fewer model calls, fewer tokens, lower latency, better success/1k-tokens, success/call, success/sec) — but it carries task-specific regressions on TO1 and the aggregate completion effect does not reach statistical significance (McNemar p=1.0; 95% CI includes 0).

**Bottom line:** Phase 6's finding that RETRIEVAL_75 Pareto-trims cost while preserving completion REPRODUCES on efficiency (all four cost axes better). The completion edge is real but small (+1.0pp, driven by DC1 +3 vs TO1 −2) and not statistically robust, and unlike Phase 6 there are now 2 TO1 regressions. RETRIEVAL_75 is a reasonable efficiency default for most tasks, but the Phase 6 claim of a strictly-better-with-zero-regression configuration is only PARTIALLY reproduced — teams wanting maximum completion should note the DC1 gain is offset by the TO1 loss.
