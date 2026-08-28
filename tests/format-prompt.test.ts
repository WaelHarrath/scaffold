import { describe, it, expect } from "vitest";
import { createInitialState } from "../src/state/state.js";
import {
  formatModelOnlyPrompt,
  formatFeedbackOnlyPrompt,
  formatRetrievalOnlyPrompt,
  formatFeedbackRetrievalPrompt,
  formatFullPrompt,
} from "../src/execution/format-prompt.js";

// Condition formatters used in the controlled efficiency comparison.
// These tests verify each condition renders exactly the intended
// prompt sections, and that the NEW formatRetrievalOnlyPrompt correctly
// isolates retrieval (no FEEDBACK or STATE leakage).

function richState() {
  const s = createInitialState("fix the build");
  s.lastAction = "inspect src/a.ts";
  s.progress = "YES";
  s.relevantFiles = ["src/a.ts", "src/b.ts"];
  s.failedActions = ["inspect src/missing.ts"];
  s.completionStatus = "in_progress";
  return s;
}

describe("condition formatters", () => {
  it("MODEL_ONLY renders only the TASK section", () => {
    const out = formatModelOnlyPrompt(richState(), "FEEDBACK: RESULT: FAILURE");
    expect(out).toBe("TASK: fix the build");
    expect(out).not.toContain("FEEDBACK");
    expect(out).not.toContain("STATE");
  });

  it("FEEDBACK_ONLY renders TASK + FEEDBACK, no STATE", () => {
    const out = formatFeedbackOnlyPrompt(richState(), "RESULT: SUCCESS");
    expect(out).toContain("TASK: fix the build");
    expect(out).toContain("FEEDBACK: RESULT: SUCCESS");
    expect(out).not.toContain("STATE:");
    expect(out).not.toContain("RELEVANT");
  });

  it("FEEDBACK_ONLY omits FEEDBACK when null", () => {
    const out = formatFeedbackOnlyPrompt(richState(), null);
    expect(out).toBe("TASK: fix the build");
    expect(out).not.toContain("FEEDBACK");
  });

  it("RETRIEVAL_ONLY renders TASK + RELEVANT, no FEEDBACK, no STATE (isolation)", () => {
    const out = formatRetrievalOnlyPrompt(richState(), "RESULT: SUCCESS", "[src/a.ts] const x = 1");
    expect(out).toContain("TASK: fix the build");
    expect(out).toContain("RELEVANT: [src/a.ts] const x = 1");
    expect(out).not.toContain("FEEDBACK");
    expect(out).not.toContain("STATE:");
  });

  it("RETRIEVAL_ONLY omits RELEVANT when empty", () => {
    const out = formatRetrievalOnlyPrompt(richState(), null, "");
    expect(out).toBe("TASK: fix the build");
    expect(out).not.toContain("RELEVANT");
  });

  it("FEEDBACK_RETRIEVAL renders TASK + RELEVANT + FEEDBACK, no STATE", () => {
    const out = formatFeedbackRetrievalPrompt(richState(), "RESULT: FAILURE", "[src/a.ts] x");
    expect(out).toContain("TASK: fix the build");
    expect(out).toContain("RELEVANT: [src/a.ts] x");
    expect(out).toContain("FEEDBACK: RESULT: FAILURE");
    expect(out).not.toContain("STATE:");
  });

  it("FULL renders TASK + STATE + RELEVANT + FEEDBACK (no path duplication)", () => {
    const out = formatFullPrompt(richState(), "RESULT: SUCCESS", "[src/a.ts] x");
    expect(out).toContain("TASK: fix the build");
    expect(out).toContain("STATE:");
    expect(out).toContain("RELEVANT: [src/a.ts] x");
    expect(out).toContain("FEEDBACK: RESULT: SUCCESS");
  });

  it("condition formatters never emit FEEDBACK content list label without the FEEDBACK mechanism", () => {
    // RETRIEVAL_ONLY is the key isolation guarantee: feedback must not leak.
    const withFeedback = formatRetrievalOnlyPrompt(richState(), "RESULT: SUCCESS", "data");
    expect(withFeedback).not.toContain("FEEDBACK");
  });
});
