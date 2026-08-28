import { describe, it, expect } from "vitest";
import {
  formatFeedback,
  estimateFeedbackTokens,
} from "../src/feedback/feedback.js";
import type { FeedbackResult } from "../src/feedback/feedback.js";

const baseAction = { type: "inspect" as const, target: "a.ts" };

function makeResult(overrides: Partial<FeedbackResult>): FeedbackResult {
  return {
    action: baseAction,
    success: true,
    progress: "YES",
    changed: [],
    output: null,
    error: null,
    reason: null,
    ...overrides,
  };
}

describe("formatFeedback", () => {
  it("formats SUCCESS result", () => {
    const result = makeResult({ success: true });
    const text = formatFeedback(result);
    expect(text).toContain("RESULT: SUCCESS");
    expect(text).toContain("PROGRESS: YES");
  });

  it("formats FAILURE result", () => {
    const result = makeResult({ success: false, progress: "NO" });
    const text = formatFeedback(result);
    expect(text).toContain("RESULT: FAILURE");
    expect(text).toContain("PROGRESS: NO");
  });

  it("formats REJECTED result with reason", () => {
    const result = makeResult({ reason: "duplicate action" });
    const text = formatFeedback(result);
    expect(text).toBe("REJECTED: duplicate action");
  });

  it("rejects early and skips other fields", () => {
    const result = makeResult({
      reason: "blocked",
      success: true,
      output: "data",
      changed: ["a.ts"],
    });
    const text = formatFeedback(result);
    expect(text).toBe("REJECTED: blocked");
    expect(text).not.toContain("SUCCESS");
    expect(text).not.toContain("CHANGED");
  });

  it("includes CHANGED when files changed", () => {
    const result = makeResult({ changed: ["a.ts", "b.ts"] });
    const text = formatFeedback(result);
    expect(text).toContain("CHANGED: a.ts, b.ts");
  });

  it("omits CHANGED line when empty", () => {
    const result = makeResult({ changed: [] });
    const text = formatFeedback(result);
    expect(text).not.toContain("CHANGED");
  });

  it("includes OUTPUT when present", () => {
    const result = makeResult({ output: "file contents here" });
    const text = formatFeedback(result);
    expect(text).toContain("OUTPUT: file contents here");
  });

  it("omits OUTPUT when null", () => {
    const result = makeResult({ output: null });
    const text = formatFeedback(result);
    expect(text).not.toContain("OUTPUT");
  });

  it("includes ERROR when present", () => {
    const result = makeResult({ success: false, error: "permission denied" });
    const text = formatFeedback(result);
    expect(text).toContain("ERROR: permission denied");
  });

  it("omits ERROR when null", () => {
    const result = makeResult({ error: null });
    const text = formatFeedback(result);
    expect(text).not.toContain("ERROR");
  });

  it("truncates long output to 200 chars", () => {
    const longOutput = "x".repeat(300);
    const result = makeResult({ output: longOutput });
    const text = formatFeedback(result);
    expect(text.length).toBeLessThanOrEqual(400);
    expect(text).toContain("...");
  });

  it("does not truncate short output", () => {
    const result = makeResult({ output: "short" });
    const text = formatFeedback(result);
    expect(text).toContain("OUTPUT: short");
    expect(text).not.toContain("...");
  });
});

describe("estimateFeedbackTokens", () => {
  it("returns ceil(len/4) of formatted output", () => {
    const result = makeResult({ success: true });
    const text = formatFeedback(result);
    expect(estimateFeedbackTokens(result)).toBe(Math.ceil(text.length / 4));
  });
});
