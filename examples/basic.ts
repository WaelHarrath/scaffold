/**
 * Minimal SCAFFOLD usage.
 *
 * Runs the runtime with frozen validated defaults (model qwen3:4b-instruct,
 * context window 4096). Requires an Ollama server at http://localhost:11434.
 *
 *   npx tsx examples/basic.ts
 */
import { createScaffold } from "../src/index.js";

const scaffold = createScaffold({
  config: {
    model: "qwen3:4b-instruct",
    contextWindow: 4096,
    maxActions: 20,
  },
});

const result = await scaffold.execute("Summarize the README.md in this workspace.");

console.log("success:", result.success);
console.log("reason:", result.response);
console.log("model calls:", result.modelCalls);
console.log("tool calls:", result.toolCalls);
console.log("tokens:", result.tokenEstimates.totalTokens);
console.log("duration ms:", result.durationMs);
console.log("termination:", result.terminationReason);
