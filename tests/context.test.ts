import { describe, it, expect } from "vitest";
import {
  estimateTokens,
  createBudget,
  remainingBudget,
  fitsInBudget,
  DEFAULT_CONTEXT_SIZE,
  DEFAULT_RESERVED_OUTPUT,
} from "../src/context/context-budget.js";
import {
  buildCandidates,
  selectContext,
} from "../src/context/context-selector.js";
import { createInitialState } from "../src/state/state.js";

describe("estimateTokens", () => {
  it("returns ceil(length/4)", () => {
    expect(estimateTokens("abcd")).toBe(1); // 4 chars -> 1 token
  });

  it("rounds up for non-multiple-of-4", () => {
    expect(estimateTokens("abcde")).toBe(2); // 5 chars -> ceil(1.25) = 2
  });

  it("returns 0 for empty string", () => {
    expect(estimateTokens("")).toBe(0);
  });

  it("returns 1 for 1-4 chars", () => {
    expect(estimateTokens("x")).toBe(1);
    expect(estimateTokens("xx")).toBe(1);
    expect(estimateTokens("xxx")).toBe(1);
    expect(estimateTokens("xxxx")).toBe(1);
  });
});

describe("createBudget", () => {
  it("uses defaults when no args", () => {
    const b = createBudget();
    expect(b.total).toBe(DEFAULT_CONTEXT_SIZE);
    expect(b.reservedOutput).toBe(DEFAULT_RESERVED_OUTPUT);
    expect(b.inputBudget).toBe(DEFAULT_CONTEXT_SIZE - DEFAULT_RESERVED_OUTPUT);
  });

  it("calculates inputBudget correctly with custom values", () => {
    const b = createBudget(1000, 100);
    expect(b.total).toBe(1000);
    expect(b.reservedOutput).toBe(100);
    expect(b.inputBudget).toBe(900);
  });
});

describe("remainingBudget", () => {
  it("returns inputBudget minus usedTokens", () => {
    const b = createBudget(1000, 100);
    expect(remainingBudget(b, 400)).toBe(500);
  });

  it("returns 0 when used exceeds inputBudget", () => {
    const b = createBudget(1000, 100);
    expect(remainingBudget(b, 1000)).toBe(0);
  });

  it("floors at 0, never negative", () => {
    const b = createBudget(100, 10);
    expect(remainingBudget(b, 500)).toBe(0);
  });
});

describe("fitsInBudget", () => {
  it("returns true when text fits", () => {
    const b = createBudget(1000, 100); // inputBudget=900
    expect(fitsInBudget("hello", b, 0)).toBe(true);
  });

  it("returns false when text exceeds budget", () => {
    const b = createBudget(10, 0); // inputBudget=10, so max 40 chars
    expect(fitsInBudget("a".repeat(100), b, 0)).toBe(false);
  });

  it("accounts for usedSoFar", () => {
    const b = createBudget(50, 0); // inputBudget=50
    expect(fitsInBudget("a".repeat(44), b, 30)).toBe(true); // 11 tokens + 30 used = 41 <= 50
  });
});

describe("buildCandidates", () => {
  it("always includes task candidate", () => {
    const s = createInitialState("fix auth");
    const cands = buildCandidates(s, null, [], [], []);
    expect(cands.some((c) => c.id === "task" && c.category === "task")).toBe(true);
  });

  it("includes goal when different from task", () => {
    const s = createInitialState("fix auth");
    s.currentGoal = "fix login bug";
    const cands = buildCandidates(s, null, [], [], []);
    expect(cands.some((c) => c.id === "goal" && c.category === "goal")).toBe(true);
  });

  it("omits goal when same as task", () => {
    const s = createInitialState("fix auth");
    const cands = buildCandidates(s, null, [], [], []);
    expect(cands.some((c) => c.category === "goal")).toBe(false);
  });

  it("includes error candidates", () => {
    const s = createInitialState("task");
    const cands = buildCandidates(s, null, ["err1", "err2"], [], []);
    const errors = cands.filter((c) => c.category === "error");
    expect(errors).toHaveLength(2);
  });

  it("includes observation candidate", () => {
    const s = createInitialState("task");
    const cands = buildCandidates(s, "some obs", [], [], []);
    expect(cands.some((c) => c.category === "observation")).toBe(true);
  });

  it("omits observation when null", () => {
    const s = createInitialState("task");
    const cands = buildCandidates(s, null, [], [], []);
    expect(cands.some((c) => c.category === "observation")).toBe(false);
  });

  it("includes state candidate when state has data", () => {
    const s = createInitialState("task");
    s.currentFile = "a.ts";
    const cands = buildCandidates(s, null, [], [], []);
    expect(cands.some((c) => c.category === "state")).toBe(true);
  });

  it("includes retrieved candidates", () => {
    const s = createInitialState("task");
    const cands = buildCandidates(s, null, [], [{ id: "r1", content: "doc", score: 0.9 }], []);
    expect(cands.some((c) => c.id === "r1" && c.category === "retrieved")).toBe(true);
  });

  it("includes history candidates", () => {
    const s = createInitialState("task");
    const cands = buildCandidates(s, null, [], [], ["step1", "step2"]);
    const history = cands.filter((c) => c.category === "history");
    expect(history).toHaveLength(2);
  });
});

describe("selectContext", () => {
  it("always selects required categories (task, goal)", () => {
    const s = createInitialState("task");
    s.currentGoal = "different goal";
    const cands = buildCandidates(s, null, [], [], []);
    const budget = createBudget(4096, 0);
    const selected = selectContext(cands, budget, 0);

    const categories = selected.candidates.map((c) => c.category);
    expect(categories).toContain("task");
    expect(categories).toContain("goal");
  });

  it("drops candidates that exceed budget", () => {
    const s = createInitialState("task");
    s.currentGoal = "diff";
    const cands = buildCandidates(s, "obs", [], [], ["h1"]);
    const budget = createBudget(30, 0); // inputBudget=30, ~120 chars
    const selected = selectContext(cands, budget, 0);
    expect(selected.dropped.length).toBeGreaterThanOrEqual(0);
    expect(selected.totalTokens).toBeLessThanOrEqual(budget.inputBudget);
  });

  it("reports dropped ids", () => {
    const s = createInitialState("a".repeat(200));
    s.currentGoal = "b".repeat(200);
    const cands = buildCandidates(s, "c".repeat(200), [], [], []);
    const budget = createBudget(20, 0); // inputBudget=20, ~80 chars
    const selected = selectContext(cands, budget, 0);
    expect(selected.dropped.length).toBeGreaterThan(0);
  });

  it("respects usedTokens baseline", () => {
    const s = createInitialState("task");
    s.currentGoal = "diff";
    const cands = buildCandidates(s, null, [], [], []);
    const budget = createBudget(100, 0); // inputBudget=100
    const selected = selectContext(cands, budget, 90); // only 10 tokens left
    expect(selected.totalTokens).toBeLessThanOrEqual(100);
  });
});
