import { describe, it, expect } from "vitest";
import { createScaffold } from "../src/index.js";
import { createLogger } from "../src/logger.js";
import type { ReasoningModel, EmbeddingModel } from "../src/model/types.js";
import { ScaffoldError, ModelError, TimeoutError, CancelledError } from "../src/errors.js";

class FakeModel implements ReasoningModel {
  modelId = "fake-model";
  calls = 0;
  constructor(private readonly queue: string[], private readonly mode: "resolve" | "never" | "throw" = "resolve") {}
  async generate(): Promise<import("../src/model/types.js").ModelResponse> {
    this.calls++;
    if (this.mode === "throw") throw new Error("transport down");
    if (this.mode === "never") return new Promise(() => {});
    const content = this.queue.shift() ?? "finish done";
    return { content, usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 } };
  }
}

class FakeEmbedding implements EmbeddingModel {
  modelId = "fake-embed";
  async embed(): Promise<number[]> {
    return [0.1, 0.2, 0.3];
  }
  async embedBatch(): Promise<number[][]> {
    return [[0.1, 0.2, 0.3]];
  }
}

describe("createScaffold public API", () => {
  it("exposes frozen validated defaults on config", () => {
    const s = createScaffold();
    expect(s.config.model).toBe("qwen3:4b-instruct");
    expect(s.config.contextWindow).toBe(4096);
    expect(s.config.maxActions).toBe(20);
  });

  it("honors provided config", () => {
    const s = createScaffold({ config: { maxActions: 3, model: "custom" } });
    expect(s.config.maxActions).toBe(3);
    expect(s.config.model).toBe("custom");
  });

  it("rejects invalid config at construction", () => {
    expect(() => createScaffold({ config: { contextWindow: 100 } })).toThrow(ScaffoldError);
    expect(() => createScaffold({ config: { temperature: 3 } })).toThrow(ScaffoldError);
  });
});

describe("execute structured results", () => {
  it("returns a completed result when the model signals finish", async () => {
    const s = createScaffold({
      config: { retrievalEnabled: false, workingDirectory: process.cwd() },
      model: new FakeModel(["finish all good"]),
      embeddingModel: new FakeEmbedding(),
    });
    const r = await s.execute("do a thing");
    expect(r.success).toBe(true);
    expect(r.terminationReason).toBe("completed");
    expect(r.response).toBe("all good");
    expect(r.modelCalls).toBe(1);
    expect(r.executionId).toMatch(/^exec-/);
    expect(r.durationMs).toBeGreaterThanOrEqual(0);
    expect(r.tokenEstimates.totalTokens).toBeGreaterThan(0);
    expect(r.retrievalStats.enabled).toBe(false);
    expect(r.retrievalStats.calls).toBe(0);
  });

  it("returns exhausted result when actions run out without finish", async () => {
    const s = createScaffold({
      config: { retrievalEnabled: false, maxActions: 2, maxOutputTokens: 128 },
      model: new FakeModel(["run pwd", "run pwd"]),
      embeddingModel: new FakeEmbedding(),
    });
    const r = await s.execute("no finish here");
    expect(r.success).toBe(false);
    expect(r.terminationReason).toBe("exhausted");
    expect(r.actions.length).toBeGreaterThan(0);
  });
});

describe("tools through the runtime", () => {
  it("executes a registered tool and reports it in the result", async () => {
    const s = createScaffold({
      config: { retrievalEnabled: false, maxActions: 3 },
      model: new FakeModel(["run query_db", "finish done"]),
      embeddingModel: new FakeEmbedding(),
    });
    s.registerTool({
      name: "query_db",
      execute: async () => ({ success: true, output: "rows=5", error: null }),
    });
    const r = await s.execute("query the db");
    expect(r.success).toBe(true);
    expect(r.toolCalls).toBeGreaterThanOrEqual(1);
    const inv = r.toolExecutions.find((i) => i.toolName === "query_db");
    expect(inv).toBeDefined();
    expect(inv!.success).toBe(true);
  });

  it("records a failing tool as failure without throwing", async () => {
    const s = createScaffold({
      config: { retrievalEnabled: false, maxActions: 3 },
      model: new FakeModel(["run broken", "finish done"]),
      embeddingModel: new FakeEmbedding(),
    });
    s.registerTool({
      name: "broken",
      execute: async () => ({ success: false, output: "", error: "nope", filesChanged: [] }),
    });
    const r = await s.execute("use a tool");
    const inv = r.toolExecutions.find((i) => i.toolName === "broken");
    expect(inv).toBeDefined();
    expect(inv!.success).toBe(false);
  });
});

describe("model failure, timeout, cancellation", () => {
  it("wraps a model transport failure in a ModelError", async () => {
    const s = createScaffold({
      config: { retrievalEnabled: false },
      model: new FakeModel([], "throw"),
      embeddingModel: new FakeEmbedding(),
    });
    await expect(s.execute("boom")).rejects.toBeInstanceOf(ModelError);
    await expect(s.execute("boom")).rejects.toMatchObject({ code: "MODEL_ERROR" });
  });

  it("rejects with TimeoutError after executionTimeoutMs", async () => {
    const s = createScaffold({
      config: { retrievalEnabled: false, executionTimeoutMs: 20 },
      model: new FakeModel([], "never"),
      embeddingModel: new FakeEmbedding(),
    });
    await expect(s.execute("hang")).rejects.toBeInstanceOf(TimeoutError);
    await expect(s.execute("hang")).rejects.toMatchObject({ code: "TIMEOUT" });
  });

  it("rejects with CancelledError when the signal is already aborted", async () => {
    const s = createScaffold({
      config: { retrievalEnabled: false },
      model: new FakeModel(["finish done"]),
      embeddingModel: new FakeEmbedding(),
    });
    const controller = new AbortController();
    controller.abort();
    await expect(s.execute("cancel me", { signal: controller.signal })).rejects.toBeInstanceOf(CancelledError);
    await expect(s.execute("cancel me", { signal: controller.signal })).rejects.toMatchObject({ code: "CANCELLED" });
  });

  it("rejects with CancelledError when the signal aborts mid-execution", async () => {
    const s = createScaffold({
      config: { retrievalEnabled: false, executionTimeoutMs: 0 },
      model: new FakeModel([], "never"),
      embeddingModel: new FakeEmbedding(),
    });
    const controller = new AbortController();
    const promise = s.execute("cancel mid", { signal: controller.signal });
    setTimeout(() => controller.abort(), 10);
    await expect(promise).rejects.toMatchObject({ code: "CANCELLED" });
  });
});

describe("disabling mechanisms", () => {
  it("runs with governor, state, and feedback disabled", async () => {
    const s = createScaffold({
      config: {
        retrievalEnabled: false,
        governorEnabled: false,
        stateEnabled: false,
        feedbackEnabled: false,
        maxActions: 2,
      },
      model: new FakeModel(["run a", "finish ok"]),
      embeddingModel: new FakeEmbedding(),
    });
    const r = await s.execute("simple task");
    expect(r.success).toBe(true);
  });

  it("runs with retrieval enabled using a fake embedding model", async () => {
    const s = createScaffold({
      config: { retrievalEnabled: true, maxActions: 2, workingDirectory: process.cwd() },
      model: new FakeModel(["finish done"]),
      embeddingModel: new FakeEmbedding(),
    });
    const r = await s.execute("retrieve me");
    expect(r.retrievalStats.enabled).toBe(true);
    expect(r.retrievalStats.calls).toBeGreaterThanOrEqual(1);
  });
});

describe("logging security", () => {
  it("captures logs during a failing execution without leaking prompt/secret content", async () => {
    const lines: string[] = [];
    const secret = "SUPERSECRET-TOKEN-abc123";
    const s = createScaffold({
      config: { retrievalEnabled: false },
      model: new FakeModel([], "throw"),
      embeddingModel: new FakeEmbedding(),
      logger: {
        level: "info",
        debug: (m: string) => lines.push(m),
        info: (m: string) => lines.push(m),
        warn: (m: string) => lines.push(m),
        error: (m: string) => lines.push(m),
      },
    });
    await expect(s.execute("run the " + secret + " routine")).rejects.toMatchObject({ code: "MODEL_ERROR" });
    const joined = lines.join("\n");
    expect(joined).toContain("model call failed");
    expect(joined).not.toContain(secret);
    expect(joined).not.toContain("SUPERSECRET");
  });

  it("the built-in RuntimeLogger honors the silent level by emitting nothing", async () => {
    const lines: string[] = [];
    const logger = createLogger("silent", (level, msg) => lines.push(level + ":" + msg));
    logger.debug("d");
    logger.info("i");
    logger.warn("w");
    logger.error("e");
    expect(lines).toHaveLength(0);
  });

  it("the built-in RuntimeLogger filters by level", () => {
    const lines: string[] = [];
    const logger = createLogger("warn", (level, msg) => lines.push(level + ":" + msg));
    logger.debug("d");
    logger.info("i");
    logger.warn("w");
    logger.error("e");
    expect(lines).toEqual(["warn:w", "error:e"]);
  });

  it("errors do not serialize secrets into safe strings", () => {
    const err = new ModelError("failed", { causeDetail: "token SECRET-TOK" });
    expect(err.toSafeString()).not.toContain("SECRET-TOK");
  });
});
