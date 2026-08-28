import * as fs from "node:fs";
import * as path from "node:path";
import { runPhase8 } from "../benchmarks/phase8-parity-runner.js";
import { writePhase8Report } from "./write-phase8-report.js";

async function main() {
  const resultsDir = path.join(process.cwd(), "benchmarks", "results", "phase8");
  fs.mkdirSync(resultsDir, { recursive: true });

  console.log("========== PHASE 8 (PARITY) BENCHMARK ==========");
  console.log("Goal: empirical proof-of-parity - ADAPTIVE_HYBRID vs RETRIEVAL_75.");
  console.log("Hard constraints: qwen3:4b-instruct, 4096 context, deterministic retrieval-time-only policy.\n");

  const results = await runPhase8();

  fs.writeFileSync(path.join(resultsDir, "results.json"), JSON.stringify(results, null, 2), "utf-8");

  const reportPath = path.join(process.cwd(), "benchmarks", "PHASE8-REPORT.md");
  await writePhase8Report(results, reportPath);

  console.log(`\nResults saved to ${resultsDir}`);
  console.log(`Report saved to ${reportPath}`);
  console.log(`Total executions recorded: ${results.length}`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
