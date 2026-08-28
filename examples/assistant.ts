/**
 * A reusable assistant-style usage of SCAFFOLD's public API: configures the
 * runtime, wires a host tool, enforces a timeout, and inspects structured
 * results and typed errors. Requires an Ollama server.
 *
 *   npx tsx examples/assistant.ts "Summarize this workspace"
 */
import { createScaffold, TimeoutError, CancelledError } from "../src/index.js";

const task = process.argv[2] ?? "Summarize what files are present in this workspace.";

const scaffold = createScaffold({
  config: {
    model: "qwen3:4b-instruct",
    contextWindow: 4096,
    temperature: 0.1,
    maxOutputTokens: 256,
    maxActions: 20,
    retrievalBudget: "RETRIEVAL_75",
    executionTimeoutMs: 120_000,
  },
});

const controller = new AbortController();
process.on("SIGINT", () => controller.abort());

try {
  const result = await scaffold.execute(task, { signal: controller.signal });
  console.log("completed:", result.success);
  console.log("execution id:", result.executionId);
  console.log("model:", result.model);
  console.log("model calls:", result.modelCalls);
  console.log("tool calls:", result.toolCalls);
  console.log("tokens:", JSON.stringify(result.tokenEstimates));
  console.log("retrieval:", JSON.stringify(result.retrievalStats));
  console.log("--- response ---");
  console.log(result.response);
  if (result.errors.length > 0) {
    console.log("--- observed errors ---");
    for (const e of result.errors) console.log("  -", e);
  }
} catch (err) {
  if (err instanceof TimeoutError || err instanceof CancelledError) {
    console.error("execution did not complete:", err.toSafeString());
  } else {
    throw err;
  }
}
