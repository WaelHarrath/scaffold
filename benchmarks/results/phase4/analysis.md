## Overall Completion Results

| Condition | Success | Rate | vs FULL |
|---|---|---|---|
| MODEL_ONLY | 10/100 | 10.0% | -39.0pp |
| FEEDBACK_ONLY | 30/100 | 30.0% | -19.0pp |
| RETRIEVAL_ONLY | 20/100 | 20.0% | -29.0pp |
| FEEDBACK_RETRIEVAL | 30/100 | 30.0% | -19.0pp |
| FEEDBACK_GOVERNOR | 30/100 | 30.0% | -19.0pp |
| RETRIEVAL_GOVERNOR | 20/100 | 20.0% | -29.0pp |
| FEEDBACK_RETRIEVAL_GOV | 30/100 | 30.0% | -19.0pp |
| FULL | 49/100 | 49.0% | baseline |

## Paired Conversions/Regressions vs MODEL_ONLY

| Condition | Conversions | Regressions | Net |
|---|---|---|---|
| FEEDBACK_ONLY | 20 | 0 | 20 |
| RETRIEVAL_ONLY | 10 | 0 | 10 |
| FEEDBACK_RETRIEVAL | 20 | 0 | 20 |
| FEEDBACK_GOVERNOR | 20 | 0 | 20 |
| RETRIEVAL_GOVERNOR | 10 | 0 | 10 |
| FEEDBACK_RETRIEVAL_GOV | 20 | 0 | 20 |
| FULL | 39 | 0 | 39 |

## Paired vs FULL (candidate -> FULL regressions / conversions)

| Candidate | Candidate->FULL Regressions | FULL->Candidate Loss | Net vs FULL |
|---|---|---|---|
| MODEL_ONLY | 39 | 0 | -39 |
| FEEDBACK_ONLY | 19 | 0 | -19 |
| RETRIEVAL_ONLY | 29 | 0 | -29 |
| FEEDBACK_RETRIEVAL | 19 | 0 | -19 |
| FEEDBACK_GOVERNOR | 19 | 0 | -19 |
| RETRIEVAL_GOVERNOR | 29 | 0 | -29 |
| FEEDBACK_RETRIEVAL_GOV | 19 | 0 | -19 |

## Token / Model-Call / Latency Analysis

| Condition | Avg Tokens | Avg Prompt | Avg Completion | Avg Calls | Avg Tools | Avg Successful Tools | Avg Time (s) |
|---|---|---|---|---|---|---|---|
| MODEL_ONLY | 5003 | 4788 | 215 | 20.0 | 1.1 | 0.8 | 24.7 |
| FEEDBACK_ONLY | 2207 | 2113 | 94 | 8.2 | 2.9 | 2.1 | 10.2 |
| RETRIEVAL_ONLY | 5595 | 5279 | 316 | 20.0 | 1.1 | 0.8 | 33.6 |
| FEEDBACK_RETRIEVAL | 2885 | 2771 | 114 | 9.6 | 2.9 | 2.2 | 13.9 |
| FEEDBACK_GOVERNOR | 2085 | 2001 | 84 | 7.7 | 2.7 | 2.0 | 8.3 |
| RETRIEVAL_GOVERNOR | 5599 | 5279 | 320 | 20.0 | 1.1 | 0.9 | 35.3 |
| FEEDBACK_RETRIEVAL_GOV | 2938 | 2815 | 123 | 9.8 | 3.0 | 2.3 | 14.0 |
| FULL | 1939 | 1853 | 86 | 6.1 | 2.4 | 1.8 | 9.5 |

## Cost-Effectiveness

| Condition | Success | Total Tokens | Model Calls | Latency (s) | Success/1k Tokens | Success/Call | Success/sec |
|---|---|---|---|---|---|---|---|
| MODEL_ONLY | 10 | 500333 | 2000 | 2473 | 0.020 | 0.005 | 0.004 |
| FEEDBACK_ONLY | 30 | 220660 | 816 | 1016 | 0.136 | 0.037 | 0.030 |
| RETRIEVAL_ONLY | 20 | 559464 | 2000 | 3357 | 0.036 | 0.010 | 0.006 |
| FEEDBACK_RETRIEVAL | 30 | 288451 | 962 | 1392 | 0.104 | 0.031 | 0.022 |
| FEEDBACK_GOVERNOR | 30 | 208549 | 773 | 830 | 0.144 | 0.039 | 0.036 |
| RETRIEVAL_GOVERNOR | 20 | 559888 | 2000 | 3529 | 0.036 | 0.010 | 0.006 |
| FEEDBACK_RETRIEVAL_GOV | 30 | 293837 | 977 | 1397 | 0.102 | 0.031 | 0.021 |
| FULL | 49 | 193874 | 613 | 949 | 0.253 | 0.080 | 0.052 |

## Context Efficiency

| Condition | Avg Task ctx | Avg State ctx | Avg Feedback ctx | Avg Retrieval ctx | Avg Context size |
|---|---|---|---|---|---|
| MODEL_ONLY | - | state-in-task | 26 | 0 | (within promptTokens 4788) |
| FEEDBACK_ONLY | - | state-in-task | 64 | 0 | (within promptTokens 2113) |
| RETRIEVAL_ONLY | - | state-in-task | 24 | 313 | (within promptTokens 5279) |
| FEEDBACK_RETRIEVAL | - | state-in-task | 66 | 186 | (within promptTokens 2771) |
| FEEDBACK_GOVERNOR | - | state-in-task | 61 | 0 | (within promptTokens 2001) |
| RETRIEVAL_GOVERNOR | - | state-in-task | 25 | 313 | (within promptTokens 5279) |
| FEEDBACK_RETRIEVAL_GOV | - | state-in-task | 69 | 188 | (within promptTokens 2815) |
| FULL | - | state-in-task | 59 | 104 | (within promptTokens 1853) |

## Retrieval Efficiency

| Condition | Retrieval Calls | Avg Retrieval Tokens | Avg Retrieval Calls/Task | With Retrieval Success |
|---|---|---|---|---|
| RETRIEVAL_ONLY | 2000 | 313 | 20.0 | 20/100 (20.0%) |
| FEEDBACK_RETRIEVAL | 962 | 186 | 9.6 | 30/100 (30.0%) |
| RETRIEVAL_GOVERNOR | 2000 | 313 | 20.0 | 20/100 (20.0%) |
| FEEDBACK_RETRIEVAL_GOV | 977 | 188 | 9.8 | 30/100 (30.0%) |
| FULL | 613 | 104 | 6.1 | 49/100 (49.0%) |

## Feedback Efficiency

| Condition | Avg Feedback Tokens | Conversions | Failures despite feedback |
|---|---|---|---|
| FEEDBACK_ONLY | 64 | 20 | 70 |
| FEEDBACK_RETRIEVAL | 66 | 20 | 70 |
| FEEDBACK_GOVERNOR | 61 | 20 | 70 |
| FEEDBACK_RETRIEVAL_GOV | 69 | 20 | 70 |
| FULL | 59 | 39 | 51 |

## Governor Efficiency

| Condition | Rejected | Duplicates | No-ops | Wasted Calls |
|---|---|---|---|---|
| MODEL_ONLY | 18.9 | 18.6 | 0.6 | 19.6 |
| FEEDBACK_ONLY | 4.6 | 1.4 | 1.3 | 5.9 |
| RETRIEVAL_ONLY | 18.9 | 18.9 | 0.5 | 19.4 |
| FEEDBACK_RETRIEVAL | 6.2 | 3.4 | 1.4 | 7.5 |
| FEEDBACK_GOVERNOR | 4.3 | 1.3 | 1.3 | 5.6 |
| RETRIEVAL_GOVERNOR | 18.9 | 18.8 | 0.5 | 19.4 |
| FEEDBACK_RETRIEVAL_GOV | 6.2 | 3.4 | 1.4 | 7.5 |
| FULL | 3.0 | 1.3 | 0.7 | 3.7 |

## Task-Level Results

| Task | MODEL_ONLY | FEEDBACK_ONLY | RETRIEVAL_ONLY | FEEDBACK_RETRIEVAL | FEEDBACK_GOVERNOR | RETRIEVAL_GOVERNOR | FEEDBACK_RETRIEVAL_GOV | FULL |
|---|---|---|---|---|---|---|---|---|
| ST1 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 |
| ST2 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 |
| MS1 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 |
| MS2 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 5/5 |
| ER1 | 0/5 | 5/5 | 0/5 | 5/5 | 5/5 | 0/5 | 5/5 | 5/5 |
| ER2 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 |
| TO1 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 |
| TO2 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 |
| CP1 | 0/5 | 5/5 | 5/5 | 5/5 | 5/5 | 5/5 | 5/5 | 5/5 |
| CP2 | 0/5 | 5/5 | 5/5 | 5/5 | 5/5 | 5/5 | 5/5 | 5/5 |
| CF1 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 |
| CF2 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 5/5 |
| AS1 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 |
| AS2 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 |
| CV1 | 5/5 | 5/5 | 5/5 | 5/5 | 5/5 | 5/5 | 5/5 | 5/5 |
| CV2 | 5/5 | 5/5 | 5/5 | 5/5 | 5/5 | 5/5 | 5/5 | 5/5 |
| RA1 | 0/5 | 5/5 | 0/5 | 5/5 | 5/5 | 0/5 | 5/5 | 5/5 |
| RA2 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 5/5 |
| DC1 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 4/5 |
| DC2 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 | 0/5 |

## Trace Analysis (tasks recovered vs MODEL_ONLY)

**FEEDBACK_ONLY**: recovered [ER1, CP1, CP2, RA1] | lost []
**RETRIEVAL_ONLY**: recovered [CP1, CP2] | lost []
**FEEDBACK_RETRIEVAL**: recovered [ER1, CP1, CP2, RA1] | lost []
**FEEDBACK_GOVERNOR**: recovered [ER1, CP1, CP2, RA1] | lost []
**RETRIEVAL_GOVERNOR**: recovered [CP1, CP2] | lost []
**FEEDBACK_RETRIEVAL_GOV**: recovered [ER1, CP1, CP2, RA1] | lost []

## Statistical Analysis (Wilson 95% CI)

| Condition | n | Successes | Rate | 95% CI |
|---|---|---|---|---|
| MODEL_ONLY | 100 | 10 | 10.0% | [5.5%, 17.4%] |
| FEEDBACK_ONLY | 100 | 30 | 30.0% | [21.9%, 39.6%] |
| RETRIEVAL_ONLY | 100 | 20 | 20.0% | [13.3%, 28.9%] |
| FEEDBACK_RETRIEVAL | 100 | 30 | 30.0% | [21.9%, 39.6%] |
| FEEDBACK_GOVERNOR | 100 | 30 | 30.0% | [21.9%, 39.6%] |
| RETRIEVAL_GOVERNOR | 100 | 20 | 20.0% | [13.3%, 28.9%] |
| FEEDBACK_RETRIEVAL_GOV | 100 | 30 | 30.0% | [21.9%, 39.6%] |
| FULL | 100 | 49 | 49.0% | [39.4%, 58.7%] |