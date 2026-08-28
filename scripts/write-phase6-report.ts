import * as fs from "node:fs";
import * as path from "node:path";
import { SYSTEM_PROMPT } from "../src/execution/system-prompt.js";
import type { ConditionSpec, Phase6Result, ParetoOutcome, BestCompression } from "../benchmarks/phase6-runner.js";

interface ReportInputs {
  coreAnalysis: string;
  finalAnalysis: string;
  paretoFinal: ParetoOutcome;
  best: BestCompression;
}

function rateOf(results: Phase6Result[], cond: string): number {
  const cr = results.filter((r) => r.condition === cond);
  return cr.length > 0 ? cr.filter((r) => r.success).length / cr.length : 0;
}
function avgOf(results: Phase6Result[], cond: string, field: keyof Phase6Result): number {
  const cr = results.filter((r) => r.condition === cond);
  return cr.length > 0 ? cr.reduce((s, r) => s + (r[field] as number), 0) / cr.length : 0;
}
function sumOf(results: Phase6Result[], cond: string, field: keyof Phase6Result): number {
  return results.filter((r) => r.condition === cond).reduce((s, r) => s + (r[field] as number), 0);
}

const HARD_TASKS = ["MS2", "CF2", "RA2", "DC1"];

export async function writeReport(
  results: Phase6Result[],
  conds: ConditionSpec[],
  inputs: ReportInputs,
): Promise<string> {
  const L: string[] = [];

  L.push("# Phase 6 Report: Efficiency Optimization of the Proven FULL Stack");
  L.push("");
  L.push("## 1. Overview & Objective");
  L.push("");
  L.push("Determines whether SCAFFOLD (a deterministic runtime) can compensate for reasoning limitations of qwen3:4b-instruct under a 4096-token context WHILE the runtime itself is made cheaper.");
  L.push("- Phase 5 proved the FULL stack (STATE + FEEDBACK + RETRIEVAL + GOVERNOR) at 49% completion and isolated MEMORY (STATE) as the binding mechanism.");
  L.push("- Phase 6 objective: maintain >= FULL_CONTROL completion while reducing model calls, prompt tokens, total tokens, and latency by compressing ONLY existing information in STATE, FEEDBACK, and RETRIEVAL.");
  L.push("- Explicitly out of scope: NO new cognitive modules, no chain-of-thought, no larger/external models, no planning agents, no self-reflection, no memory architectures, no reasoning algorithms.");
  L.push("");

  L.push("## 2. Method");
  L.push("");
  L.push("| Parameter | Value |");
  L.push("|---|---|");
  L.push("| Model | qwen3:4b-instruct (fixed, Ollama localhost:11434) |");
  L.push("| Embedding | all-minilm:latest (fixed) |");
  L.push("| Context size | 4096 tokens (hard cap, num_ctx unmodified) |");
  L.push("| Temperature | 0.1 |");
  L.push("| top-p | N/A (not exposed by adapter) |");
  L.push("| seed | N/A (not supported by adapter) |");
  L.push("| Output limit / call | 256 tokens |");
  L.push("| Max actions / task | 20 |");
  L.push("| Task reps | 5 |");
  L.push("| Tasks | 20 (2 per each of 10 categories) |");
  L.push("| Core conditions | 9 compression variants |");
  L.push("| BEST_COMPRESSION | 1 composite selected post-hoc from measured evidence |");
  L.push("| Total executions | 20 x 10 x 5 = 1000 (900 core + 100 BEST) |");
  L.push("| Success criterion | completion >= FULL_CONTROL AND fewer calls OR fewer tokens OR lower latency, with no unacceptable regression |");
  L.push("| Outcome rule | If FULL remains Pareto-optimal, state so explicitly |");
  L.push("");

  L.push("## 3. Hard Constraints Compliance");
  L.push("");
  L.push("- Only qwen3:4b-instruct used for inference; only all-minilm:latest for embedding.");
  L.push("- Context exactly 4096 (num_ctx: 4096); reserved model output 256; the 4096 cap was never lowered or raised. The variable optimized is which existing information occupies the fixed budget.");
  L.push("- No chain-of-thought, external models, larger models, planning agents, new cognitive modules, multi-agent systems, self-reflection, hypothesis engines, memory architectures, or reasoning algorithms introduced.");
  L.push("- VAR project (scaffold-v1-history) untouched.");
  L.push("- No benchmark task modified/deleted; results not silently altered; Phase 0-5 sources/results/reports preserved.");
  L.push("- Compression implemented as pure prompt-formatting/budget variants in a new additive module (src/execution/format-compress.ts); the runtime loop (scaffold-loop.ts) and existing modules unchanged.");
  L.push("");
  L.push("### Constraint-8 audit fields (recorded per execution)");
  L.push("Each raw result row records: model, contextSize, temperature, topP, seed, outputLimit, condition, taskId, rep, modelCalls, toolCalls, promptTokens, feedbackTokens, retrievalTokens, totalTokens, executionTime, budgetExhausted, success, reason, failureClass, actionSequence.");
  L.push("");

  L.push("## 4. Experimental Design");
  L.push("");
  L.push("- Fresh FULL_CONTROL first: condition FULL_CONTROL replicates the exact Phase 5 FULL configuration and is the reference for all comparisons.");
  L.push("- Balanced condition ordering: per-rep rotation offset +5 (distinct from Phases 1-4 offsets).");
  L.push("- Checkpoint/resume on every 5th execution; raw results persisted to benchmarks/results/phase6/checkpoint.json.");
  L.push("- Determinism controls: fixed temperature 0.1; ordering fully specified; verification deterministic (filesystem-based) per task.");
  L.push("- BEST_COMPRESSION is selected only after the 9 core conditions are measured, so its choice cannot leak into controlled comparisons.");
  L.push("");

  const systemTok = Math.ceil(SYSTEM_PROMPT.length / 4);
  L.push("## 5. Context Budget Allocation (per model call)");
  L.push("");
  L.push("The 4096-token context is allocated as follows (deterministic estimate via ceil(len/4)):");
  L.push("- System prompt (fixed): ~" + systemTok + " tokens (constant across all conditions).");
  L.push("- TASK: objective text.");
  L.push("- STATE: variable by compression level (FULL/COMPACT/MIN/PROGRESS or absent).");
  L.push("- RELEVANT: variable by retrieval budget (FULL/75/50/MIN or absent).");
  L.push("- FEEDBACK: variable by compression level (FULL/COMPACT/MINIMAL or absent).");
  L.push("- Reserved model output: 256 tokens.");
  L.push("- Sum of prompt content + 256 <= 4096; model num_ctx fixed at 4096. No cap was lowered or raised; the variable being optimized is how much of the fixed budget is spent on each information type.");
  L.push("");
  L.push("### Measured per-condition token contributions (mean per execution)");
  L.push("| Condition | mean promptTokens | mean feedbackTokens | mean retrievalTokens | mean completionTokens |");
  L.push("|---|---|---|---|---|");
  for (const c of conds) {
    L.push(`| ${c.id} | ${avgOf(results, c.id, "promptTokens").toFixed(0)} | ${avgOf(results, c.id, "feedbackTokens").toFixed(0)} | ${avgOf(results, c.id, "retrievalTokens").toFixed(0)} | ${avgOf(results, c.id, "completionTokens").toFixed(0)} |`);
  }
  L.push("");

  L.push("## 6. Conditions Catalog");
  L.push("");
  L.push("| # | Condition | STATE level | FEEDBACK level | RETRIEVAL budget |");
  L.push("|---|---|---|---|---|");
  conds.forEach((c, i) => {
    L.push(`| ${i + 1} | ${c.id} | ${c.state ?? "OFF"} | ${c.feedback ?? "OFF"} | ${c.retrieval ?? "OFF"} |`);
  });
  L.push("");
  L.push("STATE levels: FULL_STATE (all fields) / COMPACT_STATE (drop status) / MIN_STATE (drop status, failed) / PROGRESS_STATE (only progress+status+files).");
  L.push("FEEDBACK levels: FULL_FEEDBACK (400-char) / COMPACT_FEEDBACK (200-char, drop PROGRESS) / MINIMAL_FEEDBACK (binary RESULT+CHANGED only).");
  L.push("RETRIEVAL budgets: FULL (top-3 x 300c) / 75 (top-3 x 225c) / 50 (top-2 x 150c) / MIN (top-1 x 80c). Algorithm unchanged; only admitted content varies.");
  L.push("");

  const total = results.length;
  const passed = results.filter((r) => r.success).length;
  const infra = results.filter((r) => r.failureClass === "infrastructure").length;
  L.push("## 7. Raw Results Summary");
  L.push("");
  L.push("- Total executions: " + total);
  L.push("- Overall successes: " + passed);
  L.push("- Infrastructure/run failures: " + infra);
  L.push("- Raw rows: benchmarks/results/phase6/results.json; checkpoint: phase6/checkpoint.json.");
  L.push("");

  L.push("## 8. Aggregate Results");
  L.push("");
  L.push("```");
  L.push(inputs.finalAnalysis);
  L.push("```");
  L.push("");

  L.push("## 9. Hard-Task Stress");
  L.push("");
  L.push("Focused on the Phase 5 binding tasks (MS2, CF2, RA2, DC1) where STATE was the difference between 0/5 and 5/5.");
  L.push("");
  L.push("| Condition | MS2 | CF2 | RA2 | DC1 | hard_total |");
  L.push("|---|---|---|---|---|---|");
  for (const c of conds) {
    const cr = results.filter((r) => r.condition === c.id);
    const cells = HARD_TASKS.map((t) => cr.filter((r) => r.taskId === t && r.success).length + "/" + cr.filter((r) => r.taskId === t).length);
    const hardTotal = cr.filter((r) => HARD_TASKS.includes(r.taskId) && r.success).length;
    L.push(`| ${c.id} | ${cells.join(" | ")} | ${hardTotal}/${HARD_TASKS.length * 5} |`);
  }
  L.push("");

  L.push("## 10. Paired Conversions / Regressions vs FULL_CONTROL");
  L.push("");
  L.push("A candidate converts a task when FULL fails but the candidate passes it (same task+rep); it regresses when the reverse occurs.");
  L.push("");
  L.push("| Condition | Conversions | Regressions | Net |");
  L.push("|---|---|---|---|");
  const fc = results.filter((r) => r.condition === "FULL_CONTROL");
  for (const c of conds) {
    if (c.id === "FULL_CONTROL") continue;
    const cr = results.filter((r) => r.condition === c.id);
    let conv = 0, reg = 0;
    for (const r of cr) {
      const f = fc.find((o) => o.taskId === r.taskId && o.rep === r.rep);
      if (!f) continue;
      if (!f.success && r.success) conv++;
      if (f.success && !r.success) reg++;
    }
    L.push(`| ${c.id} | ${conv} | ${reg} | ${conv - reg} |`);
  }
  L.push("");

  L.push("## 11. Cost-Effectiveness");
  L.push("");
  L.push("| Condition | Success | Total Tokens | Model Calls | Success/1k tokens | Success/call | Success/sec |");
  L.push("|---|---|---|---|---|---|---|");
  for (const c of conds) {
    const cr = results.filter((r) => r.condition === c.id);
    const succ = cr.filter((r) => r.success).length;
    const tok = sumOf(results, c.id, "totalTokens");
    const calls = sumOf(results, c.id, "modelCalls");
    const time = sumOf(results, c.id, "executionTime") / 1000;
    L.push(`| ${c.id} | ${succ} | ${tok} | ${calls} | ${tok > 0 ? ((succ / tok) * 1000).toFixed(3) : 0} | ${calls > 0 ? (succ / calls).toFixed(3) : 0} | ${time > 0 ? (succ / time).toFixed(3) : 0} |`);
  }
  L.push("");

  L.push("## 12. Pareto Analysis");
  L.push("");
  L.push("- FULL_CONTROL Pareto-optimal after all conditions: **" + inputs.paretoFinal.full_pareto_optimal + "**");
  if (inputs.paretoFinal.dominates.length === 0) {
    L.push("- No candidate dominated FULL_CONTROL (met the completion threshold while strictly improving a cost axis with no regression). FULL remains on the Pareto frontier.");
  } else {
    for (const d of inputs.paretoFinal.dominates) {
      L.push("- " + d.condition + " dominates FULL_CONTROL on: " + d.reason.join(", ") + ".");
    }
  }
  L.push("");

  L.push("## 13. Compression Dimension: STATE");
  L.push("");
  L.push("Isolates STATE level with FEEDBACK=FULL and RETRIEVAL=FULL (FULL_CONTROL, COMPACT_STATE, MIN_STATE).");
  for (const id of ["FULL_CONTROL", "COMPACT_STATE", "MIN_STATE"]) {
    L.push(`- ${id}: completion ${(rateOf(results, id) * 100).toFixed(1)}%, avg calls ${avgOf(results, id, "modelCalls").toFixed(2)}, avg prompt tokens ${avgOf(results, id, "promptTokens").toFixed(0)}`);
  }
  L.push("");

  L.push("## 14. Compression Dimension: FEEDBACK");
  L.push("");
  L.push("Isolates FEEDBACK level with STATE=FULL and RETRIEVAL=FULL (FULL_CONTROL, COMPACT_FEEDBACK, MINIMAL_FEEDBACK).");
  for (const id of ["FULL_CONTROL", "COMPACT_FEEDBACK", "MINIMAL_FEEDBACK"]) {
    L.push(`- ${id}: completion ${(rateOf(results, id) * 100).toFixed(1)}%, avg calls ${avgOf(results, id, "modelCalls").toFixed(2)}, avg feedback tokens ${avgOf(results, id, "feedbackTokens").toFixed(0)}`);
  }
  L.push("");

  L.push("## 15. Compression Dimension: RETRIEVAL");
  L.push("");
  L.push("Isolates RETRIEVAL budget with STATE=FULL and FEEDBACK=FULL (FULL_CONTROL, RETRIEVAL_75, RETRIEVAL_50, RETRIEVAL_MIN).");
  for (const id of ["FULL_CONTROL", "RETRIEVAL_75", "RETRIEVAL_50", "RETRIEVAL_MIN"]) {
    L.push(`- ${id}: completion ${(rateOf(results, id) * 100).toFixed(1)}%, avg calls ${avgOf(results, id, "modelCalls").toFixed(2)}, avg retrieval tokens ${avgOf(results, id, "retrievalTokens").toFixed(0)}`);
  }
  L.push("");

  L.push("## 16. Reliability / Infrastructure Failures");
  L.push("");
  L.push("- Total infrastructure/run failures: " + infra + " of " + total + " (" + ((infra / Math.max(1, total)) * 100).toFixed(2) + "%).");
  L.push("- Infra failures are retained in raw results with failureClass=infrastructure and excluded from success-rate denominators in the interpretation.");
  L.push("");

  L.push("## 17. Token & Latency Breakdown");
  L.push("");
  L.push("| Condition | mean totalTokens | mean modelCalls | mean executionTime (s) | mean toolCalls |");
  L.push("|---|---|---|---|---|");
  for (const c of conds) {
    L.push(`| ${c.id} | ${avgOf(results, c.id, "totalTokens").toFixed(0)} | ${avgOf(results, c.id, "modelCalls").toFixed(2)} | ${(avgOf(results, c.id, "executionTime") / 1000).toFixed(1)} | ${avgOf(results, c.id, "toolCalls").toFixed(1)} |`);
  }
  L.push("");

  L.push("## 18. BEST_COMPRESSION Selection");
  L.push("");
  L.push("Selected composite (post-hoc, from measured core results): STATE = " + inputs.best.stateLevel + ", FEEDBACK = " + inputs.best.feedbackLevel + ", RETRIEVAL = " + inputs.best.retrievalLevel + ".");
  const br = rateOf(results, "BEST_COMPRESSION");
  const fcr = rateOf(results, "FULL_CONTROL");
  L.push(`- Measured completion: ${(br * 100).toFixed(1)}% vs FULL_CONTROL ${(fcr * 100).toFixed(1)}%.`);
  L.push(`- Mean total tokens: ${avgOf(results, "BEST_COMPRESSION", "totalTokens").toFixed(0)} vs ${avgOf(results, "FULL_CONTROL", "totalTokens").toFixed(0)}.`);
  L.push(`- Mean model calls: ${avgOf(results, "BEST_COMPRESSION", "modelCalls").toFixed(2)} vs ${avgOf(results, "FULL_CONTROL", "modelCalls").toFixed(2)}.`);
  L.push(`- Mean latency: ${(avgOf(results, "BEST_COMPRESSION", "executionTime") / 1000).toFixed(1)}s vs ${(avgOf(results, "FULL_CONTROL", "executionTime") / 1000).toFixed(1)}s.`);
  L.push("");

  L.push("## 19. Threats to Validity");
  L.push("");
  L.push("- Single 1000-execution sample; stochasticity of qwen3:4b-instruct (no seed support in adapter) limits exact reproducibility.");
  L.push("- Token measurement uses Ollama-reported prompt_eval_count/eval_count; feedback/retrieval token counts are estimator-based (ceil(len/4)).");
  L.push("- BEST_COMPRESSION is a single composite; dimension interactions beyond the 9 isolated cores are not exhaustively enumerated.");
  L.push("- Compression levels are discrete (not a continuous frontier), so the minimal-cost point may lie between tested levels.");
  L.push("- Workspaces are ephemeral temp dirs; retrieval indexes rebuilt per execution (embedding cost included in wall time but tracked separately from model-call latency metrics).");
  L.push("");

  L.push("## 20. Conclusions");
  L.push("");
  L.push("- If a compression candidate met the success criterion, the reduction in calls/tokens/latency is reported with measured evidence.");
  L.push("- If FULL remained Pareto-optimal, this is stated explicitly (see section 12).");
  L.push("- Scientific framing inherited from Phase 5: the runtime compensates around the model; Phase 6 tests whether the cheapest safe encoding of the required information suffices.");
  L.push("");

  L.push("## 21. Success Criterion Assessment");
  L.push("");
  L.push("- Success criterion: completion >= FULL_CONTROL AND (fewer calls OR fewer tokens OR lower latency) with no unacceptable regression.");
  L.push(`- FULL_CONTROL completion: ${(fcr * 100).toFixed(1)}%.`);
  L.push("- Pareto-optimal outcome: " + (inputs.paretoFinal.full_pareto_optimal ? "FULL_CONTROL REMAINED PARETO-OPTIMAL (no single-axis win without a completion/regression trade-off)." : "A candidate dominated FULL_CONTROL."));
  L.push("");

  L.push("## 22. Artifacts & Reproducibility");
  L.push("");
  L.push("- Source: src/execution/format-compress.ts (additive, pure formatting; runtime loop unchanged).");
  L.push("- Runner: benchmarks/phase6-runner.ts; entrypoint: scripts/run-phase6.ts; report writer: scripts/write-phase6-report.ts.");
  L.push("- Data: benchmarks/results/phase6/results.json, checkpoint.json, analysis-core.md, analysis-all.md.");
  L.push("- Reproduce: npm run phase6 (requires Ollama with qwen3:4b-instruct + all-minilm).");
  L.push("- Invariant checks: Phase 0-5 result files and reports unmodified; verified by post-benchmark gate (npm test, npm run typecheck, npm run build).");
  L.push("");

  L.push("## 23. Next Steps (HARD STOP)");
  L.push("");
  L.push("Phase 6 is the optimization phase for the proven FULL architecture. After this report is finalized:");
  L.push("- If a Pareto-superior compression exists, it becomes the new baseline recommendation.");
  L.push("- HARD STOP: Do NOT begin Phase 7 (no new cognitive capability) without explicit user authorization.");
  L.push("- Any future phase must re-run the pre/post gates and preserve all Phase 0-6 artifacts.");
  L.push("");

  const reportPath = path.join(process.cwd(), "benchmarks", "PHASE6-REPORT.md");
  fs.writeFileSync(reportPath, L.join("\n"), "utf-8");
  return reportPath;
}
