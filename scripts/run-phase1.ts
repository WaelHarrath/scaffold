import { runPhase1, analyzeResults } from "../benchmarks/phase1-runner.js";
import * as fs from "node:fs";
import * as path from "node:path";

async function main() {
  console.log("Starting Phase 1 benchmark...");
  console.log("Model: qwen3:4b-instruct");
  console.log("Context: 4096 tokens");
  console.log("Conditions: MODEL_ONLY, MINIMAL, RETRIEVAL, FULL");
  console.log("Tasks: 20 (2 per category × 10 categories)");
  console.log("Reps: 5");
  console.log("Total executions: 400\n");

  const results = await runPhase1();

  const analysis = analyzeResults(results);
  const reportDir = path.join(process.cwd(), "benchmarks", "results", "phase1");
  fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(path.join(reportDir, "analysis.md"), analysis, "utf-8");
  fs.writeFileSync(path.join(reportDir, "results.json"), JSON.stringify(results, null, 2), "utf-8");

  console.log(`\nResults saved to ${reportDir}`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
