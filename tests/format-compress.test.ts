import { describe, it, expect } from "vitest";
import { createInitialState } from "../src/state/state.js";
import {
  formatState,
  formatFeedbackCompressed,
  formatRetrievalBudgeted,
  retrievalBudgetSpec,
} from "../src/execution/format-compress.js";
import type { FeedbackResult } from "../src/feedback/feedback.js";

// Compression variants must be STRICT SUBSETS of the FULL
// information — only removing/truncating existing content, never inventing new
// state or new feedback fields.

function richState() {
  const s = createInitialState("cross-file refactor");
  s.lastAction = "edit src/a.ts";
  s.progress = "YES";
  s.relevantFiles = ["src/a.ts", "src/b.ts"];
  s.failedActions = ["inspect src/missing.ts", "run tsc"];
  s.completionStatus = "stuck";
  return s;
}

function fullFeedback(): FeedbackResult {
  return {
    action: { type: "edit", target: "a.ts", content: "x" },
    success: true,
    progress: "YES",
    changed: ["a.ts"],
    output: "wrote a.ts",
    error: null,
    reason: null,
  };
}

function failedFeedback(): FeedbackResult {
  return {
    action: { type: "inspect", target: "missing.ts", content: undefined },
    success: false,
    progress: "NO",
    changed: [],
    output: null,
    error: "failed to read missing.ts",
    reason: null,
  };
}

function rejectedFeedback(): FeedbackResult {
  return {
    action: { type: "inspect", target: "a.ts", content: undefined },
    success: false,
    progress: "NO",
    changed: [],
    output: null,
    error: null,
    reason: "duplicate of previous action",
  };
}

describe("STATE compression levels", () => {
  it("FULL_STATE includes last, progress, files, status, failed", () => {
    const out = formatState(richState(), "FULL_STATE");
    expect(out).toContain("last=edit src/a.ts");
    expect(out).toContain("progress=YES");
    expect(out).toContain("files=src/a.ts,src/b.ts");
    expect(out).toContain("status=stuck");
    expect(out).toContain("failed=2");
  });

  it("COMPACT_STATE drops status but keeps last/progress/files/failed", () => {
    const out = formatState(richState(), "COMPACT_STATE");
    expect(out).toContain("last=edit src/a.ts");
    expect(out).toContain("progress=YES");
    expect(out).toContain("files=src/a.ts,src/b.ts");
    expect(out).toContain("failed=2");
    expect(out).not.toContain("status=");
  });

  it("MIN_STATE drops status and failed", () => {
    const out = formatState(richState(), "MIN_STATE");
    expect(out).toContain("last=edit src/a.ts");
    expect(out).toContain("progress=YES");
    expect(out).toContain("files=src/a.ts,src/b.ts");
    expect(out).not.toContain("failed=");
    expect(out).not.toContain("status=");
  });

  it("PROGRESS_STATE keeps progress/status/files, drops last and failed", () => {
    const out = formatState(richState(), "PROGRESS_STATE");
    expect(out).toContain("progress=YES");
    expect(out).toContain("status=stuck");
    expect(out).toContain("files=src/a.ts,src/b.ts");
    expect(out).not.toContain("last=edit");
    expect(out).not.toContain("failed=");
  });

  it("COMPACT_STATE never exceeds FULL_STATE in emitted fields", () => {
    const full = formatState(richState(), "FULL_STATE").split(";").map((s) => s.split("=")[0]!.trim());
    const compact = formatState(richState(), "COMPACT_STATE").split(";").map((s) => s.split("=")[0]!.trim());
    for (const c of compact) {
      expect(full).toContain(c);
    }
  });

  it("returns empty string (not 'STATE:') when nothing to emit", () => {
    const s = createInitialState("empty");
    expect(formatState(s, "MIN_STATE")).toBe("");
  });
});

describe("FEEDBACK compression levels", () => {
  it("FULL_FEEDBACK includes RESULT/PROGRESS/CHANGED/OUTPUT", () => {
    const out = formatFeedbackCompressed(fullFeedback(), "FULL_FEEDBACK");
    expect(out).toContain("RESULT: SUCCESS");
    expect(out).toContain("PROGRESS: YES");
    expect(out).toContain("CHANGED: a.ts");
    expect(out).toContain("OUTPUT: wrote a.ts");
  });

  it("COMPACT_FEEDBACK drops PROGRESS and output detail, keeps RESULT+CHANGED", () => {
    const out = formatFeedbackCompressed(fullFeedback(), "COMPACT_FEEDBACK");
    expect(out).toContain("RESULT: SUCCESS");
    expect(out).toContain("CHANGED: a.ts");
    expect(out).not.toContain("PROGRESS:");
    // OUTPUT may be trimmed but RESULT/CHANGED must remain
    expect(out.length).toBeLessThanOrEqual(200);
  });

  it("MINIMAL_FEEDBACK keeps only binary RESULT + CHANGED", () => {
    const out = formatFeedbackCompressed(fullFeedback(), "MINIMAL_FEEDBACK");
    expect(out).toContain("RESULT: SUCCESS");
    expect(out).toContain("CHANGED: a.ts");
    expect(out).not.toContain("OUTPUT:");
    expect(out).not.toContain("ERROR:");
    expect(out).not.toContain("PROGRESS:");
    expect(out.length).toBeLessThanOrEqual(120);
  });

  it("failure keeps RESULT: FAILURE (and error in full, but not minimal)", () => {
    const fullOut = formatFeedbackCompressed(failedFeedback(), "FULL_FEEDBACK");
    expect(fullOut).toContain("RESULT: FAILURE");
    expect(fullOut).toContain("ERROR:");
    const minOut = formatFeedbackCompressed(failedFeedback(), "MINIMAL_FEEDBACK");
    expect(minOut).toContain("RESULT: FAILURE");
    expect(minOut).not.toContain("ERROR:");
  });

  it("governor rejection preserved at all levels", () => {
    for (const level of ["FULL_FEEDBACK", "COMPACT_FEEDBACK", "MINIMAL_FEEDBACK"] as const) {
      const out = formatFeedbackCompressed(rejectedFeedback(), level);
      expect(out).toContain("REJECTED:");
    }
  });

  it("compressed output is never longer than fully formatted output", () => {
    const fullLen = formatFeedbackCompressed(fullFeedback(), "FULL_FEEDBACK").length;
    const compLen = formatFeedbackCompressed(fullFeedback(), "COMPACT_FEEDBACK").length;
    const minLen = formatFeedbackCompressed(fullFeedback(), "MINIMAL_FEEDBACK").length;
    expect(compLen).toBeLessThanOrEqual(fullLen);
    expect(minLen).toBeLessThanOrEqual(compLen);
  });
});

describe("RETRIEVAL budget scaling", () => {
  const items = [
    { id: "a.ts", content: "a".repeat(400) },
    { id: "b.ts", content: "b".repeat(400) },
    { id: "c.ts", content: "c".repeat(400) },
  ];

  it("FULL admits top-3 at 300 chars each", () => {
    const spec = retrievalBudgetSpec("FULL");
    expect(spec.topK).toBe(3);
    expect(spec.itemCharLimit).toBe(300);
    const out = formatRetrievalBudgeted(items, "FULL");
    expect(out).toContain("[a.ts]");
    expect(out).toContain("[b.ts]");
    expect(out).toContain("[c.ts]");
    // content slices are 300 each; output includes a small "[id] " prefix per item
    expect(out.length).toBeLessThanOrEqual(3 * 307 + 2);
  });

  it("RETRIEVAL_50 admits fewer items and fewer chars than FULL", () => {
    const full = formatRetrievalBudgeted(items, "FULL");
    const half = formatRetrievalBudgeted(items, "RETRIEVAL_50");
    expect(half).not.toContain("[c.ts]");
    expect(half.length).toBeLessThan(full.length);
  });

  it("RETRIEVAL_MIN admits only top-1 with short slice", () => {
    const out = formatRetrievalBudgeted(items, "RETRIEVAL_MIN");
    expect(out).toContain("[a.ts]");
    expect(out).not.toContain("[b.ts]");
    expect(out.length).toBeLessThanOrEqual(80 + 7);
  });

  it("budget levels are monotonically non-increasing in admitted characters", () => {
    const len = (l: "FULL" | "RETRIEVAL_75" | "RETRIEVAL_50" | "RETRIEVAL_MIN") => formatRetrievalBudgeted(items, l).length;
    expect(len("RETRIEVAL_75")).toBeLessThanOrEqual(len("FULL"));
    expect(len("RETRIEVAL_50")).toBeLessThanOrEqual(len("RETRIEVAL_75"));
    expect(len("RETRIEVAL_MIN")).toBeLessThanOrEqual(len("RETRIEVAL_50"));
  });
});
