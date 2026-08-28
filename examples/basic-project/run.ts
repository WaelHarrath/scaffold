/**
 * Generic SCAFFOLD integration example.
 *
 * Runs a small task against `sample-workspace/` using the SCAFFOLD public API
 * (`createScaffold` + `scaffold.run`). Uses stub reasoning/embedding models so
 * this example runs withOUT Ollama and withOUT any secrets or network calls.
 *
 * The task is generic (summarize a short to-do list) — it is not a benchmark
 * task and involves no domain-specific terms.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createScaffold,
  type ReasoningModel,
  type EmbeddingModel,
  type ModelResponse,
} from "../../src/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspace = path.join(__dirname, "sample-workspace");

/**
 * Minimal stub reasoning model: performs a scripted action sequence, then
 * signals completion. Replace with the real Ollama-backed adapter for a live
 * run (see the example README).
 */
class StubReasoningModel implements ReasoningModel {
  readonly modelId = "stub-reasoner";

  private readonly sequence = [
    "inspect src/todo.txt",
    "inspect docs/notes.md",
    "finish summarized the to-do list",
  ];

  private step = 0;

  async generate(): Promise<ModelResponse> {
    const content = this.sequence[this.step] ?? "finish done";
    this.step++;
    return { content, usage: { promptTokens: 12, completionTokens: 4, totalTokens: 16 } };
  }
}

/** Minimal deterministic embedding stub (no real vectors needed here). */
class StubEmbeddingModel implements EmbeddingModel {
  readonly modelId = "stub-embedder";
  async embed(): Promise<number[]> {
    return [0.25, 0.5, 0.75];
  }
  async embedBatch(): Promise<number[][]> {
    return [[0.25, 0.5, 0.75]];
  }
}

async function main(): Promise<void> {
  const scaffold = createScaffold({
    config: {
      workingDirectory: workspace,
      retrievalEnabled: false,
      maxActions: 6,
      maxOutputTokens: 128,
    },
    model: new StubReasoningModel(),
    embeddingModel: new StubEmbeddingModel(),
  });

  console.log(`SCAFFOLD model: ${scaffold.config.model}`);
  console.log(`Context window: ${scaffold.config.contextWindow} tokens`);
  console.log(`Workspace: ${workspace}`);

  const result = await scaffold.run("Summarize the outstanding to-do items in the workspace.");

  console.log("\n--- Result ---");
  console.log(`success: ${result.success}`);
  console.log(`terminationReason: ${result.terminationReason}`);
  console.log(`modelCalls: ${result.modelCalls}`);
  console.log(`toolCalls: ${result.toolCalls}`);
  console.log(`totalTokens: ${result.tokenEstimates.totalTokens}`);
  console.log(`response: ${result.response}`);
  console.log(`actions: ${result.actions.join(", ")}`);

  const leftover = fs.existsSync(path.join(workspace, "src", "todo-summary.txt"));
  console.log(`\nA generated summary file exists in the workspace: ${leftover}`);
}

main().catch((err) => {
  console.error("example failed:", err);
  process.exitCode = 1;
});
