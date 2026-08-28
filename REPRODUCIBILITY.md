# SCAFFOLD — Reproducibility

This document describes the validated environment and configuration under which
the SCAFFOLD results were measured, and the known boundaries on reproducing
them. It supports the consolidated findings in [`RESEARCH.md`](./RESEARCH.md).

---

## 1. Validated Environment

| Item | Value |
|---|---|
| Reasoning model | `qwen3:4b-instruct` (Ollama) |
| Embedding model | `all-minilm:latest` (Ollama) |
| Context window | 4096 (num_ctx) / 3840 input / 256 output |
| Max output tokens per call | 256 |
| Temperature | 0.1 |
| Max actions per task | 20 |
| Token estimator | `ceil(text.length / 4)` |
| Ollama endpoint | `http://localhost:11434` |

Results were measured only with this configuration and only with these models.
No other model is claimed to be supported.

## 2. Verification Gate

The public repository includes a unit/regression test suite. The gate is:

```bash
npm install
npm test          # vitest run
npm run typecheck # tsc --noEmit
npm run build     # tsc
```

As of 2026-08-28: **261 tests passing, typecheck clean, build clean.**

## 3. Known Reproducibility Boundaries

1. **Stochastic model output.** `qwen3:4b-instruct` has no seed support via the
   adapter, so exact success counts vary across runs. For near-equal
   configurations, expect variance roughly within the paired-sample CI of
   [-1.7%, +2.7%] observed for the FULL vs RETRIEVAL_75 contrast.
2. **Estimator-based token counts.** Prompt/completion tokens come from Ollama
   (`prompt_eval_count` / `eval_count`); feedback and retrieval token counts are
   `ceil(len/4)` estimates, not exact model tokenizations.
3. **Embedding cache size.** Evaluation runs use `new EmbeddingCache(500)`.
   Workspaces larger than the cache re-embed repeatedly, which affects runtime
   (embedding cost is tracked separately from model-call latency) but does not
   change success outcomes.
4. **Hardware dependence.** Absolute latency and throughput figures are
   machine-specific and should not be interpolated across environments.
5. **Single benchmark.** Results are limited to the SCAFFOLD task suite
   (30 tasks: 10 easy / 10 medium / 10 hard, across 10 categories). This is a
   small, purpose-built suite, not a general capability benchmark.

## 4. Reproducing a Result in Practice

- Pin the validated model tags (`qwen3:4b-instruct`, `all-minilm:latest`) and the
  Ollama endpoint.
- Run the verification gate before and after any run to confirm the environment
  is intact.
- Record the Ollama version and machine specifications alongside runs for
  latency comparability.
- Treat small percentage-point deltas (≤ ~3pp) between near-equal
  configurations as within noise unless a paired contrast (McNemar) supports a
  difference.

## 5. Interpretation Constraint

Results are model-specific to `qwen3:4b-instruct` on the SCAFFOLD benchmark.
They do not establish increased intrinsic model reasoning capability,
generalization to arbitrary small models, or universal improvement. See
[`LIMITATIONS.md`](./LIMITATIONS.md) for the full boundaries.
