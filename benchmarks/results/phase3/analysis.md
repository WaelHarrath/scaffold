## 8. Overall Results

| Condition | Success | Rate | Avg Tokens | Avg Time | Avg Calls |
|---|---|---|---|---|---|
| MODEL_ONLY | 10/100 | 10.0% | 5005 | 15.5s | 20.0 |
| STATE_ONLY | 10/100 | 10.0% | 5352 | 21.4s | 20.0 |
| FEEDBACK_ONLY | 30/100 | 30.0% | 2482 | 10.0s | 8.7 |
| GOVERNOR_ONLY | 10/100 | 10.0% | 5005 | 16.0s | 20.0 |
| RETRIEVAL_ONLY | 30/100 | 30.0% | 3295 | 17.1s | 10.5 |
| STATE_FEEDBACK | 34/100 | 34.0% | 3094 | 11.1s | 10.6 |
| STATE_RETRIEVAL | 26/100 | 26.0% | 6083 | 24.9s | 20.0 |
| FEEDBACK_RETRIEVAL | 30/100 | 30.0% | 3276 | 17.4s | 10.4 |
| STATE_FB_GOVERNOR | 35/100 | 35.0% | 2831 | 7.8s | 9.9 |
| FULL | 46/100 | 46.0% | 1872 | 5.8s | 6.0 |

## 9. Paired Conversions/Regressions vs MODEL_ONLY

| Condition | Conversions | Regressions | Net |
|---|---|---|---|
| STATE_ONLY | 0 | 0 | 0 |
| FEEDBACK_ONLY | 20 | 0 | 20 |
| GOVERNOR_ONLY | 0 | 0 | 0 |
| RETRIEVAL_ONLY | 20 | 0 | 20 |
| STATE_FEEDBACK | 24 | 0 | 24 |
| STATE_RETRIEVAL | 16 | 0 | 16 |
| FEEDBACK_RETRIEVAL | 20 | 0 | 20 |
| STATE_FB_GOVERNOR | 25 | 0 | 25 |
| FULL | 36 | 0 | 36 |

### FULL vs Other Conditions

| Condition | FULL Conv | FULL Reg | Net |
|---|---|---|---|
| MODEL_ONLY | 36 | 0 | 36 |
| STATE_ONLY | 36 | 0 | 36 |
| FEEDBACK_ONLY | 16 | 0 | 16 |
| GOVERNOR_ONLY | 36 | 0 | 36 |
| RETRIEVAL_ONLY | 16 | 0 | 16 |
| STATE_FEEDBACK | 13 | 1 | 12 |
| STATE_RETRIEVAL | 22 | 2 | 20 |
| FEEDBACK_RETRIEVAL | 16 | 0 | 16 |
| STATE_FB_GOVERNOR | 12 | 1 | 11 |

## 10. Task-Level Results

| Task | MODEL_ONLY | STATE_ONLY | FEEDBACK_ONLY | GOVERNOR_ONLY | RETRIEVAL_ONLY | STATE_FEEDBACK | STATE_RETRIEVAL | FEEDBACK_RETRIEVAL | STATE_FB_GOVERNOR | FULL |
|---|---|---|---|---|---|---|---|---|---|---|
| ST1 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 |
| ST2 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 |
| MS1 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 |
| MS2 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 5/5 | 0/5 | 0/5 | 3/5 |
| ER1 | 0/5 | 0/5 | 5/5 | 0/5 | 5/5 | 5/5 | 0/5 | 5/5 | 5/5 | 5/5 |
| ER2 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 |
| TO1 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 |
| TO2 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 |
| CP1 | 0/5 | 0/5 | 5/5 | 0/5 | 5/5 | 5/5 | 5/5 | 5/5 | 5/5 | 5/5 |
| CP2 | 0/5 | 0/5 | 5/5 | 0/5 | 5/5 | 5/5 | 5/5 | 5/5 | 5/5 | 5/5 |
| CF1 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 |
| CF2 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 5/5 |
| AS1 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 |
| AS2 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 |
| CV1 | 5/5 | 5/5 | 5/5 | 5/5 | 5/5 | 5/5 | 5/5 | 5/5 | 5/5 | 5/5 |
| CV2 | 5/5 | 5/5 | 5/5 | 5/5 | 5/5 | 5/5 | 5/5 | 5/5 | 5/5 | 5/5 |
| RA1 | 0/5 | 0/5 | 5/5 | 0/5 | 5/5 | 5/5 | 1/5 | 5/5 | 5/5 | 5/5 |
| RA2 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 4/5 |
| DC1 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 4/5 | 0/5 | 0/5 | 5/5 | 4/5 |
| DC2 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 |

## 11. Component-Level Analysis

### Individual component contribution (success rate delta vs MODEL_ONLY)

| Component | Rate | Delta | Significant? |
|---|---|---|---|
| STATE_ONLY | 10.0% | +0.0pp | No |
| FEEDBACK_ONLY | 30.0% | +20.0pp | Yes |
| GOVERNOR_ONLY | 10.0% | +0.0pp | No |
| RETRIEVAL_ONLY | 30.0% | +20.0pp | Yes |

### Pairwise combination contribution

| Combination | Rate | Delta vs sum of parts |
|---|---|---|
| STATE+FEEDBACK | 34.0% | +4.0pp synergy |
| STATE+RETRIEVAL | 26.0% | -4.0pp subadditive |
| FEEDBACK+RETRIEVAL | 30.0% | -20.0pp subadditive |

### Full component stacks

| Stack | Rate |
|---|---|
| STATE+FEEDBACK (F) | 34.0% |
| STATE+FEEDBACK+GOVERNOR (I) | 35.0% |
| FULL (J) | 46.0% |

## 12. Interaction Analysis

### Synergy vs additivity

| Pair | Actual Rate | Sum of parts (minus MO) | Synergy |
|---|---|---|---|
| STATE+FEEDBACK | 34.0% | 30.0% | +4.0pp synergy |
| STATE+RETRIEVAL | 26.0% | 30.0% | -4.0pp subadditive |
| FEEDBACK+RETRIEVAL | 30.0% | 50.0% | -20.0pp subadditive |
| STATE+FB+GOV | 35.0% | 30.0% | +5.0pp synergy |

### Governor interaction

| Without Gov | With Gov | Delta |
|---|---|---|
| STATE+FB: 34.0% | STATE+FB+GOV: 35.0% | +1.0pp |
| MODEL_ONLY: 10.0% | GOVERNOR_ONLY: 10.0% | +0.0pp |

## 13. Token/Context Analysis

| Condition | Avg Input Tok | Avg Retrieval Tok | Avg Total Tok | Avg Calls | Tok/Success |
|---|---|---|---|---|---|
| MODEL_ONLY | 5005 | 0 | 5005 | 20.0 | 4850 |
| STATE_ONLY | 5352 | 0 | 5352 | 20.0 | 5329 |
| FEEDBACK_ONLY | 2482 | 0 | 2482 | 8.7 | 724 |
| GOVERNOR_ONLY | 5005 | 0 | 5005 | 20.0 | 4850 |
| RETRIEVAL_ONLY | 3093 | 201 | 3295 | 10.5 | 713 |
| STATE_FEEDBACK | 3094 | 0 | 3094 | 10.6 | 837 |
| STATE_RETRIEVAL | 5770 | 313 | 6083 | 20.0 | 5988 |
| FEEDBACK_RETRIEVAL | 3075 | 201 | 3276 | 10.4 | 671 |
| STATE_FB_GOVERNOR | 2831 | 0 | 2831 | 9.9 | 853 |
| FULL | 1774 | 98 | 1872 | 6.0 | 1031 |

### Token reduction sources (FULL vs MODEL_ONLY)

- MODEL_ONLY avg calls: 20.0, avg tokens: 5005
- FULL avg calls: 6.0, avg tokens: 1872
- Call reduction: 70.3%
- Token reduction: 62.6%

## 14. Retrieval Analysis

| Condition | Has State | Has Feedback | Rate | Avg Ret Tokens | Ret Useful? |
|---|---|---|---|---|---|
| RETRIEVAL_ONLY | No | No | 30.0% | 201 | - |
| STATE_RETRIEVAL | Yes | No | 26.0% | 313 | - |
| FEEDBACK_RETRIEVAL | No | Yes | 30.0% | 201 | - |
| FULL | No | Yes | 46.0% | 98 | - |

## 15. Governor Analysis

| Condition | Rejected | Duplicates | No-ops | Wasted Calls |
|---|---|---|---|---|
| MODEL_ONLY | 0.0 | 0.0 | 12.0 | 12.0 |
| STATE_ONLY | 0.0 | 0.0 | 8.2 | 8.2 |
| FEEDBACK_ONLY | 0.0 | 0.0 | 3.9 | 3.9 |
| GOVERNOR_ONLY | 18.9 | 18.6 | 0.6 | 19.5 |
| RETRIEVAL_ONLY | 0.0 | 0.0 | 3.3 | 3.3 |
| STATE_FEEDBACK | 0.0 | 0.0 | 2.8 | 2.8 |
| STATE_RETRIEVAL | 0.0 | 0.0 | 5.3 | 5.3 |
| FEEDBACK_RETRIEVAL | 0.0 | 0.0 | 3.3 | 3.3 |
| STATE_FB_GOVERNOR | 5.6 | 2.8 | 1.6 | 7.2 |
| FULL | 2.9 | 1.3 | 0.7 | 3.6 |

## 16. Failure Analysis

| Condition | reasoning_failure | budget_exhaustion | infrastructure | action_parse_failure | premature_finish | repeated_action |
|---|---|---|---|---|---|---|
| MODEL_ONLY | 0 | 90 | 0 | 0 | 0 | 0 |
| STATE_ONLY | 0 | 90 | 0 | 0 | 0 | 0 |
| FEEDBACK_ONLY | 35 | 35 | 0 | 0 | 0 | 0 |
| GOVERNOR_ONLY | 0 | 90 | 0 | 0 | 0 | 0 |
| RETRIEVAL_ONLY | 25 | 45 | 0 | 0 | 0 | 0 |
| STATE_FEEDBACK | 21 | 45 | 0 | 0 | 0 | 0 |
| STATE_RETRIEVAL | 0 | 74 | 0 | 0 | 0 | 0 |
| FEEDBACK_RETRIEVAL | 25 | 45 | 0 | 0 | 0 | 0 |
| STATE_FB_GOVERNOR | 29 | 36 | 0 | 0 | 0 | 0 |
| FULL | 37 | 16 | 1 | 0 | 0 | 0 |

## 17. Trace Analysis

### Tasks recovered specifically by each mechanism

**STATE_ONLY**: recovered [] | lost []
**FEEDBACK_ONLY**: recovered [ER1, CP1, CP2, RA1] | lost []
**GOVERNOR_ONLY**: recovered [] | lost []
**RETRIEVAL_ONLY**: recovered [ER1, CP1, CP2, RA1] | lost []
**STATE_FEEDBACK**: recovered [ER1, CP1, CP2, RA1, DC1] | lost []
**STATE_RETRIEVAL**: recovered [MS2, CP1, CP2, RA1] | lost []
**FEEDBACK_RETRIEVAL**: recovered [ER1, CP1, CP2, RA1] | lost []
**STATE_FB_GOVERNOR**: recovered [ER1, CP1, CP2, RA1, DC1] | lost []

**FULL**: recovered [ER1, CP1, CP2, CF2, RA1, RA2, DC1, MS2]

## 18. Statistical Analysis

### Success rates with confidence intervals (Wilson score, 95%)

| Condition | n | Successes | Rate | 95% CI |
|---|---|---|---|---|
| MODEL_ONLY | 100 | 10 | 10.0% | [5.5%, 17.4%] |
| STATE_ONLY | 100 | 10 | 10.0% | [5.5%, 17.4%] |
| FEEDBACK_ONLY | 100 | 30 | 30.0% | [21.9%, 39.6%] |
| GOVERNOR_ONLY | 100 | 10 | 10.0% | [5.5%, 17.4%] |
| RETRIEVAL_ONLY | 100 | 30 | 30.0% | [21.9%, 39.6%] |
| STATE_FEEDBACK | 100 | 34 | 34.0% | [25.5%, 43.7%] |
| STATE_RETRIEVAL | 100 | 26 | 26.0% | [18.4%, 35.4%] |
| FEEDBACK_RETRIEVAL | 100 | 30 | 30.0% | [21.9%, 39.6%] |
| STATE_FB_GOVERNOR | 100 | 35 | 35.0% | [26.4%, 44.7%] |
| FULL | 100 | 46 | 46.0% | [36.6%, 55.7%] |

## 19. Limitations

- Ollama does not provide deterministic seeds; model output varies across runs
- Task set is small (20 tasks); results may not generalize broadly
- Token estimation uses chars/4 heuristic, not exact tokenizer
- Feedback tokens not tracked separately in current implementation
- Statistical tests are descriptive; formal hypothesis testing requires more power

## 20. Conclusion

- MODEL_ONLY baseline: 10.0%
- FULL best: 46.0%
- Strongest individual mechanism: STATE_FB_GOVERNOR (+25.0pp)
- Strongest interaction: STATE_ONLY+FEEDBACK_ONLY → STATE_FEEDBACK (+4.0pp synergy)
- Zero regressions confirmed across all conditions