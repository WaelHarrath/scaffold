## Overall Results by Condition

| MODEL_ONLY | 10/100 | 10.0% | 20.0 | 5004 | 13.6s |
| MINIMAL | 35/100 | 35.0% | 9.6 | 2759 | 6.8s |
| RETRIEVAL | 26/100 | 26.0% | 9.5 | 2837 | 8.8s |
| FULL | 41/100 | 41.0% | 6.1 | 1960 | 6.0s |

## Conversions and Regressions

### MINIMAL vs MODEL_ONLY
- Conversions: 25
  - ER1 rep0
  - CP1 rep0
  - CP2 rep0
  - RA1 rep0
  - DC1 rep0
  - ER1 rep1
  - CP1 rep1
  - CP2 rep1
  - RA1 rep1
  - DC1 rep1
  - ER1 rep2
  - CP1 rep2
  - CP2 rep2
  - RA1 rep2
  - DC1 rep2
  - ER1 rep3
  - CP1 rep3
  - CP2 rep3
  - RA1 rep3
  - DC1 rep3
  - ER1 rep4
  - CP1 rep4
  - CP2 rep4
  - RA1 rep4
  - DC1 rep4
- Regressions: 0

### RETRIEVAL vs MODEL_ONLY
- Conversions: 16
  - ER1 rep0
  - CP2 rep0
  - RA1 rep0
  - ER1 rep1
  - CP2 rep1
  - RA1 rep1
  - ER1 rep2
  - CP2 rep2
  - AS2 rep2
  - RA1 rep2
  - ER1 rep3
  - CP2 rep3
  - RA1 rep3
  - ER1 rep4
  - CP2 rep4
  - RA1 rep4
- Regressions: 0

### FULL vs MODEL_ONLY
- Conversions: 31
  - MS2 rep0
  - ER1 rep0
  - TO2 rep0
  - CP2 rep0
  - CF2 rep0
  - RA1 rep0
  - DC1 rep0
  - MS2 rep1
  - ER1 rep1
  - CP2 rep1
  - CF2 rep1
  - RA1 rep1
  - DC1 rep1
  - MS2 rep2
  - ER1 rep2
  - TO1 rep2
  - CP2 rep2
  - CF2 rep2
  - RA1 rep2
  - DC1 rep2
  - MS2 rep3
  - ER1 rep3
  - CP2 rep3
  - CF2 rep3
  - RA1 rep3
  - DC1 rep3
  - MS2 rep4
  - ER1 rep4
  - CP2 rep4
  - CF2 rep4
  - RA1 rep4
- Regressions: 0

## Category Results

| Category | MODEL_ONLY | MINIMAL | RETRIEVAL | FULL |
|---|---|---|---|---|
| state_tracking | 0/10 | 0/10 | 0/10 | 0/10 |
| multi_step_reasoning | 0/10 | 0/10 | 0/10 | 5/10 |
| error_recovery | 0/10 | 5/10 | 5/10 | 5/10 |
| tool_output_interpretation | 0/10 | 0/10 | 0/10 | 2/10 |
| constraint_preservation | 0/10 | 10/10 | 5/10 | 5/10 |
| cross_file_reasoning | 0/10 | 0/10 | 0/10 | 5/10 |
| action_selection | 0/10 | 0/10 | 1/10 | 0/10 |
| completion_verification | 10/10 | 10/10 | 10/10 | 10/10 |
| repeated_action_avoidance | 0/10 | 5/10 | 5/10 | 5/10 |
| decomposition | 0/10 | 5/10 | 0/10 | 4/10 |

## Failure Classification

- reasoning_failure: 278
- infrastructure: 10