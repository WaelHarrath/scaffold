import { describe, it, expect } from "vitest";
import {
  DEFAULT_CONFIG,
  resolveConfig,
  validateScaffoldConfig,
} from "../src/config.js";
import { ConfigurationError } from "../src/errors.js";

describe("config defaults", () => {
  it("resolveConfig uses frozen validated defaults", () => {
    const c = resolveConfig({});
    expect(c.model).toBe("qwen3:4b-instruct");
    expect(c.embeddingModel).toBe("all-minilm:latest");
    expect(c.contextWindow).toBe(4096);
    expect(c.reservedOutputTokens).toBe(256);
    expect(c.inputBudget).toBe(4096 - 256);
    expect(c.temperature).toBe(0.1);
    expect(c.maxOutputTokens).toBe(256);
    expect(c.maxActions).toBe(20);
    expect(c.ollamaEndpoint).toBe("http://localhost:11434");
    expect(c.retrievalEnabled).toBe(true);
    expect(c.retrievalTopK).toBe(3);
    expect(c.retrievalBudget).toBe("RETRIEVAL_75");
    expect(c.stateEnabled).toBe(true);
    expect(c.feedbackEnabled).toBe(true);
    expect(c.governorEnabled).toBe(true);
    expect(c.executionTimeoutMs).toBe(120_000);
  });

  it("DEFAULT_CONFIG matches validated defaults", () => {
    expect(DEFAULT_CONFIG.contextWindow).toBe(4096);
    expect(DEFAULT_CONFIG.reservedOutputTokens).toBe(256);
    expect(DEFAULT_CONFIG.temperature).toBe(0.1);
    expect(DEFAULT_CONFIG.maxOutputTokens).toBe(256);
    expect(DEFAULT_CONFIG.maxActions).toBe(20);
  });
});

describe("config overrides", () => {
  it("honors provided values", () => {
    const c = resolveConfig({
      model: "x",
      contextWindow: 8192,
      maxActions: 5,
      maxOutputTokens: 128,
      executionTimeoutMs: 5000,
    });
    expect(c.model).toBe("x");
    expect(c.contextWindow).toBe(8192);
    expect(c.inputBudget).toBe(8192 - 256);
    expect(c.maxActions).toBe(5);
    expect(c.maxOutputTokens).toBe(128);
    expect(c.executionTimeoutMs).toBe(5000);
  });
});

describe("config validation", () => {
  const cases: Array<[string, Record<string, unknown>]> = [
    ["contextWindow below minimum", { contextWindow: 100 }],
    ["contextWindow above maximum", { contextWindow: 40000 }],
    ["negative reservedOutputTokens", { reservedOutputTokens: -1 }],
    ["reservedOutputTokens >= contextWindow", { contextWindow: 512, reservedOutputTokens: 512 }],
    ["temperature below range", { temperature: -0.5 }],
    ["temperature above range", { temperature: 3 }],
    ["maxOutputTokens below 1", { maxOutputTokens: 0 }],
    ["maxActions below 1", { maxActions: 0 }],
    ["topP below range", { topP: -0.1 }],
    ["topP above range", { topP: 1.5 }],
    ["invalid endpoint", { ollamaEndpoint: "not-a-url" }],
    ["invalid endpoint scheme", { ollamaEndpoint: "ftp://localhost" }],
    ["negative retrievalTopK", { retrievalTopK: -1 }],
    ["negative executionTimeoutMs", { executionTimeoutMs: -5 }],
    ["invalid retrievalBudget", { retrievalBudget: "nope" }],
  ];

  for (const [label, patch] of cases) {
    it(`rejects ${label}`, () => {
      expect(() => validateScaffoldConfig(patch)).toThrow(ConfigurationError);
      expect(() => resolveConfig(patch)).toThrow(ConfigurationError);
    });
  }

  it("rejects with CONFIGURATION_ERROR code", () => {
    try {
      resolveConfig({ contextWindow: 100 });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigurationError);
      expect((err as { code: string }).code).toBe("CONFIGURATION_ERROR");
      expect((err as { toSafeString: () => string }).toSafeString()).toContain("[CONFIGURATION_ERROR]");
    }
  });

  it("accepts valid boundary values", () => {
    expect(() =>
      resolveConfig({ contextWindow: 512, reservedOutputTokens: 0, temperature: 0 } as never),
    ).not.toThrow();
    expect(() => resolveConfig({ executionTimeoutMs: 0 })).not.toThrow();
    expect(() => resolveConfig({ topP: undefined })).not.toThrow();
  });
});
