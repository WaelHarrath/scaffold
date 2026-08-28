import type { ParsedAction } from "../cognition/action-parser.js";

export interface FeedbackResult {
  readonly action: ParsedAction;
  readonly success: boolean;
  readonly progress: "YES" | "NO" | "UNKNOWN";
  readonly changed: string[];
  readonly output: string | null;
  readonly error: string | null;
  readonly reason: string | null;
}

const MAX_OUTPUT_CHARS = 200;
const MAX_TOTAL_CHARS = 400;

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + "...";
}

export function formatFeedback(result: FeedbackResult): string {
  const lines: string[] = [];

  if (result.reason) {
    lines.push(`REJECTED: ${result.reason}`);
    return truncate(lines.join("\n"), MAX_TOTAL_CHARS);
  }

  lines.push(`RESULT: ${result.success ? "SUCCESS" : "FAILURE"}`);
  lines.push(`PROGRESS: ${result.progress}`);

  if (result.changed.length > 0) {
    lines.push(`CHANGED: ${result.changed.join(", ")}`);
  }

  if (result.output) {
    lines.push(`OUTPUT: ${truncate(result.output, MAX_OUTPUT_CHARS)}`);
  }

  if (result.error) {
    lines.push(`ERROR: ${truncate(result.error, MAX_OUTPUT_CHARS)}`);
  }

  return truncate(lines.join("\n"), MAX_TOTAL_CHARS);
}

export function estimateFeedbackTokens(result: FeedbackResult): number {
  const text = formatFeedback(result);
  return Math.ceil(text.length / 4);
}
