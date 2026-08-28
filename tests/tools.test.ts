import { describe, it, expect } from "vitest";
import {
  createToolRegistry,
  createToolExecutor,
  type ScaffoldTool,
  type ToolResult,
} from "../src/tools.js";
import { createExecutor, type Executor } from "../src/execution/executor.js";
import { ToolError } from "../src/errors.js";

function dummyExecutor(): Executor {
  return {
    async execute(action) {
      return {
        success: false,
        output: "",
        error: `default executor: ${action.type} ${action.target ?? ""}`,
        filesChanged: [],
      };
    },
  };
}

function makeTool(name: string, result: ToolResult): ScaffoldTool {
  return {
    name,
    execute: async () => result,
  };
}

describe("createToolRegistry", () => {
  it("starts empty", () => {
    const reg = createToolRegistry();
    expect(reg.count).toBe(0);
    expect(reg.names()).toEqual([]);
    expect(reg.has("x")).toBe(false);
    expect(reg.get("x")).toBeUndefined();
  });

  it("registers and retrieves tools", () => {
    const reg = createToolRegistry();
    const tool = makeTool("t1", { success: true, output: "ok", error: null });
    reg.register(tool);
    expect(reg.count).toBe(1);
    expect(reg.has("t1")).toBe(true);
    expect(reg.get("t1")).toBe(tool);
  });

  it("registerAll registers multiple and rejects duplicates", () => {
    const reg = createToolRegistry();
    reg.registerAll([
      makeTool("a", { success: true, output: "", error: null }),
      makeTool("b", { success: true, output: "", error: null }),
    ]);
    expect(reg.count).toBe(2);
    expect(() => reg.register(makeTool("a", { success: true, output: "", error: null }))).toThrow(ToolError);
  });

  it("rejects registering a tool without a name", () => {
    const reg = createToolRegistry();
    expect(() =>
      reg.register({ name: "", execute: async () => ({ success: true, output: "", error: null }) }),
    ).toThrow(ToolError);
  });
});

describe("createToolExecutor dispatch", () => {
  it("dispatches to a registered tool on a run command", async () => {
    const reg = createToolRegistry();
    const tool = makeTool("query_db", { success: true, output: "rows=5", error: null });
    reg.register(tool);
    const exec = createToolExecutor(dummyExecutor(), reg);

    const res = await exec.execute({ type: "run", target: "query_db" });
    expect(res.success).toBe(true);
    expect(res.output).toBe("rows=5");
    expect(reg.listInvocations()).toHaveLength(1);
    expect(reg.listInvocations()[0].toolName).toBe("query_db");
    expect(reg.listInvocations()[0].success).toBe(true);
  });

  it("passes JSON remainder as structured args", async () => {
    const reg = createToolRegistry();
    let received: unknown;
    reg.register({
      name: "calc",
      execute: async (args) => {
        received = args;
        return { success: true, output: String(args), error: null };
      },
    });
    const exec = createToolExecutor(dummyExecutor(), reg);
    const res = await exec.execute({ type: "run", target: 'calc {"a":1}' });
    expect(res.success).toBe(true);
    expect(received).toEqual({ a: 1 });
  });

  it("passes non-JSON remainder as a raw string", async () => {
    const reg = createToolRegistry();
    let received: unknown;
    reg.register({
      name: "echo",
      execute: async (args) => {
        received = args;
        return { success: true, output: "ok", error: null };
      },
    });
    const exec = createToolExecutor(dummyExecutor(), reg);
    await exec.execute({ type: "run", target: "echo hello world" });
    expect(received).toBe("hello world");
  });

  it("falls back to the default executor when no tool matches", async () => {
    const reg = createToolRegistry();
    const exec = createToolExecutor(dummyExecutor(), reg);
    const res = await exec.execute({ type: "run", target: "ls" });
    expect(res.success).toBe(false);
    expect(res.error).toContain("default executor");
    expect(reg.listInvocations()).toHaveLength(0);
  });

  it("does not dispatch to tools for non-run actions", async () => {
    const reg = createToolRegistry();
    reg.register(makeTool("inspect_tool", { success: true, output: "x", error: null }));
    const exec = createToolExecutor(dummyExecutor(), reg);
    const res = await exec.execute({ type: "inspect", target: "a.ts" });
    expect(res.success).toBe(false);
    expect(reg.listInvocations()).toHaveLength(0);
  });

  it("normalizes a returned tool failure (does not silently succeed)", async () => {
    const reg = createToolRegistry();
    reg.register(makeTool("failing", { success: false, output: "", error: "boom", filesChanged: [] }));
    const exec = createToolExecutor(dummyExecutor(), reg);
    const res = await exec.execute({ type: "run", target: "failing" });
    expect(res.success).toBe(false);
    expect(res.error).toBe("boom");
    expect(reg.listInvocations()[0].success).toBe(false);
  });

  it("catches a throwing tool and records it as failure", async () => {
    const reg = createToolRegistry();
    reg.register({
      name: "thrower",
      execute: async () => {
        throw new Error("kaboom");
      },
    });
    const exec = createToolExecutor(dummyExecutor(), reg);
    const res = await exec.execute({ type: "run", target: "thrower" });
    expect(res.success).toBe(false);
    expect(res.error).toContain("kaboom");
    expect(reg.listInvocations()[0].success).toBe(false);
  });
});

describe("createToolExecutor with the default executor (local commands)", () => {
  it("preserves default executor behavior for non-tool commands", async () => {
    const reg = createToolRegistry();
    const exec = createToolExecutor(createExecutor(process.cwd()), reg);
    const res = await exec.execute({ type: "inspect", target: "package.json" });
    // The default executor inspects the file; success depends on file existing.
    expect(typeof res.success).toBe("boolean");
    expect(res.filesChanged).toBeDefined();
  });
});
