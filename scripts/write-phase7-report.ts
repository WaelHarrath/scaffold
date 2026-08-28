import * as fs from "node:fs";
import * as path from "node:path";
import type { Phase7Result } from "../benchmarks/phase7-runner.js";

const HARD_TASKS = ["MS2", "CF2", "RA2", "DC1"];

function mean(a: number[]): number {
  return a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;
}
function sd(a: number[]): number {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1));
}
function median(a: number[]): number {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

interface Paired {
  full: Phase7Result;
  r75: Phase7Result;
  readonly taskId: string;
  readonly rep: number;
}

function buildPairs(results: Phase7Result[]): Paired[] {
  const byKey = new Map<string, Phase7Result[]>();
  const groups = results.filter((r) => r.failureClass !== "infrastructure");
  for (const r of groups) {
    const k = `${r.taskId}|${r.rep}`;
    const arr = byKey.get(k) ?? [];
    arr.push(r);
    byKey.set(k, arr);
  }
  const pairs: Paired[] = [];
  for (const arr of byKey.values()) {
    const full = arr.find((r) => r.condition === "FULL_CONTROL");
    const r75 = arr.find((r) => r.condition === "RETRIEVAL_75");
    if (full && r75) pairs.push({ full, r75, taskId: full.taskId, rep: full.rep });
  }
  return pairs;
}

function mcnemar(b: number, c: number): { chiSq: number | null; pExact: number; note: string } {
  const n = b + c;
  if (n === 0) return { chiSq: null, pExact: 1, note: "no discordant pairs (b=c=0)" };
  // Exact binomial test on discordant pairs (two-sided), P(X>=max(b,c)) * 2
  const k = Math.max(b, c);
  const p = 0.5;
  let sum = 0;
  for (let x = k; x <= n; x++) sum += comb(n, x) * Math.pow(p, x) * Math.pow(p, n - x);
  const pExact = Math.min(1, 2 * sum);
  const chiSq = n < 30 ? null : Math.pow(Math.abs(b - c) - 1, 2) / n;
  const note = n < 30 ? "small discordant count; exact binomial used (chi-square continuity approx not reliable)" : "continuity-corrected chi-square";
  return { chiSq, pExact, note };
}
function comb(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1);
  return r;
}

function ciForDifference(pairs: Paired[]): { diff: number; lower: number; upper: number; se: number } {
  const n = pairs.length;
  let b = 0, c = 0;
  for (const p of pairs) {
    if (!p.full.success && p.r75.success) b++;
    if (p.full.success && !p.r75.success) c++;
  }
  const diff = (b - c) / n;
  // Paired-difference-of-proportions variance (standard formula using discordants)
  let se = 0;
  if (n > 0) {
    const varDiff = (b + c - Math.pow(b - c, 2) / n) / (n * n);
    se = Math.sqrt(Math.max(0, varDiff));
  }
  const z = 1.96;
  return { diff, lower: diff - z * se, upper: diff + z * se, se };
}

function statsOf(results: Phase7Result[], cond: string): Ph7Stats {
  const cr = results.filter((r) => r.condition === cond && r.failureClass !== "infrastructure");
  const succBin = cr.map((r) => (r.success ? 1 : 0));
  const succ = cr.filter((r) => r.success).length;
  const n = cr.length;
  return {
    n,
    count: succ,
    rate: n ? succ / n : 0,
    rateSD: sd(succBin),
    medianRate: median(succBin),
    meanCalls: mean(cr.map((r) => r.modelCalls)),
    meanTool: mean(cr.map((r) => r.toolCalls)),
    meanPrompt: mean(cr.map((r) => r.promptTokens)),
    meanRetr: mean(cr.map((r) => r.retrievalTokens)),
    meanTotal: mean(cr.map((r) => r.totalTokens)),
    meanLat: mean(cr.map((r) => r.executionTime)) / 1000,
    totalCalls: cr.reduce((s, r) => s + r.modelCalls, 0),
    totalTokens: cr.reduce((s, r) => s + r.totalTokens, 0),
    totalTime: cr.reduce((s, r) => s + r.executionTime, 0),
  };
}

interface Ph7Stats {
  n: number; count: number; rate: number; rateSD: number; medianRate: number;
  meanCalls: number; meanTool: number; meanPrompt: number; meanRetr: number;
  meanTotal: number; meanLat: number; totalCalls: number; totalTokens: number; totalTime: number;
}

export async function writeReport(results: Phase7Result[], orderLog: { rep: number; taskId: string; condOrder: [string, string] }[]): Promise<string> {
  const L: string[] = [];
  const pairs = buildPairs(results);
  const infra = results.filter((r) => r.failureClass === "infrastructure");
  const sFull = statsOf(results, "FULL_CONTROL");
  const sR75 = statsOf(results, "RETRIEVAL_75");

  // Discordant counts from pairs
  let b = 0, c = 0;
  for (const p of pairs) {
    if (!p.full.success && p.r75.success) b++;
    if (p.full.success && !p.r75.success) c++;
  }
  const mc = mcnemar(b, c);
  const ci = ciForDifference(pairs);

  // 1. Objective
  L.push("# Phase 7 Report: RETRIEVAL_75 Validation & Robustness");
  L.push("");
  L.push("## 1. Objective");
  L.push("");
  L.push("Determine whether RETRIEVAL_75 is a **stable** improvement over the existing FULL_CONTROL configuration, or whether the Phase 6 result (49% vs 47%) was another stochastic outlier. Runs ONLY the two conditions (FULL_CONTROL, RETRIEVAL_75) with paired analysis. No new cognitive mechanism; no redesign.");

  // 2. Phase 6 baseline
  L.push("");
  L.push("## 2. Phase 6 Baseline");
  L.push("");
  L.push("| Metric | FULL_CONTROL | RETRIEVAL_75 |");
  L.push("|---|---|---|");
  L.push("| Completion | 47.0% (47/100) | 49.0% (49/100) |");
  L.push("| Model calls (total) | 522 | 510 |");
  L.push("| Total tokens (total) | 164,747 | 160,480 |");
  L.push("| Avg latency | 5.0s | 4.7s |");
  L.push("| Regressions | — | 0 |");
  L.push("Phase 6 conclusion: SUPPORTED (FULL can be made cheaper via RETRIEVAL_75).");

  // 3. Experimental design
  L.push("");
  L.push("## 3. Experimental Design");
  L.push("");
  L.push("- Tasks: 20 (2 per each of 10 categories), unchanged, deterministic verification.");
  L.push("- Repetitions: 10 per condition (vs 5 in Phase 6) to reduce variance.");
  L.push("- Conditions: 2 — FULL_CONTROL, RETRIEVAL_75 (ONLY).");
  L.push("- Total executions: 20 x 10 x 2 = 400.");
  L.push("- **Paired design**: each (task, rep) is run under BOTH conditions, enabling paired conversions/regressions and McNemar.");
  L.push("- Balanced condition ordering: for each (rep, task), the two conditions run adjacently, order alternating by (rep + task-index) parity — never all-FULL-then-all-R75.");
  L.push("- Balanced task ordering: task order rotates by rep (offset = rep).");
  L.push("- Checkpoint/resume every 5 executions; results stored separately at benchmarks/results/phase7/.");
  L.push(`- Ordering explicitly recorded (${orderLog.length} task-blocks).`);

  // 4. Exact model configuration
  L.push("");
  L.push("## 4. Exact Model Configuration");
  L.push("");
  L.push("| Parameter | Value |");
  L.push("|---|---|");
  L.push("| Reasoning model | qwen3:4b-instruct (Ollama, localhost:11434) |");
  L.push("| Embedding model | all-minilm:latest (fixed) |");
  L.push("| Context window | 4096 tokens (num_ctx=4096, hard cap) |");
  L.push("| top-p | N/A (not exposed by adapter) |");
  L.push("| seed | N/A (not supported by adapter) |");

  // 5. Exact inference configuration
  L.push("");
  L.push("## 5. Exact Inference Configuration");
  L.push("");
  L.push("| Parameter | Value |");
  L.push("|---|---|");
  L.push(`| temperature | 0.1 |`);
  L.push(`| maxTokens (output limit / call) | 256 |`);
  L.push(`| maxActions | 20 |`);
  L.push(`| reservedOutput | 256 |`);
  L.push(`| inputBudget | 3840 |`);
  L.push(`| governorEnabled | true |`);
  L.push(`| FULL_CONTROL retrieval | top-3, 300-char slices |`);
  L.push(`| RETRIEVAL_75 retrieval | top-3, 225-char slices |`);

  // 6/7. Results
  L.push("");
  L.push("## 6. FULL_CONTROL Results");
  L.push("");
  L.push(formatStats("FULL_CONTROL", sFull));
  L.push("");
  L.push("## 7. RETRIEVAL_75 Results");
  L.push("");
  L.push(formatStats("RETRIEVAL_75", sR75));

  // 8/9. Paired conversions/regressions
  L.push("");
  L.push("## 8. Paired Conversions (FULL fails, RETRIEVAL_75 passes)");
  L.push("");
  L.push(`- Conversions (b): **${b}**`);
  if (b > 0) {
    const convTasks = pairs.filter((p) => !p.full.success && p.r75.success);
    L.push(`- Tasks: ${Array.from(new Set(convTasks.map((p) => p.taskId))).join(", ") || "none"}`);
  }
  L.push("");
  L.push("## 9. Paired Regressions (FULL passes, RETRIEVAL_75 fails)");
  L.push("");
  L.push(`- Regressions (c): **${c}**`);
  if (c > 0) {
    const regTasks = pairs.filter((p) => p.full.success && !p.r75.success);
    L.push(`- Tasks: ${Array.from(new Set(regTasks.map((p) => p.taskId))).join(", ") || "none"}`);
  }
  L.push(`- Net (b - c): **${b - c}**`);

  // 10. Statistical significance
  L.push("");
  L.push("## 10. Statistical Significance (McNemar)");
  L.push("");
  L.push(`- Discordant pairs: b=${b} (conversions), c=${c} (regressions); concordant=${pairs.length - b - c}; total pairs=${pairs.length}.`);
  L.push(`- Method: ${mc.note}.`);
  L.push(mc.chiSq !== null ? `- Continuity-corrected chi-square: ${mc.chiSq.toFixed(3)} (df=1; critical 3.841 at alpha=0.05).` : "- Chi-square: not applicable (small discordant count).");
  L.push(`- Exact McNemar two-sided p-value: **${mc.pExact.toFixed(4)}**`);
  L.push(mc.pExact < 0.05 ? "- Statistically significant asymmetry (p < 0.05)." : "- Not statistically significant at p < 0.05.");

  // 11. Confidence interval
  L.push("");
  L.push("## 11. Confidence Interval");
  L.push("");
  L.push(`- Difference in completion (RETRIEVAL_75 - FULL_CONTROL) = ${(ci.diff * 100).toFixed(1)}%.`);
  L.push(`- 95% CI (paired difference of proportions): [${(ci.lower * 100).toFixed(1)}%, ${(ci.upper * 100).toFixed(1)}%]; SE=${(ci.se * 100).toFixed(1)}%.`);
  L.push(ci.lower <= 0 && ci.upper >= 0 ? "- CI includes 0: the observed completion difference is not distinguishable from zero at 95% confidence." : "- CI excludes 0: completion difference is distinguishable from zero at 95% confidence.");

  // 12. Per-task results
  L.push("");
  L.push("## 12. Per-Task Results");
  L.push("");
  L.push("| Task | Cat | FULL n | FULL pass | R75 n | R75 pass | conv | reg | net |");
  L.push("|---|---|---|---|---|---|---|---|---|");
  const taskIds = Array.from(new Set(results.map((r) => r.taskId))).sort();
  for (const t of taskIds) {
    const f = results.filter((r) => r.taskId === t && r.condition === "FULL_CONTROL" && r.failureClass !== "infrastructure");
    const r75 = results.filter((r) => r.taskId === t && r.condition === "RETRIEVAL_75" && r.failureClass !== "infrastructure");
    const p = pairs.filter((x) => x.taskId === t);
    const conv = p.filter((x) => !x.full.success && x.r75.success).length;
    const reg = p.filter((x) => x.full.success && !x.r75.success).length;
    L.push(`| ${t} | ${f[0]?.category ?? ""} | ${f.length} | ${f.filter((r) => r.success).length} | ${r75.length} | ${r75.filter((r) => r.success).length} | ${conv} | ${reg} | ${conv - reg} |`);
  }

  // 13. Per-task variance
  L.push("");
  L.push("## 13. Per-Task Variance");
  L.push("");
  L.push("| Task | FULL rate | FULL sd | R75 rate | R75 sd |");
  L.push("|---|---|---|---|---|");
  for (const t of taskIds) {
    const f = results.filter((r) => r.taskId === t && r.condition === "FULL_CONTROL" && r.failureClass !== "infrastructure").map((r) => (r.success ? 1 : 0));
    const r75 = results.filter((r) => r.taskId === t && r.condition === "RETRIEVAL_75" && r.failureClass !== "infrastructure").map((r) => (r.success ? 1 : 0));
    L.push(`| ${t} | ${f.length ? (f.filter(Boolean).length / f.length * 100).toFixed(1) : "-"}% | ${sd(f).toFixed(2)} | ${r75.length ? (r75.filter(Boolean).length / r75.length * 100).toFixed(1) : "-"}% | ${sd(r75).toFixed(2)} |`);
  }

  // 14-17. Hard tasks
  L.push("");
  L.push("## 14. MS2 Analysis");
  L.push(hardTaskBlock(results, pairs, "MS2"));
  L.push("");
  L.push("## 15. CF2 Analysis");
  L.push(hardTaskBlock(results, pairs, "CF2"));
  L.push("");
  L.push("## 16. RA2 Analysis");
  L.push(hardTaskBlock(results, pairs, "RA2"));
  L.push("");
  L.push("## 17. DC1 Analysis");
  L.push(hardTaskBlock(results, pairs, "DC1"));

  // 18. Token efficiency
  L.push("");
  L.push("## 18. Token Efficiency");
  L.push("");
  L.push("| Metric | FULL_CONTROL | RETRIEVAL_75 |");
  L.push("|---|---|---|");
  L.push(`| Total tokens | ${sFull.totalTokens} | ${sR75.totalTokens} |`);
  L.push(`| Mean prompt tokens | ${sFull.meanPrompt.toFixed(0)} | ${sR75.meanPrompt.toFixed(0)} |`);
  L.push(`| Mean retrieval tokens | ${sFull.meanRetr.toFixed(0)} | ${sR75.meanRetr.toFixed(0)} |`);
  L.push(`| Success / 1000 tokens | ${(sFull.count / (sFull.totalTokens / 1000)).toFixed(3)} | ${(sR75.count / (sR75.totalTokens / 1000)).toFixed(3)} |`);

  // 19. Latency
  L.push("");
  L.push("## 19. Latency");
  L.push("");
  L.push(`| Metric | FULL_CONTROL | RETRIEVAL_75 |`);
  L.push("|---|---|---|");
  L.push(`| Mean latency | ${sFull.meanLat.toFixed(1)}s | ${sR75.meanLat.toFixed(1)}s |`);
  L.push(`| Total latency | ${(sFull.totalTime / 1000).toFixed(0)}s | ${(sR75.totalTime / 1000).toFixed(0)}s |`);
  L.push(`| Success / second | ${(sFull.count / (sFull.totalTime / 1000)).toFixed(3)} | ${(sR75.count / (sR75.totalTime / 1000)).toFixed(3)} |`);

  // 20. Model-call efficiency
  L.push("");
  L.push("## 20. Model-Call Efficiency");
  L.push("");
  L.push("| Metric | FULL_CONTROL | RETRIEVAL_75 |");
  L.push("|---|---|---|");
  L.push(`| Total model calls | ${sFull.totalCalls} | ${sR75.totalCalls} |`);
  L.push(`| Mean model calls | ${sFull.meanCalls.toFixed(2)} | ${sR75.meanCalls.toFixed(2)} |`);
  L.push(`| Mean tool calls | ${sFull.meanTool.toFixed(1)} | ${sR75.meanTool.toFixed(1)} |`);
  L.push(`| Success / model call | ${(sFull.count / sFull.totalCalls).toFixed(4)} | ${(sR75.count / sR75.totalCalls).toFixed(4)} |`);

  // 21. Failure traces
  L.push("");
  L.push("## 21. Failure Traces");
  L.push("");
  if (c === 0) {
    L.push("No regressions (RETRIEVAL_75 did not lose any task FULL_CONTROL solved). No divergence to trace on the regression side.");
  } else {
    L.push("Regressions to trace (FULL pass, RETRIEVAL_75 fail):");
    for (const p of pairs.filter((x) => x.full.success && !x.r75.success)) {
      L.push(`- ${p.taskId} rep${p.rep}: FULL calls=${p.full.modelCalls} seq=[${p.full.actionSequence.slice(0, 6).join("; ")}] ; R75 calls=${p.r75.modelCalls} class=${p.r75.failureClass} reason="${p.r75.reason.slice(0, 80)}" seq=[${p.r75.actionSequence.slice(0, 6).join("; ")}]`);
      L.push(`  R75 retrievalTokens=${p.r75.retrievalTokens} vs FULL ${p.full.retrievalTokens}`);
    }
  }

  // 22. Infrastructure failures
  L.push("");
  L.push("## 22. Infrastructure Failures");
  L.push("");
  L.push(`- Total infrastructure/run failures: ${infra.length} of ${results.length} executions (${((infra.length / Math.max(1, results.length)) * 100).toFixed(2)}%).`);
  L.push("- Infrastructure failures are classified separately and NEVER counted as model failure; they are excluded from paired/statistical analyses.");

  // 23. Reproducibility assessment
  L.push("");
  L.push("## 23. Reproducibility Assessment");
  L.push("");
  L.push(`- FULL_CONTROL: mean ${(sFull.rate * 100).toFixed(1)}%, median ${(sFull.medianRate * 100).toFixed(1)}%, sd ${sFull.rateSD.toFixed(3)}, min 0/1 max 1/1 (per-task binary).`);
  L.push(`- RETRIEVAL_75: mean ${(sR75.rate * 100).toFixed(1)}%, median ${(sR75.medianRate * 100).toFixed(1)}%, sd ${sR75.rateSD.toFixed(3)}.`);
  L.push("- Per-task variance reported in section 13; indicates whether the improvement is broad or driven by few tasks.");

  // 24. Limitations
  L.push("");
  L.push("## 24. Limitations");
  L.push("");
  L.push("- 400 executions total; qwen3:4b-instruct is stochastic with no seed support, so exact replication is not possible; only distributional replication.");
  L.push("- Token counts partially estimator-based (feedback/retrieval via ceil(len/4)); model tokens are Ollama-reported.");
  L.push("- Per-task binary success over n=10 gives coarse per-task rates; hard-task statistics are low-powered.");
  L.push("- Workspaces are ephemeral temp dirs; embedding time included in wall latency.");

  // 25. Final conclusion
  L.push("");
  L.push("## 25. Final Conclusion");
  L.push("");
  const pExact = mc.pExact;
  const efficiencyBetter = sR75.totalCalls < sFull.totalCalls && sR75.totalTokens <= sFull.totalTokens;
  let classification = "INCONCLUSIVE";
  if (infra.length > 0 && infra.length / results.length > 0.02) {
    classification = "INCONCLUSIVE";
  } else if (sR75.rate >= sFull.rate && c === 0 && (b > 0 || efficiencyBetter)) {
    // Consistently improves or preserves completion, no regressions, efficiency win
    classification = "SUPPORTED";
  } else if (sR75.rate >= sFull.rate && c > 0 && b >= c) {
    // Generally beneficial but with some task-specific regressions
    classification = "PARTIALLY SUPPORTED";
  } else if (sR75.rate < sFull.rate) {
    classification = "NOT SUPPORTED";
  } else if (sR75.rate === sFull.rate && b === 0 && c === 0) {
    // identical completion, no discordance, and no efficiency difference detected
    classification = "INCONCLUSIVE";
  }
  L.push(`- FULL_CONTROL: ${sFull.count}/${sFull.n} = ${(sFull.rate * 100).toFixed(1)}%.`);
  L.push(`- RETRIEVAL_75: ${sR75.count}/${sR75.n} = ${(sR75.rate * 100).toFixed(1)}%.`);
  L.push(`- Difference: ${((sR75.rate - sFull.rate) * 100).toFixed(1)}pp; conversions=${b}, regressions=${c}, net=${b - c}.`);
  L.push(`- McNemar exact p=${pExact.toFixed(4)}; 95% CI [${(ci.lower * 100).toFixed(1)}%, ${(ci.upper * 100).toFixed(1)}%].`);
  L.push("");
  L.push("**Is RETRIEVAL_75 a robust improvement over FULL_CONTROL?**");
  L.push("");
  L.push(`**CLASSIFICATION: ${classification}**`);
  L.push("");

  const reportPath = path.join(process.cwd(), "benchmarks", "PHASE7-REPORT.md");
  fs.writeFileSync(reportPath, L.join("\n"), "utf-8");
  return reportPath;
}

function formatStats(cond: string, s: Ph7Stats): string {
  return [
    `| Metric | ${cond} |`,
    "|---|---|",
    `| Executions | ${s.n} |`,
    `| Success count | ${s.count} |`,
    `| Completion rate | ${(s.rate * 100).toFixed(1)}% |`,
    `| Median completion (binary) | ${(s.medianRate * 100).toFixed(1)}% |`,
    `| Mean model calls | ${s.meanCalls.toFixed(2)} |`,
    `| Mean tool calls | ${s.meanTool.toFixed(1)} |`,
    `| Mean prompt tokens | ${s.meanPrompt.toFixed(0)} |`,
    `| Mean retrieval tokens | ${s.meanRetr.toFixed(0)} |`,
    `| Mean total tokens | ${s.meanTotal.toFixed(0)} |`,
    `| Mean latency | ${s.meanLat.toFixed(1)}s |`,
    `| Total tokens | ${s.totalTokens} |`,
    `| Total model calls | ${s.totalCalls} |`,
    "",
  ].join("\n");
}

function hardTaskBlock(results: Phase7Result[], pairs: Paired[], task: string): string {
  const f = results.filter((r) => r.taskId === task && r.condition === "FULL_CONTROL" && r.failureClass !== "infrastructure");
  const r75 = results.filter((r) => r.taskId === task && r.condition === "RETRIEVAL_75" && r.failureClass !== "infrastructure");
  const p = pairs.filter((x) => x.taskId === task);
  const conv = p.filter((x) => !x.full.success && x.r75.success).length;
  const reg = p.filter((x) => x.full.success && !x.r75.success).length;
  const fCalls = f.length ? mean(f.map((r) => r.modelCalls)).toFixed(1) : "-";
  const rCalls = r75.length ? mean(r75.map((r) => r.modelCalls)).toFixed(1) : "-";
  const fTok = f.length ? mean(f.map((r) => r.totalTokens)).toFixed(0) : "-";
  const rTok = r75.length ? mean(r75.map((r) => r.totalTokens)).toFixed(0) : "-";
  const fLat = f.length ? (mean(f.map((r) => r.executionTime)) / 1000).toFixed(1) : "-";
  const rLat = r75.length ? (mean(r75.map((r) => r.executionTime)) / 1000).toFixed(1) : "-";
  return [
    `- FULL_CONTROL success: ${f.filter((r) => r.success).length}/${f.length} (${f.length ? ((f.filter((r) => r.success).length / f.length) * 100).toFixed(1) : 0}%).`,
    `- RETRIEVAL_75 success: ${r75.filter((r) => r.success).length}/${r75.length} (${r75.length ? ((r75.filter((r) => r.success).length / r75.length) * 100).toFixed(1) : 0}%).`,
    `- Conversions: ${conv}; Regressions: ${reg}; Net: ${conv - reg}.`,
    `- Avg calls (FULL vs R75): ${fCalls} vs ${rCalls}`,
    `- Avg total tokens (FULL vs R75): ${fTok} vs ${rTok}`,
    `- Avg latency (FULL vs R75): ${fLat}s vs ${rLat}s`,
    `- Retrieval compression preserved causal benefit (Phase 5/6)? See per-task calls/tokens above.`,
    "",
  ].join("\n");
}
