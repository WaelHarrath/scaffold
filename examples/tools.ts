/**
 * Registering generic, domain-agnostic tools.
 *
 * Tools are dispatched through the model's generic `run` action. If the first
 * token of the run command matches a registered tool name, the tool is invoked
 * instead of a shell command. Requires an Ollama server and the registered
 * tools being exercised by the task.
 *
 *   npx tsx examples/tools.ts
 */
import { createScaffold, ToolError } from "../src/index.js";

const scaffold = createScaffold({
  config: {
    model: "qwen3:4b-instruct",
    contextWindow: 4096,
    maxActions: 20,
    retrievalEnabled: false,
  },
});

// A simple calculator tool (host-supplied, domain-agnostic).
scaffold.registerTool({
  name: "calc",
  description: "Evaluate an arithmetic expression.",
  execute: async (input) => {
    const expr = String((input as { expr?: unknown } | string | undefined) !== undefined
      ? ((input as { expr?: unknown }).expr ?? input)
      : input);
    try {
      const value = Function(`"use strict"; return (${expr});`)();
      return { success: true, output: String(value), data: value, error: null };
    } catch {
      return { success: false, output: "", error: `cannot evaluate: ${expr}`, filesChanged: [] };
    }
  },
});

// A directory-listing tool that avoids shelling out.
scaffold.registerTool({
  name: "list_dir",
  description: "List entries in a directory.",
  execute: async (input) => {
    try {
      const { readdirSync } = await import("node:fs");
      const dir = (input as { path?: string }).path ?? ".";
      const entries = readdirSync(dir);
      return { success: true, output: entries.join("\n"), data: entries, error: null };
    } catch (err) {
      return { success: false, output: "", error: String(err), filesChanged: [] };
    }
  },
});

try {
  const result = await scaffold.execute("List the current directory, then compute 6 * 7.");
  console.log("success:", result.success);
  console.log("actions:", result.actions);
  console.log("tool executions:", result.toolExecutions);
  console.log("errors:", result.errors);
} catch (err) {
  if (err instanceof ToolError) {
    console.error("tool registration failed:", err.toSafeString());
  } else {
    throw err;
  }
}
