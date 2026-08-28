import * as fs from "node:fs";
import * as path from "node:path";
import { runPhase7 } from "../benchmarks/phase7-runner.js";
import { writeReport } from "./write-phase7-report.js";

async function main() {
  const resultsDir = path.join(process.cwd(), "benchmarks", "results", "phase7");
  fs.mkdirSync(resultsDir, { recursive: true });

  console.log("========== PHASE 7 BENCHMARK ==========");
  console.log("Goal: validate whether RETRIEVAL_75 is a robust, reproducible improvement over FULL_CONTROL.");
  console.log("Hard constraints: qwen3:4b-instruct, 4096 context, ONLY FULL_CONTROL vs RETRIEVAL_75, no new mechanism.\n");

  const results = await runPhase7();

  fs.writeFileSync(path.join(resultsDir, "results.json"), JSON.stringify(results, null, 2), "utf-8");

  // Ordering is recorded in the same dir as checkpoint; pass to report writer
  let orderLog: { rep: number; taskId: string; condOrder: [string, string] }[] = [];
  try {
    const cp = JSON.parse(fs.readFileSync(path.join(resultsDir, "checkpoint.json"), "utf-8"));
    orderLog = cp.orderLog ?? [];
  } catch {
    // ignore
  }
  fs.writeFileSync(path.join(resultsDir, "order-log.json"), JSON.stringify(orderLog, null, 2), "utf-8");

  const reportPath = await writeReport(results, orderLog);

  console.log(`\nResults saved to ${resultsDir}`);
  console.log(`Report saved to ${reportPath}`);
  console.log(`Total executions recorded: ${results.length}`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
