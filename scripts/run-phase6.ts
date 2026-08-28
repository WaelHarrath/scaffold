import * as fs from "node:fs";
import * as path from "node:path";
import {
  runPhase6,
  analyzePhase6,
  paretoAnalysis,
  selectBestCompression,
  CORE_CONDITIONS,
  type ConditionSpec,
  type Phase6Result,
} from "../benchmarks/phase6-runner.js";
import { writeReport } from "./write-phase6-report.js";

async function main() {
  const resultsDir = path.join(process.cwd(), "benchmarks", "results", "phase6");

  console.log("========== PHASE 6 BENCHMARK ==========");
  console.log("Goal: optimize efficiency of the proven FULL stack.");
  console.log("Hard constraints: qwen3:4b-instruct, 4096 context, NO new cognitive mechanism.\n");

  // ── Pass 1: run the 9 core conditions ─────────────────────────────────────
  console.log(">>> PASS 1: CORE CONDITIONS (9)");
  const resultsAfterCore = await runPhase6(CORE_CONDITIONS);

  // ── Analyze core, Pareto ──────────────────────────────────────────────────
  const coreAnalysis = analyzePhase6(resultsAfterCore, CORE_CONDITIONS);
  const paretoAfterCore = paretoAnalysis(resultsAfterCore, CORE_CONDITIONS);
  console.log("\n=== Pareto after core conditions ===");
  console.log(`Full control Pareto-optimal: ${paretoAfterCore.full_pareto_optimal}`);
  for (const d of paretoAfterCore.dominates) {
    console.log(`  ${d.condition} dominates: ${d.reason.join(", ")}`);
  }

  // ── Select BEST_COMPRESSION from measured evidence ────────────────────────
  console.log("\n>>> Selecting BEST_COMPRESSION from measured results...");
  const best = selectBestCompression(resultsAfterCore);
  console.log(`Selected BEST_COMPRESSION = STATE:${best.stateLevel} + FEEDBACK:${best.feedbackLevel} + RETRIEVAL:${best.retrievalLevel}`);
  const bestSpec: ConditionSpec = {
    id: "BEST_COMPRESSION",
    state: best.stateLevel,
    feedback: best.feedbackLevel,
    retrieval: best.retrievalLevel,
  };

  // ── Pass 2: run the BEST_COMPRESSION composite ────────────────────────────
  console.log("\n>>> PASS 2: BEST_COMPRESSION composite");
  const allResults = await runPhase6([bestSpec]);

  // ── Final analysis over ALL conditions ────────────────────────────────────
  const allConds: ConditionSpec[] = [...CORE_CONDITIONS, bestSpec];
  const finalAnalysis = analyzePhase6(allResults, allConds);
  const paretoFinal = paretoAnalysis(allResults, allConds);

  fs.mkdirSync(resultsDir, { recursive: true });
  fs.writeFileSync(path.join(resultsDir, "results.json"), JSON.stringify(allResults, null, 2), "utf-8");
  fs.writeFileSync(path.join(resultsDir, "analysis-core.md"), coreAnalysis, "utf-8");
  fs.writeFileSync(path.join(resultsDir, "analysis-all.md"), finalAnalysis, "utf-8");

  const reportPath = await writeReport(allResults, allConds, { coreAnalysis, finalAnalysis, paretoFinal, best });

  console.log(`\nResults saved to ${resultsDir}`);
  console.log(`Report saved to ${reportPath}`);
  console.log(`\nTotal executions recorded: ${allResults.length}`);
  console.log(`FULL_CONTROL remained Pareto-optimal: ${paretoFinal.full_pareto_optimal}`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
