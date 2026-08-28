import { estimateTokens } from "../context/context-budget.js";

// ─── ADAPTIVE RETRIEVAL BUDGET ────────────────────────────────────────────────
// Deterministic, retrieval-time-only adaptive expansion.
//
// Hypothesis (H1): a small retrieval payload is sufficient for most decisions,
// but some retrieval RESULTS require more context because the source they point
// at is longer than the admitted slice.
//
// The ONLY deterministic retrieval-time signal that distinguishes a
// "sufficiently informative" slice from a "truncated" slice is:
//
//      source content length  >  base slice limit
//
// i.e. the slice is a PROPER TRUNCATION of the source (content was available in
// the workspace but cut off by the budget). If the full source already fits in
// the base slice, no adaptive expansion is warranted — the model already has the
// complete source.
//
// No model reasoning, hindsight, future/verification outcome, or confidence is
// used. The decision is a pure function of retrieval-time items.
//
// Design note (evidence-driven): on the benchmark's 33 workspace files,
// the longest source is 200 chars, so NO source is ever truncated at the 225-char
// base limit. Therefore this policy is provably inert (0 expansions) on the
// current task suite — it is implemented and unit-tested for correctness, but
// cannot fire on a benchmark whose sources all fit within the base slice.

export type AdaptiveBudgetLevel = "ADAPTIVE_LENGTH" | "ADAPTIVE_TOPK" | "ADAPTIVE_HYBRID";

export interface AdaptiveBudgetSpec {
  readonly baseTopK: number;
  readonly baseItemCharLimit: number;
  readonly expandedItemCharLimit: number;
  readonly maxTotalChars: number;
  readonly allowMoreItemsOnTruncation: boolean;
}

// Base = RETRIEVAL_75 (225-char, top-3); expand toward FULL (300-char) only on
// truncation. This preserves RETRIEVAL_75's efficiency when content is short and
// recovers FULL's admission when a result genuinely needs more context.
export function adaptiveBudgetSpec(level: AdaptiveBudgetLevel): AdaptiveBudgetSpec {
  switch (level) {
    case "ADAPTIVE_LENGTH":
      return { baseTopK: 3, baseItemCharLimit: 225, expandedItemCharLimit: 300, maxTotalChars: 900, allowMoreItemsOnTruncation: false };
    case "ADAPTIVE_TOPK":
      return { baseTopK: 3, baseItemCharLimit: 225, expandedItemCharLimit: 300, maxTotalChars: 900, allowMoreItemsOnTruncation: true };
    case "ADAPTIVE_HYBRID":
      return { baseTopK: 3, baseItemCharLimit: 225, expandedItemCharLimit: 300, maxTotalChars: 900, allowMoreItemsOnTruncation: true };
  }
}

export interface AdaptiveItem {
  readonly id: string;
  readonly content: string; // FULL source content (retrieval time)
  readonly score: number;   // similarity score (retrieval time)
}

export interface ExpansionRecord {
  readonly trigger: "truncated";
  readonly rank: number;
  readonly similarity: number;
  readonly originalLength: number;
  readonly expandedLength: number;
}

export interface AdaptiveRetrievalOutcome {
  readonly text: string;
  readonly tokens: number;
  readonly expansions: ExpansionRecord[];
  readonly expandedItemCount: number;
  readonly admittedItemCount: number;
  readonly truncatedItemCount: number;
}

// Deterministically decide, per ranked item, whether the truncated source needs
// expansion, then render the retrieval slice. Pure function of retrieval-time
// inputs only.
export function formatAdaptiveRetrieval(
  items: AdaptiveItem[],
  level: AdaptiveBudgetLevel,
): AdaptiveRetrievalOutcome {
  const spec = adaptiveBudgetSpec(level);
  const parts: string[] = [];
  const expansions: ExpansionRecord[] = [];
  let total = 0;
  let expandedCount = 0;
  let truncatedCount = 0;
  let admittedCount = 0;

  for (let rank = 0; rank < items.length && rank < spec.baseTopK; rank++) {
    const item = items[rank]!;
    const isTruncated = item.content.length > spec.baseItemCharLimit;
    if (isTruncated) truncatedCount++;

    // Deterministic signal: only expand when the source is TRUNCATED by the base
    // slice. Otherwise keep the RETRIEVAL_75-sized slice (efficiency preserved).
    const limit = isTruncated ? spec.expandedItemCharLimit : spec.baseItemCharLimit;
    const slice = item.content.slice(0, limit);

    if (!isTruncated) {
      // Efficiency path — fixed budget accounting (admission of full content).
      if (total + slice.length > spec.maxTotalChars) break;
      parts.push(`[${item.id}] ${slice}`);
      total += slice.length;
      admittedCount++;
      continue;
    }

    // Expansion path — the source was truncated, so admit the expanded slice.
    parts.push(`[${item.id}] ${slice}`);
    total += slice.length;
    admittedCount++;
    expandedCount++;
    expansions.push({
      trigger: "truncated",
      rank,
      similarity: item.score,
      originalLength: spec.baseItemCharLimit,
      expandedLength: slice.length,
    });
  }

  return {
    text: parts.join("\n"),
    tokens: estimateTokens(parts.join("\n")),
    expansions,
    expandedItemCount: expandedCount,
    admittedItemCount: admittedCount,
    truncatedItemCount: truncatedCount,
  };
}

// Convenience: does THIS benchmark/task suite ever trigger expansion? Determinism
// check exposed for tests and reporting.
export function wouldExpand(contentLength: number, level: AdaptiveBudgetLevel): boolean {
  return contentLength > adaptiveBudgetSpec(level).baseItemCharLimit;
}
