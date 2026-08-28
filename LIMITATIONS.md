# SCAFFOLD — Limitations

This document records the known limitations of the SCAFFOLD research. It constrains how results may be interpreted. **No claim of universal improvement or of increased intrinsic reasoning is made.**

---

## 1. Model Limitations

- **Single model only.** All evidence was measured with `qwen3:4b-instruct` (4B). No measurement was performed on other models. Improvements in effective reliability are **model-specific** and do not establish generalization to arbitrary small models (SUPPORTED claims apply only to `qwen3:4b-instruct`).
- **Fixed prompt contract.** The action grammar and system prompt are tuned for this model. A different model may not adhere to the strict single-action output format.
- **No seed support.** The Ollama adapter cannot fix a random seed, so `qwen3:4b-instruct` output is stochastic; run-to-run exact success values vary. This affects reproducibility of exact numbers (see `REPRODUCIBILITY.md`).

## 2. Hardware / Runtime Limitations

- Measured on a single machine/stack. Absolute latency and absolute token/throughput figures (e.g., the efficiency comparisons) are hardware-dependent and should not be interpolated across environments.
- Embedding cost (rebuilding retrieval indexes per execution) is included in wall time but tracked separately from model-call latency; on slower embedding paths the retrieval overhead may dominate.

## 3. Benchmark Limitations

- Evaluation is confined to the SCAFFOLD benchmark: 30 tasks (10 easy / 10 medium / 10 hard) across 10 categories. This is a small, purpose-built suite, not a general capability benchmark.
- Task success is the primary metric; partial progress and qualitative output quality are not fully captured.
- Hard/discriminator tasks (difficulty-3) is a small subset; some conclusions (e.g., binding-task flips) rest on small per-task sample sizes.

## 4. Statistical / Experimental Limitations

- Sample sizes range from 200 to 1000 executions per condition. Deltas within a few percentage points are within stochastic noise: a paired sample gave McNemar p = 1.0 with CI [-1.7%, +2.7%], meaning FULL vs RETRIEVAL_75 are statistically indistinguishable at n≈200 per arm.
- Several low-level claims (E2/E3 magnitudes) vary in magnitude across experiment runs (e.g., RETRIEVAL alone +20pp in one run, +10pp in another) — direction is consistent, exact magnitude is not a fixed constant.
- Token/feedback/retrieval counts are partly estimator-based (`ceil(len/4)`), not exact model tokenizations.
- BEST_COMPRESSION was a post-hoc single composite that re-ran an existing core condition and recorded variance; it is treated only as a variance check, not a robust result.

## 5. Retrieval Limitations

- Retrieval content is limited to workspace files (max ~33 files); tiny workspaces mean retrieval rarely faces genuine content pressure.
- Adaptive retrieval is NOT SUPPORTED: no file exceeds 225 chars, so adaptive expansion never triggers and ADAPTIVE_HYBRID ships byte-identical payloads to RETRIEVAL_75. Adaptive behavior is untested under genuinely large/oversized-corpus conditions.

## 6. Generalization Claims (explicitly NOT made)

- SCAFFOLD does **not** increase intrinsic model reasoning capability.
- SCAFFOLD improvements do **not** generalize to arbitrary small models.
- SCAFFOLD is **not** production-ready and makes **no** claim of universal improvement.
- The validated configuration is a research artifact for `qwen3:4b-instruct` on the SCAFFOLD benchmark only.

---

## 7. Recommended Conservative Reading

> SCAFFOLD demonstrates experimentally supported, model-specific improvements in the effective reliability of `qwen3:4b-instruct` through deterministic management of state, feedback, retrieval, and action execution. The evidence does not establish that SCAFFOLD increases intrinsic model reasoning capability or generalizes to arbitrary small models.
