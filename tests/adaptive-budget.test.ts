import { describe, it, expect } from "vitest";
import {
  formatAdaptiveRetrieval,
  adaptiveBudgetSpec,
  wouldExpand,
  type AdaptiveItem,
} from "../src/retrieval/adaptive-budget.js";
import { formatRetrievalBudgeted } from "../src/execution/format-compress.js";
import { TASKS } from "../src/benchmark/tasks.js";

// Adaptive policy: deterministic, retrieval-time-only. The ONLY allowed
// trigger is whether a retrieved source is truncated by the base slice limit
// (source length > base limit). It must never use model reasoning/hindsight.

function item(id: string, content: string, score: number): AdaptiveItem {
  return { id, content, score };
}

describe("adaptive-budget policy (deterministic, retrieval-time signals only)", () => {
  it("keeps RETRIEVAL_75-sized slices when sources are short (not truncated)", () => {
    // content shorter than 225 base limit -> no expansion
    const items = [
      item("a.txt", "short content", 0.9),
      item("b.txt", "also short", 0.8),
      item("c.txt", "short too", 0.7),
    ];
    const out = formatAdaptiveRetrieval(items, "ADAPTIVE_LENGTH");
    expect(out.expansions).toHaveLength(0);
    expect(out.expandedItemCount).toBe(0);
    expect(out.truncatedItemCount).toBe(0);
    expect(out.admittedItemCount).toBe(3);
    // admitted full content since it's short
    expect(out.text).toContain("[a.txt] short content");
    expect(out.text).toContain("[c.txt] short too");
  });

  it("expands ONLY the truncated result toward the FULL limit (ADAPTIVE_LENGTH)", () => {
    const long = "x".repeat(300);
    const items = [
      item("long.txt", long, 0.95),
      item("short.txt", "short", 0.9),
      item("mid.txt", "y".repeat(100), 0.8),
    ];
    const out = formatAdaptiveRetrieval(items, "ADAPTIVE_LENGTH");
    expect(out.truncatedItemCount).toBe(1); // only long.txt > 225
    expect(out.expandedItemCount).toBe(1);
    expect(out.expansions).toHaveLength(1);
    const e = out.expansions[0]!;
    expect(e.trigger).toBe("truncated");
    expect(e.rank).toBe(0);
    expect(e.originalLength).toBe(225);
    expect(e.expandedLength).toBe(300); // long.txt expanded to FULL limit
    // expanded slice length == expandedItemCharLimit (300)
    expect(out.text).toContain("[long.txt] " + "x".repeat(300));
    // short.txt gets base slice; mid.txt (100 chars < 225) not expanded
    expect(out.text).toContain("[short.txt] short");
    expect(out.text).toContain("[mid.txt] " + "y".repeat(100));
  });

  it("records similarity, rank, original and expanded length for every expansion", () => {
    const items = [
      item("log.txt", "z".repeat(400), 0.61),
      item("cfg.txt", "q".repeat(240), 0.55),
    ];
    const out = formatAdaptiveRetrieval(items, "ADAPTIVE_HYBRID");
    expect(out.expansions).toHaveLength(2);
    expect(out.expansions[0]).toMatchObject({ trigger: "truncated", rank: 0, similarity: 0.61, originalLength: 225, expandedLength: 300 });
    expect(out.expansions[1]).toMatchObject({ trigger: "truncated", rank: 1, similarity: 0.55, originalLength: 225, expandedLength: 240 });
  });

  it("is deterministic across repeated calls (same inputs, same outputs)", () => {
    const items = [
      item("a.txt", "x".repeat(300), 0.9),
      item("b.txt", "y".repeat(50), 0.8),
      item("c.txt", "z".repeat(100), 0.7),
    ];
    const a = formatAdaptiveRetrieval(items, "ADAPTIVE_LENGTH");
    const b = formatAdaptiveRetrieval(items, "ADAPTIVE_LENGTH");
    expect(a.text).toBe(b.text);
    expect(a.expansions).toEqual(b.expansions);
    expect(a.expandedItemCount).toBe(b.expandedItemCount);
  });

  it("does not use the number of items as a truncation signal", () => {
    // 3 short items, even though there are exactly 3 results -> no expansion
    const items = [
      item("a.txt", "aa", 0.9),
      item("b.txt", "bb", 0.8),
      item("c.txt", "cc", 0.7),
    ];
    const out = formatAdaptiveRetrieval(items, "ADAPTIVE_TOPK");
    expect(out.expandedItemCount).toBe(0);
  });

  it("wouldExpand is purely a function of source length", () => {
    expect(wouldExpand(224, "ADAPTIVE_LENGTH")).toBe(false);
    expect(wouldExpand(225, "ADAPTIVE_LENGTH")).toBe(false); // not > base
    expect(wouldExpand(226, "ADAPTIVE_LENGTH")).toBe(true);
    expect(wouldExpand(226, "ADAPTIVE_HYBRID")).toBe(true);
  });

  it("retrieval-token estimate is positive and scales with text", () => {
    const short = formatAdaptiveRetrieval([item("a", "hello", 0.9)], "ADAPTIVE_LENGTH");
    const long = formatAdaptiveRetrieval([item("a", "hello world foo bar baz qux corge", 0.9)], "ADAPTIVE_LENGTH");
    expect(short.tokens).toBeGreaterThan(0);
    expect(long.tokens).toBeGreaterThanOrEqual(short.tokens);
  });
});

describe("adaptive policy is INERT on the actual benchmark task suite", () => {
  it("no workspace file content exceeds the 225-char base slice limit", () => {
    let max = 0;
    for (const t of TASKS) {
      for (const f of t.workspace) max = Math.max(max, f.content.length);
    }
    // benchmark evidence: longest source is 200 chars (< 225)
    expect(max).toBeLessThanOrEqual(225);
    expect(max).toBeLessThanOrEqual(200);
  });

  it("therefore NOTHING triggers expansion for any benchmark task file", () => {
    let expansions = 0;
    let checked = 0;
    for (const t of TASKS) {
      for (const f of t.workspace) {
        checked++;
        if (wouldExpand(f.content.length, "ADAPTIVE_HYBRID")) expansions++;
      }
    }
    expect(checked).toBe(33);
    expect(expansions).toBe(0);
  });

  it("adaptive spec base equals RETRIEVAL_75 and expansion equals FULL", () => {
    const s = adaptiveBudgetSpec("ADAPTIVE_LENGTH");
    expect(s.baseTopK).toBe(3);
    expect(s.baseItemCharLimit).toBe(225);
    expect(s.expandedItemCharLimit).toBe(300);
  });

  it("is byte-identical to RETRIEVAL_75 formatting on every benchmark task file", () => {
    // Integration proof: feed real workspace files as (ranked) retrieved items;
    // since no source is truncated, adaptive must render exactly what
    // RETRIEVAL_75 renders — so adaptive is provably inert on this suite.
    for (const t of TASKS) {
      const items: AdaptiveItem[] = t.workspace.map((f, i) => ({
        id: f.path,
        content: f.content,
        score: 1 - i / 100, // fabricated ranking order only
      }));
      for (const level of ["ADAPTIVE_LENGTH", "ADAPTIVE_TOPK", "ADAPTIVE_HYBRID"] as const) {
        const adaptive = formatAdaptiveRetrieval(items, level);
        const baseline = formatRetrievalBudgeted(
          items.map((i) => ({ id: i.id, content: i.content })),
          "RETRIEVAL_75",
        );
        expect(adaptive.text, `${t.id} @ ${level}`).toBe(baseline);
        expect(adaptive.expandedItemCount, `${t.id} @ ${level}`).toBe(0);
      }
    }
  });
});
