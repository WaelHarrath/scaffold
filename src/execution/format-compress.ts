import type { TaskState } from "../state/state.js";
import type { FeedbackResult } from "../feedback/feedback.js";

// ─── STATE compression levels ────────────────────────────────────────────────
// All levels use ONLY information already present in TaskState. No new state is
// invented. These are strict subsets of the full-state representation used in
// the validated configuration.

export type StateCompressionLevel = "FULL_STATE" | "COMPACT_STATE" | "MIN_STATE" | "PROGRESS_STATE";

export function formatState(state: TaskState, level: StateCompressionLevel): string {
  const bits: string[] = [];

  switch (level) {
    case "FULL_STATE":
      if (state.lastAction) bits.push(`last=${state.lastAction}`);
      if (state.progress !== "UNKNOWN") bits.push(`progress=${state.progress}`);
      if (state.relevantFiles.length > 0) bits.push(`files=${state.relevantFiles.join(",")}`);
      if (state.completionStatus !== "in_progress") bits.push(`status=${state.completionStatus}`);
      if (state.failedActions.length > 0) bits.push(`failed=${state.failedActions.length}`);
      break;

    case "COMPACT_STATE":
      // B: last action, progress, files changed, failed/rejected info (drop status)
      if (state.lastAction) bits.push(`last=${state.lastAction}`);
      if (state.progress !== "UNKNOWN") bits.push(`progress=${state.progress}`);
      if (state.relevantFiles.length > 0) bits.push(`files=${state.relevantFiles.join(",")}`);
      if (state.failedActions.length > 0) bits.push(`failed=${state.failedActions.length}`);
      break;

    case "MIN_STATE":
      // C: progress, last action/result (currentFile), changed files (drop failed, status)
      if (state.lastAction) bits.push(`last=${state.lastAction}`);
      if (state.progress !== "UNKNOWN") bits.push(`progress=${state.progress}`);
      if (state.relevantFiles.length > 0) bits.push(`files=${state.relevantFiles.join(",")}`);
      break;

    case "PROGRESS_STATE":
      // D: progress, completion status, files changed (drop last action, failed)
      if (state.progress !== "UNKNOWN") bits.push(`progress=${state.progress}`);
      if (state.completionStatus !== "in_progress") bits.push(`status=${state.completionStatus}`);
      if (state.relevantFiles.length > 0) bits.push(`files=${state.relevantFiles.join(",")}`);
      break;
  }

  return bits.length > 0 ? `STATE: ${bits.join("; ")}` : "";
}

// ─── FEEDBACK compression levels ─────────────────────────────────────────────
// All levels use ONLY information already present in FeedbackResult. These are
// strict subsets / tighter-truncations of the full-feedback format.

export type FeedbackCompressionLevel = "FULL_FEEDBACK" | "COMPACT_FEEDBACK" | "MINIMAL_FEEDBACK";

const COMPACT_MAX = 200;
const MINIMAL_MAX = 120;

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + "...";
}

export function formatFeedbackCompressed(
  result: FeedbackResult,
  level: FeedbackCompressionLevel,
): string {
  // Governor rejection (identical across levels — it is already compact)
  if (result.reason) {
    return `REJECTED: ${truncate(result.reason, 120)}`;
  }

  switch (level) {
    case "FULL_FEEDBACK": {
      const lines: string[] = [];
      lines.push(`RESULT: ${result.success ? "SUCCESS" : "FAILURE"}`);
      lines.push(`PROGRESS: ${result.progress}`);
      if (result.changed.length > 0) lines.push(`CHANGED: ${result.changed.join(", ")}`);
      if (result.output) lines.push(`OUTPUT: ${truncate(result.output, 200)}`);
      if (result.error) lines.push(`ERROR: ${truncate(result.error, 200)}`);
      return truncate(lines.join("\n"), 400);
    }

    case "COMPACT_FEEDBACK": {
      // B: keep RESULT + CHANGED + (OUTPUT|ERROR); drop PROGRESS line (redundant with state)
      const lines: string[] = [];
      lines.push(`RESULT: ${result.success ? "SUCCESS" : "FAILURE"}`);
      if (result.changed.length > 0) lines.push(`CHANGED: ${result.changed.join(", ")}`);
      if (result.output) lines.push(`OUTPUT: ${truncate(result.output, 100)}`);
      else if (result.error) lines.push(`ERROR: ${truncate(result.error, 100)}`);
      return truncate(lines.join("\n"), COMPACT_MAX);
    }

    case "MINIMAL_FEEDBACK": {
      // C: keep only binary RESULT + CHANGED files (no OUTPUT/ERROR detail)
      const lines: string[] = [];
      lines.push(`RESULT: ${result.success ? "SUCCESS" : "FAILURE"}`);
      if (result.changed.length > 0) lines.push(`CHANGED: ${result.changed.join(", ")}`);
      return truncate(lines.join("\n"), MINIMAL_MAX);
    }
  }
}

// ─── RETRIEVAL budget scaling ────────────────────────────────────────────────
// The retrieval ALGORITHM is unchanged. Only the amount of retrieved content
// admitted into the 4096-token context varies. FULL = top-3 items, 300 chars
// each (validated-configuration behavior). Lower budgets reduce the per-item
// slice length and
// the number of items admitted.

export type RetrievalBudgetLevel = "FULL" | "RETRIEVAL_75" | "RETRIEVAL_50" | "RETRIEVAL_MIN";

export interface RetrievalBudgetSpec {
  readonly topK: number;
  readonly itemCharLimit: number;
  readonly maxTotalChars: number;
}

export function retrievalBudgetSpec(level: RetrievalBudgetLevel): RetrievalBudgetSpec {
  switch (level) {
    case "FULL":
      return { topK: 3, itemCharLimit: 300, maxTotalChars: 900 };
    case "RETRIEVAL_75":
      return { topK: 3, itemCharLimit: 225, maxTotalChars: 675 };
    case "RETRIEVAL_50":
      return { topK: 2, itemCharLimit: 150, maxTotalChars: 300 };
    case "RETRIEVAL_MIN":
      return { topK: 1, itemCharLimit: 80, maxTotalChars: 80 };
  }
}

export function formatRetrievalBudgeted(
  items: { id: string; content: string }[],
  level: RetrievalBudgetLevel,
): string {
  const spec = retrievalBudgetSpec(level);
  const parts: string[] = [];
  let total = 0;
  for (const item of items.slice(0, spec.topK)) {
    const slice = item.content.slice(0, spec.itemCharLimit);
    if (total + slice.length > spec.maxTotalChars) break;
    parts.push(`[${item.id}] ${slice}`);
    total += slice.length;
  }
  return parts.join("\n");
}
