## Phase 6 Cross-Condition Results (aggregate)

| Condition | STATE | FEEDBACK | RETR | n | Success | Rate | avgCalls | avgPromptTok | avgTotalTok | latency_s |
|---|---|---|---|---|---|---|---|---|---|---|
| FULL_CONTROL | FULL_STATE | FULL_FEEDBACK | FULL | 100 | 47 | 47.0% | 5.2 | 1575 | 1647 | 5.0 |
| FULL_CONTROL | tools 2.4 | succTools 1.9 | rej 1.9 | dup 0.5 | retrTok 79 | retrCalls 5.2 | fbTok 58 | | | |
| COMPACT_STATE | COMPACT_STATE | FULL_FEEDBACK | FULL | 100 | 46 | 46.0% | 5.2 | 1578 | 1649 | 5.2 |
| COMPACT_STATE | tools 2.5 | succTools 1.9 | rej 1.9 | dup 0.5 | retrTok 80 | retrCalls 5.2 | fbTok 59 | | | |
| MIN_STATE | MIN_STATE | FULL_FEEDBACK | FULL | 100 | 48 | 48.0% | 6.7 | 1974 | 2056 | 5.5 |
| MIN_STATE | tools 2.5 | succTools 1.9 | rej 3.4 | dup 1.4 | retrTok 101 | retrCalls 6.7 | fbTok 59 | | | |
| COMPACT_FEEDBACK | FULL_STATE | COMPACT_FEEDBACK | FULL | 100 | 52 | 52.0% | 6.6 | 1966 | 2050 | 6.6 |
| COMPACT_FEEDBACK | tools 2.8 | succTools 2.1 | rej 3.0 | dup 0.6 | retrTok 105 | retrCalls 6.6 | fbTok 51 | | | |
| MINIMAL_FEEDBACK | FULL_STATE | MINIMAL_FEEDBACK | FULL | 100 | 48 | 48.0% | 6.4 | 1911 | 1991 | 5.7 |
| MINIMAL_FEEDBACK | tools 2.6 | succTools 1.9 | rej 2.9 | dup 1.3 | retrTok 116 | retrCalls 6.4 | fbTok 23 | | | |
| RETRIEVAL_75 | FULL_STATE | FULL_FEEDBACK | RETRIEVAL_75 | 100 | 49 | 49.0% | 5.1 | 1535 | 1605 | 4.7 |
| RETRIEVAL_75 | tools 2.3 | succTools 1.8 | rej 1.9 | dup 0.5 | retrTok 80 | retrCalls 5.1 | fbTok 57 | | | |
| RETRIEVAL_50 | FULL_STATE | FULL_FEEDBACK | RETRIEVAL_50 | 100 | 49 | 49.0% | 5.7 | 1698 | 1771 | 4.9 |
| RETRIEVAL_50 | tools 2.2 | succTools 1.7 | rej 2.6 | dup 1.2 | retrTok 83 | retrCalls 5.7 | fbTok 56 | | | |
| RETRIEVAL_MIN | FULL_STATE | FULL_FEEDBACK | RETRIEVAL_MIN | 100 | 40 | 40.0% | 7.5 | 2238 | 2327 | 6.1 |
| RETRIEVAL_MIN | tools 3.0 | succTools 2.1 | rej 3.8 | dup 0.5 | retrTok 95 | retrCalls 7.5 | fbTok 69 | | | |
| STATE_COMPACT_FB_COMPACT | COMPACT_STATE | COMPACT_FEEDBACK | FULL | 100 | 53 | 53.0% | 6.3 | 1866 | 1947 | 5.6 |
| STATE_COMPACT_FB_COMPACT | tools 2.4 | succTools 1.8 | rej 3.0 | dup 0.7 | retrTok 105 | retrCalls 6.3 | fbTok 48 | | | |

## Hard-Task Stress (MS2, CF2, RA2, DC1)

| Condition | MS2 | CF2 | RA2 | DC1 | Full-rate |
|---|---|---|---|---|---|
| FULL_CONTROL | 5/5 | 5/5 | 4/5 | 3/5 | 0.470 (hard 17/20) |
| COMPACT_STATE | 4/5 | 5/5 | 5/5 | 2/5 | 0.460 (hard 16/20) |
| MIN_STATE | 4/5 | 5/5 | 5/5 | 4/5 | 0.480 (hard 18/20) |
| COMPACT_FEEDBACK | 5/5 | 5/5 | 5/5 | 3/5 | 0.520 (hard 18/20) |
| MINIMAL_FEEDBACK | 1/5 | 5/5 | 5/5 | 3/5 | 0.480 (hard 14/20) |
| RETRIEVAL_75 | 5/5 | 5/5 | 5/5 | 4/5 | 0.490 (hard 19/20) |
| RETRIEVAL_50 | 5/5 | 5/5 | 5/5 | 4/5 | 0.490 (hard 19/20) |
| RETRIEVAL_MIN | 0/5 | 5/5 | 0/5 | 5/5 | 0.400 (hard 10/20) |
| STATE_COMPACT_FB_COMPACT | 5/5 | 5/5 | 5/5 | 5/5 | 0.530 (hard 20/20) |

## Paired Conversions / Regressions vs FULL_CONTROL

| Candidate | Conversions | Regressions | Net |
|---|---|---|---|
| COMPACT_STATE | 1 | 2 | -1 |
| MIN_STATE | 2 | 1 | 1 |
| COMPACT_FEEDBACK | 6 | 1 | 5 |
| MINIMAL_FEEDBACK | 8 | 7 | 1 |
| RETRIEVAL_75 | 2 | 0 | 2 |
| RETRIEVAL_50 | 2 | 0 | 2 |
| RETRIEVAL_MIN | 2 | 9 | -7 |
| STATE_COMPACT_FB_COMPACT | 6 | 0 | 6 |

## Cost-Effectiveness

| Condition | Success | Total Tokens | Calls | Success/1k Tokens | Success/Call |
|---|---|---|---|---|---|
| FULL_CONTROL | 47 | 164747 | 522 | 0.285 | 0.090 |
| COMPACT_STATE | 46 | 164923 | 523 | 0.279 | 0.088 |
| MIN_STATE | 48 | 205635 | 666 | 0.233 | 0.072 |
| COMPACT_FEEDBACK | 52 | 204954 | 657 | 0.254 | 0.079 |
| MINIMAL_FEEDBACK | 48 | 199143 | 640 | 0.241 | 0.075 |
| RETRIEVAL_75 | 49 | 160480 | 510 | 0.305 | 0.096 |
| RETRIEVAL_50 | 49 | 177053 | 568 | 0.277 | 0.086 |
| RETRIEVAL_MIN | 40 | 232658 | 755 | 0.172 | 0.053 |
| STATE_COMPACT_FB_COMPACT | 53 | 194671 | 627 | 0.272 | 0.085 |