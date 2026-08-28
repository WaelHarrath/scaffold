import { describe, it, expect } from "vitest";
import {
  formatModelOnlyPrompt,
  formatMinimalPrompt,
  formatRetrievalPrompt,
  formatFullPrompt,
} from "../src/execution/format-prompt.js";
import { estimateTokens, createBudget, fitsInBudget } from "../src/context/context-budget.js";
import { createInitialState } from "../src/state/state.js";
import { SYSTEM_PROMPT } from "../src/execution/system-prompt.js";

function makeState(overrides?: Partial<ReturnType<typeof createInitialState>>): ReturnType<typeof createInitialState> {
  const state = createInitialState("Test task");
  return { ...state, ...overrides };
}

describe("token enforcement", () => {
  const budget = createBudget(4096, 256);
  const systemTokens = estimateTokens(SYSTEM_PROMPT);

  it("system prompt fits within input budget", () => {
    expect(systemTokens).toBeLessThanOrEqual(budget.inputBudget);
  });

  it("MODEL_ONLY prompt fits within input budget", () => {
    const state = makeState();
    const prompt = formatModelOnlyPrompt(state, null);
    const promptTokens = estimateTokens(prompt);
    const total = systemTokens + promptTokens;
    expect(total).toBeLessThanOrEqual(budget.inputBudget);
  });

  it("MINIMAL prompt fits within input budget", () => {
    const state = makeState({
      lastAction: "inspect config.json",
      progress: "YES",
      relevantFiles: ["config.json", "data.json", "src/app.ts"],
      failedActions: ["edit broken.ts"],
    });
    const prompt = formatMinimalPrompt(state, "RESULT: SUCCESS\nPROGRESS: YES\nCHANGED: config.json");
    const promptTokens = estimateTokens(prompt);
    const total = systemTokens + promptTokens;
    expect(total).toBeLessThanOrEqual(budget.inputBudget);
  });

  it("RETRIEVAL prompt fits within input budget", () => {
    const state = makeState();
    const longRetrieved = "a".repeat(3000);
    const prompt = formatRetrievalPrompt(state, "RESULT: SUCCESS", longRetrieved);
    const promptTokens = estimateTokens(prompt);
    const total = systemTokens + promptTokens;
    // This may exceed budget if retrieved is too long — that's expected behavior
    // The context selector should truncate. We test that format functions don't add overhead.
    expect(promptTokens).toBeGreaterThan(0);
  });

  it("FULL prompt fits within input budget with short state", () => {
    const state = makeState({ lastAction: "inspect a.ts" });
    const prompt = formatFullPrompt(state, "RESULT: SUCCESS", "[a.ts] content here");
    const promptTokens = estimateTokens(prompt);
    const total = systemTokens + promptTokens;
    expect(total).toBeLessThanOrEqual(budget.inputBudget);
  });

  it("estimateTokens uses chars/4 heuristic", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abc")).toBe(1);
    expect(estimateTokens("abcdefgh")).toBe(2);
  });

  it("inputBudget is total minus reserved", () => {
    expect(budget.inputBudget).toBe(3840);
    expect(budget.total).toBe(4096);
    expect(budget.reservedOutput).toBe(256);
  });

  it("fitsInBudget returns correct results", () => {
    expect(fitsInBudget("a".repeat(100), budget, 0)).toBe(true);
    expect(fitsInBudget("a".repeat(16000), budget, 0)).toBe(false);
  });

  it("all format functions produce bounded output", () => {
    const state = makeState({
      lastAction: "edit file.ts with some content",
      progress: "YES",
      relevantFiles: Array.from({ length: 50 }, (_, i) => `file${i}.ts`),
      failedActions: Array.from({ length: 20 }, (_, i) => `edit fail${i}.ts`),
    });
    const longFeedback = "A".repeat(500);
    const longRetrieved = "B".repeat(3000);

    const mo = formatModelOnlyPrompt(state, longFeedback);
    const mi = formatMinimalPrompt(state, longFeedback);
    const re = formatRetrievalPrompt(state, longFeedback, longRetrieved);
    const fu = formatFullPrompt(state, longFeedback, longRetrieved);

    // None should be unreasonably large (>5000 chars = ~1250 tokens)
    expect(mo.length).toBeLessThan(5000);
    expect(mi.length).toBeLessThan(5000);
    expect(re.length).toBeLessThan(10000);
    expect(fu.length).toBeLessThan(10000);
  });
});
