# SCAFFOLD — Research

This document consolidates the SCAFFOLD research: the question, the experimental
setup, the models evaluated, the major findings, and their boundaries. It is a
factual summary of measured results — not a claim of universal or intrinsic-model
improvement.

---

## 1. Research Question

> Can deterministic software infrastructure compensate for the specific
> reasoning/reliability deficits of a small model — without changing the
> underlying model?

SCAFFOLD treats the reasoning model as fixed and asks whether careful, systematic
management of the execution loop (state, feedback, retrieval, and action
execution) can make a small model reliably usable for structured tasks, even if
the model's intrinsic capability is unchanged.

SCAFFOLD does **not** modify model weights and does **not** increase intrinsic
model reasoning capability.

## 2. Experimental Setup

- **Task suite:** the SCAFFOLD benchmark — 30 structured file/state-editing
  tasks (10 easy / 10 medium / 10 hard) across 10 categories.
- **Execution counts:** from 200 to 1000 executions per condition across the
  evaluation program, comparing configurations that incrementally add
  deterministic runtime mechanisms around the model.
- **Conditions compared:** model-only baseline, and configurations adding
  structured feedback, semantic retrieval, state, an action governor, and a
  deterministic executor, plus efficiency variants (compressed state/feedback,
  reduced retrieval admission).
- **Primary metric:** task completion (success rate); secondary metrics include
  model calls, total tokens, and latency.

## 3. Models Evaluated

| Role | Model |
|---|---|
| Reasoning / action selection | `qwen3:4b-instruct` |
| Embedding / retrieval | `all-minilm:latest` |

- **Context window:** 4096 tokens (3840 input / 256 reserved output)
- **Temperature:** 0.1
- **Max actions per task:** 20

Results are model-specific and were measured only with this configuration.

## 4. Major Findings

### Experimentally supported
- The full SCAFFOLD stack raises `qwen3:4b-instruct` task completion on the
  benchmark from a ~10% raw-model baseline to the ~46–50% range (replicated).
- **FEEDBACK** is independently effective on its own.
- **RETRIEVAL** is independently effective on its own.
- **STATE** is the decisive increment within the full stack (a causal trace found
  that only STATE differed between the near-full and full configurations, and
  binding hard tasks flipped with it).
- A reduced retrieval-admission budget (`RETRIEVAL_75`) is Pareto-superior to the
  full configuration on completion, calls, tokens, and latency, with no
  regressions.

### Partially supported
- FULL vs RETRIEVAL_75 parity: no statistically significant completion difference
  in a paired sample (McNemar p = 1.0; CI [-1.7%, +2.7%]). RETRIEVAL_75 remains
  the recommended lean default.

### Not supported
- STATE alone or GOVERNOR alone improving completion.
- Compressing STATE/FEEDBACK to save cost without loss.
- Aggressive retrieval reduction (`RETRIEVAL_MIN`) — degrades hard tasks.
- Adaptive retrieval: no workspace file exceeds the base slice, so adaptive
  policies never trigger and ship identical payloads to the lean default.
- "Increased intrinsic reasoning", "generalization to arbitrary small models".

## 5. Interpretation Constraint

The research demonstrates experiment-supported, model-specific improvements in
the **effective reliability** of `qwen3:4b-instruct` through deterministic
management of state, feedback, retrieval, and action execution.

It does **not** establish:
- increased intrinsic model reasoning capability
- general reasoning improvement for arbitrary models
- universal improvement across small language models
- that SCAFFOLD makes a 4B model equivalent to a larger model

See [`LIMITATIONS.md`](./LIMITATIONS.md) for the complete boundaries and
[`REPRODUCIBILITY.md`](./REPRODUCIBILITY.md) for the validated environment and
reproduction guidance.
