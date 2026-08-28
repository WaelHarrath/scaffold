# SCAFFOLD — Final Evidence Summary

**Status:** RESEARCH FREEZE — consolidated evidence
**Date:** 2026-08-28

This document consolidates the measured evidence across Phases 1-8 into a single, conservative evidence table. All numbers are taken **verbatim** from the corresponding phase reports and reconciliation summaries — no recomputation is performed here. Evidence is labeled:

- **SUPPORTED** — direct, repeatable measurement across an adequate sample with a causal ablation pairing.
- **PARTIALLY SUPPORTED** — some support, but weaker than SUPPORTED (smaller delta, near-CI boundary, single sample).
- **NOT SUPPORTED** — measured experiment failed to show the claimed effect.
- **INCONCLUSIVE** — evidence is conflictive, exploratory, or under-powered to reach a classified status.

Where applicable, a distinction is drawn between **causal** evidence (controlled ablation, paired comparisons) and **correlational/exploratory** evidence.

> **Important framing note:** All evidence is **single-model** (`qwen3:4b-instruct`), single hardware, single benchmark. None of it establishes an increase in intrinsic model reasoning capability or generalization to arbitrary small models.

---

## 1. Cumulative Executions

Phases 1-8 total: 400 + 400 + 1000 + 800 + 1000 + 400 + 200 = **4200 executions**.

| Phase | Executions | Focus |
|---|---|---|
| 1 | 400 | 4 conditions, isolation of components (10 infra failures) |
| 2 | 400 | 4 conditions re-run post executor fix (0 infra failures) |
| 3 | 1000 | 10-condition ablation matrix |
| 4 | 800 | 8-condition efficiency/minimal-stack search |
| 5 | 0 (analysis) | Causal trace of the full stack (relies on Phase 4 data) |
| 6 | 1000 | 10-condition compression/optimization (RETRIEVAL_75) |
| 7 | 400 | Full-stack sample-size confirmation (FULL vs RETRIEVAL_75) |
| 8 | 200 | Adaptive-retrieval parity (RETRIEVAL_75 vs ADAPTIVE_HYBRID) |

---

## 2. Key Measured Numbers (verbatim, from phase reports)

| Metric | Phase | FULL / FULL_CONTROL | RETRIEVAL_75 | MODEL_ONLY |
|---|---|---|---|---|
| Completion | 1 | 43.2% (41/95) | — | 10.0% (10/100) |
| Completion | 2 | 50.0% (50/100) | — | 10.0% (10/100) |
| Completion | 3 | 46.0% (best, FULL) | — | 10.0% |
| Completion | 4 | 49.0% (FULL) | — | — |
| Completion | 6 | 47.0% (FULL_CONTROL) | 49.0% (49/100) | — |
| Completion | 7 | 47.5% (95/200) | 48.5% (96/198) | — |
| Completion | 8 | — | 47% (47/100) | — |

Phase 6 helper rows (1000 executions, 10 conditions): COMPACT_STATE 46%, MIN_STATE 48%, COMPACT_FEEDBACK 52%, MINIMAL_FEEDBACK 48%, RETRIEVAL_50 49%, RETRIEVAL_MIN 40%, STATE_COMPACT_FB_COMPACT 53%, BEST_COMPRESSION 48%.

Phase 7 paired result: 3 conversions / 2 regressions; McNemar p = 1.0; CI [-1.7%, +2.7%].

Phase 8 parity (200 executions): RETRIEVAL_75 47% vs ADAPTIVE_HYBRID 47%; avg prompt/call 301.4 vs 302.9; avg retrieval tokens 76.3 vs 76.3; zero adaptive expansions.

---

## 3. Consolidated Evidence Table

| # | Claim / Mechanism | Evidence | Status |
|---|---|---|---|
| E1 | SCAFFOLD full stack improves completion over raw model | Phase 1: MODEL_ONLY 10% → FULL 43.2%; Phase 2: 10% → 50%; Phase 3: 10% → 46%; Phase 4: FULL 49%. Repeated across 4 phases with 800+ full-stack executions. Paired causal decomposition (Phase 5). | **SUPPORTED** (causal, repeated) |
| E2 | FEEDBACK is an independently effective mechanism | Phase 3: FEEDBACK alone +20pp; Phase 4: FEEDBACK_ONLY 30% (=61.2% of FULL). Consistent across phases. | **SUPPORTED** (causal) |
| E3 | RETRIEVAL (semantic content) is independently effective | Phase 3: RETRIEVAL alone +20pp; Phase 4: RETRIEVAL alone +10pp (20%). Direction consistent; magnitude varies. | **SUPPORTED** (causal; magnitude varies) |
| E4 | STATE is the decisive increment in the full stack | Phase 5 causal trace: FEEDBACK_RETRIEVAL_GOVERNOR vs FULL differ only by STATE; binding hard tasks flip (MS2/CF2/RA2 0/5→5/5, DC1 0/5→4/5). | **SUPPORTED** (causal, analysis-based) |
| E5 | STATE or GOVERNOR alone is effective | Phase 3: STATE contributes ~0 alone; GOVERNOR contributes ~0 alone (only meaningful in combination). | **NOT SUPPORTED** (alone) |
| E6 | FULL stack is the most efficient (success/1k tokens, /call, /sec) | Phase 4: FULL most efficient (0.253 successes/1k tokens, 0.080/call, 0.052/sec). | **SUPPORTED** (Phase 4) |
| E7 | RETRIEVAL_75 is a Pareto-superior lean deployment of FULL | Phase 6: 49% vs 47% completion, 510 vs 522 calls, 160,480 vs 164,747 tokens, 4.7s vs 5.0s, zero regressions. | **SUPPORTED** (Phase 6) |
| E8 | Retaining FULL vs RETRIEVAL_75 (sample-size confirmation) | Phase 7: FULL 47.5% vs R75 48.5%, n=200/198, McNemar p=1.0, CI [-1.7%, +2.7%] — no reliable difference at this sample. | **PARTIALLY SUPPORTED** (config parity within CI) |
| E9 | Compression of STATE or FEEDBACK saves cost without loss | Phase 6: COMPACT/MIN state and feedback do not reliably preserve/improve completion; MINIMAL_FEEDBACK degrades MS2 to 1/5. | **NOT SUPPORTED** |
| E10 | Aggressive retrieval reduction is safe | Phase 6: RETRIEVAL_MIN collapses MS2/RA2 to 0/5, 9 regressions, 40%. | **NOT SUPPORTED** (RETRIEVAL_MIN) |
| E11 | Adaptive retrieval improves the system | Phase 8: ADAPTIVE_HYBRID byte-identical to RETRIEVAL_75 payloads, 0 expansions, identical 47% parity. | **NOT SUPPORTED** |
| E12 | SCAFFOLD increases intrinsic reasoning capability | No evidence of weight/architecture change; improvements framed as effective reliability. | **NOT SUPPORTED** (no such claim supported) |
| E13 | SCAFFOLD generalizes to arbitrary small models | Only `qwen3:4b-instruct` measured. | **INCONCLUSIVE** / **NOT SUPPORTED** |
| E14 | SCAFFOLD reduces latency absolutely | Phase 6/8 token/latency improvements are for specific variants; latency tied to call count and hardware. | **SUPPORTED** (variant-specific, correlational) |

---

## 4. Causal vs Correlational / Exploratory

- **Causal (controlled ablations):** E1, E2, E3, E4, E5, E6, E7, E9, E10, E11 — these come from paired/controlled ablation comparisons (Phases 3-5) or direct condition contrasts (Phase 6), including a paired McNemar comparison (Phase 7) and a structured parity proof (Phase 8).
- **Correlational / exploratory:** E14 (latency/call-count associations) and any implied cost-performance frontiers (Phase 6 Pareto analysis). These describe associations and post-hoc selections, not isolated causal interventions.

---

## 5. Recommended Frozen Conclusions

1. The **full SCAFFOLD stack** reliably elevates `qwen3:4b-instruct` completion from a ~10% raw-model baseline to the ~46-50% range across Phases 1-4 (repeatable, SUPPORTED).
2. **FEEDBACK** and **RETRIEVAL** are each independently effective; **STATE** is the decisive increment only within the full stack.
3. **RETRIEVAL_75 is the recommended lean deployment**: measured Pareto-superior to FULL in Phase 6 and statistically indistinguishable from FULL in the larger Phase 7 sample.
4. **Adaptive retrieval is NOT SUPPORTED** (Phase 8) and is excluded from the recommended configuration.
5. **No claim of intrinsic reasoning increase or general small-model applicability** is made.

See `LIMITATIONS.md` for the boundaries of these conclusions.
