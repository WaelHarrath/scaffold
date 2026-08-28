import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { TASKS } from "../src/benchmark/tasks.js";
import { Qwen3Adapter } from "../src/model/qwen3.js";
import { MiniLMAdapter } from "../src/model/embedding.js";
import { EmbeddingCache } from "../src/retrieval/embedding-cache.js";
import { SemanticRetriever, type RetrievalItem } from "../src/retrieval/retriever.js";
import { createExecutor } from "../src/execution/executor.js";
import { createGovernorState } from "../src/execution/governor.js";
import { runScaffoldLoop, type ScaffoldDeps } from "../src/execution/scaffold-loop.js";
import { SYSTEM_PROMPT } from "../src/execution/system-prompt.js";
import {
  formatModelOnlyPrompt,
  formatFeedbackOnlyPrompt,
  formatRetrievalOnlyPrompt,
  formatFeedbackRetrievalPrompt,
  formatFullPrompt,
} from "../src/execution/format-prompt.js";
import { estimateTokens } from "../src/context/context-budget.js";
import type { TaskDefinition } from "../src/benchmark/types.js";

// ─── Extended result type ────────────────────────────────────────────────────

export interface Phase4Result {
  readonly taskId: string;
  readonly category: string;
  readonly success: boolean;
  readonly reason: string;
  readonly modelCalls: number;
  readonly toolCalls: number;
  readonly successfulToolCalls: number;
  readonly rejectedActions: number;
  readonly duplicateActions: number;
  readonly noopActions: number;
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly totalTokens: number;
  readonly feedbackTokens: number;
  readonly retrievalTokens: number;
  readonly retrievalCalls: number;
  readonly executionTime: number;
  readonly condition: string;
  readonly rep: number;
  readonly budgetExhausted: boolean;
  readonly failureClass: string;
  readonly actionSequence: string[];
}

// ─── Configuration ───────────────────────────────────────────────────────────

const SELECTED_IDS = [
  "ST1", "ST2", "MS1", "MS2", "ER1", "ER2",
  "TO1", "TO2", "CP1", "CP2", "CF1", "CF2",
  "AS1", "AS2", "CV1", "CV2", "RA1", "RA2",
  "DC1", "DC2",
] as const;

const CONDITIONS = [
  "MODEL_ONLY",             // A
  "FEEDBACK_ONLY",          // B
  "RETRIEVAL_ONLY",         // C
  "FEEDBACK_RETRIEVAL",     // D
  "FEEDBACK_GOVERNOR",      // E
  "RETRIEVAL_GOVERNOR",     // F
  "FEEDBACK_RETRIEVAL_GOV", // G
  "FULL",                   // H
] as const;

const REPS = 5;

const INFERENCE_PARAMS = {
  modelId: "qwen3:4b-instruct",
  temperature: 0.1,
  maxTokens: 256,
  maxActions: 20,
  contextSize: 4096,
  reservedOutput: 256,
  inputBudget: 3840,
} as const;

// Predefined Minimal Effective Stack criterion (defined BEFORE results are seen)
const MINIMAL_STACK_CRITERIA = {
  minSuccessRatioOfFull: 0.90, // >= 90% of FULL's success rate
  minResourceReduction: 0.20,  // >= 20% reduction in total tokens OR model calls
  candidates: [
    "FEEDBACK_ONLY",
    "RETRIEVAL_ONLY",
    "FEEDBACK_RETRIEVAL",
    "FEEDBACK_GOVERNOR",
    "RETRIEVAL_GOVERNOR",
  ] as const,
};

// ─── Balanced condition ordering ─────────────────────────────────────────────

function balancedOrdering(reps: number, numConditions: number): string[][] {
  const base = [...CONDITIONS];
  const orders: string[][] = [];
  for (let r = 0; r < reps; r++) {
    const offset = (r + 4) % numConditions; // distinct offset vs Phase 1/2/3
    const order = [...base.slice(offset), ...base.slice(0, offset)];
    orders.push(order);
  }
  return orders;
}

// ─── File reading for retrieval ───────────────────────────────────────────────

function readFilesInDir(dir: string): RetrievalItem[] {
  const items: RetrievalItem[] = [];
  try {
    const entries = fs.readdirSync(dir, { recursive: true, withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile()) {
        const parentPath = (entry as { parentPath?: string; path?: string }).parentPath
          ?? (entry as { path?: string }).path
          ?? "";
        const fullPath = path.join(parentPath, entry.name);
        try {
          const content = fs.readFileSync(fullPath, "utf-8");
          const rel = path.relative(dir, fullPath);
          items.push({ id: rel, content: content.slice(0, 2000) });
        } catch {
          // skip unreadable
        }
      }
    }
  } catch {
    // ignore scan errors
  }
  return items;
}

function buildRetriever(workingDir: string, metricSink: () => void) {
  const embeddingModel = new MiniLMAdapter();
  const cache = new EmbeddingCache(500);
  const retriever = new SemanticRetriever(embeddingModel, cache);
  let cachedItems: RetrievalItem[] | null = null;

  return {
    retrieve: async (state: { task: string; lastAction: string; currentGoal: string }, _observation: string | null) => {
      metricSink();
      if (!cachedItems) cachedItems = readFilesInDir(workingDir);
      if (cachedItems.length === 0) return { text: "", tokens: 0 };
      const query = `${state.task} ${state.lastAction ?? ""} ${state.currentGoal ?? ""}`.slice(0, 500);
      const results = await retriever.retrieve(query, cachedItems, 3);
      const parts: string[] = [];
      for (const r of results) {
        const item = cachedItems.find((i) => i.id === r.id);
        if (item) parts.push(`[${r.id}] ${item.content.slice(0, 300)}`);
      }
      return { text: parts.join("\n"), tokens: estimateTokens(parts.join("\n")) };
    },
  };
}

// ─── Condition builders ──────────────────────────────────────────────────────

interface BuiltDeps {
  deps: ScaffoldDeps;
  retrievalCalls: () => number;
}

function buildDeps(condition: string, workingDir: string): BuiltDeps {
  const model = new Qwen3Adapter(INFERENCE_PARAMS.contextSize);
  const executor = createExecutor(workingDir);
  const governor = createGovernorState();
  let retrievalCallCount = 0;
  const retriever = buildRetriever(workingDir, () => { retrievalCallCount++; });

  const base = (formatPrompt: ScaffoldDeps["formatPrompt"], gov: boolean, useRetr: boolean): BuiltDeps => ({
    deps: {
      model: model as any,
      executor,
      governor,
      systemPrompt: SYSTEM_PROMPT,
      formatPrompt,
      ...(useRetr ? { retrieve: retriever.retrieve } : {}),
    },
    retrievalCalls: () => retrievalCallCount,
  });

  switch (condition) {
    case "MODEL_ONLY":
      return base((state, feedback) => formatModelOnlyPrompt(state, feedback), false, false);
    case "FEEDBACK_ONLY":
      return base((state, feedback) => formatFeedbackOnlyPrompt(state, feedback), false, false);
    case "RETRIEVAL_ONLY":
      return base((state, feedback, retrieved) => formatRetrievalOnlyPrompt(state, feedback, retrieved ?? ""), false, true);
    case "FEEDBACK_RETRIEVAL":
      return base((state, feedback, retrieved) => formatFeedbackRetrievalPrompt(state, feedback, retrieved ?? ""), false, true);
    case "FEEDBACK_GOVERNOR":
      return base((state, feedback) => formatFeedbackOnlyPrompt(state, feedback), true, false);
    case "RETRIEVAL_GOVERNOR":
      return base((state, feedback, retrieved) => formatRetrievalOnlyPrompt(state, feedback, retrieved ?? ""), true, true);
    case "FEEDBACK_RETRIEVAL_GOV":
      return base((state, feedback, retrieved) => formatFeedbackRetrievalPrompt(state, feedback, retrieved ?? ""), true, true);
    case "FULL":
      return base((state, feedback, retrieved) => formatFullPrompt(state, feedback, retrieved ?? ""), true, true);
    default:
      throw new Error(`Unknown condition: ${condition}`);
  }
}

// ─── Workspace management ────────────────────────────────────────────────────

function setupWorkspace(task: TaskDefinition): string {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "scaffold-phase4-"));
  for (const file of task.workspace) {
    const filePath = path.join(workspaceDir, file.path);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, file.content, "utf-8");
  }
  return workspaceDir;
}

function cleanupWorkspace(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 2 });
  } catch {
    // best-effort
  }
}

function collectActions(state: import("../src/state/state.js").TaskState) {
  return state.attemptedActions.map((a) => {
    const parts = a.split(" ");
    return {
      success: !state.failedActions.includes(a),
      actionType: parts[0] ?? "unknown",
      target: parts.slice(1).join(" ") || undefined,
    };
  });
}

// ─── Failure classification ──────────────────────────────────────────────────

function classifyFailure(reason: string, modelCalls: number, maxActions: number): string {
  if (reason.startsWith("INFRASTRUCTURE:")) return "infrastructure";
  if (reason.includes("exhausted")) return "budget_exhaustion";
  if (reason.includes("duplicate")) return "repeated_action";
  if (reason.includes("could not parse")) return "action_parse_failure";
  if (modelCalls >= maxActions) return "budget_exhaustion";
  return "reasoning_failure";
}

// ─── Checkpoint ──────────────────────────────────────────────────────────────

interface Checkpoint {
  results: Phase4Result[];
  completedKeys: string[];
}

function saveCheckpoint(checkpoint: Checkpoint, dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "checkpoint.json"), JSON.stringify(checkpoint, null, 2), "utf-8");
}

function loadCheckpoint(dir: string): Checkpoint | null {
  const p = path.join(dir, "checkpoint.json");
  try {
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, "utf-8")) as Checkpoint;
    }
  } catch {
    // corrupt
  }
  return null;
}

// ─── Main runner ─────────────────────────────────────────────────────────────

export async function runPhase4(): Promise<Phase4Result[]> {
  const selectedTasks = TASKS.filter((t) => (SELECTED_IDS as readonly string[]).includes(t.id));
  const orders = balancedOrdering(REPS, CONDITIONS.length);

  console.log(`\n=== PHASE 4: EFFICIENCY OPTIMIZATION & MINIMAL EFFECTIVE STACK ===`);
  console.log(`Model: ${INFERENCE_PARAMS.modelId}`);
  console.log(`Context: ${INFERENCE_PARAMS.contextSize} tokens`);
  console.log(`Temperature: ${INFERENCE_PARAMS.temperature}`);
  console.log(`Max tokens per call: ${INFERENCE_PARAMS.maxTokens}`);
  console.log(`Max actions per task: ${INFERENCE_PARAMS.maxActions}`);
  console.log(`Tasks: ${selectedTasks.length}`);
  console.log(`Conditions: ${CONDITIONS.length}`);
  console.log(`Repetitions: ${REPS}`);
  console.log(`Total executions: ${selectedTasks.length * CONDITIONS.length * REPS}`);
  console.log(`Minimal-stack criterion: >=${MINIMAL_STACK_CRITERIA.minSuccessRatioOfFull * 100}% of FULL success AND >=${MINIMAL_STACK_CRITERIA.minResourceReduction * 100}% reduction in tokens OR calls`);

  const resultsDir = path.join(process.cwd(), "benchmarks", "results", "phase4");
  const checkpoint = loadCheckpoint(resultsDir) ?? { results: [], completedKeys: [] };
  const completedKeys = new Set(checkpoint.completedKeys);

  const results: Phase4Result[] = [...checkpoint.results];
  let executed = 0;
  let succeeded = 0;

  for (let rep = 0; rep < REPS; rep++) {
    const order = orders[rep]!;
    console.log(`\n--- Rep ${rep} (order: ${order.join(" -> ")}) ---`);

    for (const task of selectedTasks) {
      for (const condition of order) {
        const key = `${task.id}|${condition}|${rep}`;
        if (completedKeys.has(key)) {
          console.log(`  SKIP ${task.id} ${condition} rep${rep} (checkpoint)`);
          continue;
        }

        const startTime = Date.now();
        process.stdout.write(`  ${task.id} ${condition} rep${rep}... `);

        const workspaceDir = setupWorkspace(task);
        try {
          const { deps, retrievalCalls } = buildDeps(condition, workspaceDir);
          const loopResult = await runScaffoldLoop(task.objective, deps, {
            maxActions: INFERENCE_PARAMS.maxActions,
            temperature: INFERENCE_PARAMS.temperature,
            maxTokens: INFERENCE_PARAMS.maxTokens,
            governorEnabled: deps.governorEnabled,
          });

          const actions = collectActions(loopResult.state);
          const verification = task.verify(workspaceDir, actions);

          const budgetExhausted = loopResult.modelCalls >= INFERENCE_PARAMS.maxActions && !verification.success;
          const failureClass = verification.success
            ? "success"
            : classifyFailure(verification.reason, loopResult.modelCalls, INFERENCE_PARAMS.maxActions);

          const result: Phase4Result = {
            taskId: task.id,
            category: task.category,
            success: verification.success,
            reason: verification.reason,
            modelCalls: loopResult.modelCalls,
            toolCalls: loopResult.toolCalls,
            successfulToolCalls: loopResult.successfulToolCalls,
            rejectedActions: loopResult.rejectedActions,
            duplicateActions: loopResult.duplicateActions,
            noopActions: loopResult.noopActions,
            promptTokens: loopResult.promptTokens,
            completionTokens: loopResult.completionTokens,
            totalTokens: loopResult.totalTokens,
            feedbackTokens: loopResult.feedbackTokens,
            retrievalTokens: loopResult.retrievalTokens,
            retrievalCalls: retrievalCalls(),
            executionTime: loopResult.executionTime,
            condition,
            rep,
            budgetExhausted,
            failureClass,
            actionSequence: loopResult.state.attemptedActions,
          };

          results.push(result);
          completedKeys.add(key);
          executed++;
          if (verification.success) succeeded++;

          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          const status = verification.success ? "PASS" : "FAIL";
          console.log(`${status} (${elapsed}s, ${loopResult.modelCalls} calls, ${loopResult.totalTokens} tok)`);

          if (executed % 5 === 0) {
            saveCheckpoint({ results, completedKeys: [...completedKeys] }, resultsDir);
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.log(`ERROR: ${msg}`);
          const result: Phase4Result = {
            taskId: task.id,
            category: task.category,
            success: false,
            reason: `INFRASTRUCTURE: ${msg}`,
            modelCalls: 0,
            toolCalls: 0,
            successfulToolCalls: 0,
            rejectedActions: 0,
            duplicateActions: 0,
            noopActions: 0,
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
            feedbackTokens: 0,
            retrievalTokens: 0,
            retrievalCalls: 0,
            executionTime: Date.now() - startTime,
            condition,
            rep,
            budgetExhausted: false,
            failureClass: "infrastructure",
            actionSequence: [],
          };
          results.push(result);
          completedKeys.add(key);
          executed++;
        } finally {
          cleanupWorkspace(workspaceDir);
        }
      }
    }
  }

  saveCheckpoint({ results, completedKeys: [...completedKeys] }, resultsDir);

  console.log(`\n=== PHASE 4 COMPLETE ===`);
  console.log(`Executed: ${executed}`);
  console.log(`Succeeded: ${succeeded} (${((succeeded / executed) * 100).toFixed(1)}%)`);
  return results;
}

// ─── Analysis ────────────────────────────────────────────────────────────────

function rateOf(results: Phase4Result[], condition: string): number {
  const cr = results.filter((r) => r.condition === condition);
  return cr.length > 0 ? cr.filter((r) => r.success).length / cr.length : 0;
}

function sumOf(results: Phase4Result[], condition: string, field: keyof Phase4Result): number {
  return results.filter((r) => r.condition === condition).reduce((s, r) => s + (r[field] as number), 0);
}

function avgOf(results: Phase4Result[], condition: string, field: keyof Phase4Result): number {
  const cr = results.filter((r) => r.condition === condition);
  return cr.length > 0 ? cr.reduce((s, r) => s + (r[field] as number), 0) / cr.length : 0;
}

function pct(rate: number): string {
  return (rate * 100).toFixed(1) + "%";
}

function wilsonCI(x: number, n: number, z: number): string {
  const p = x / n;
  const denom = 1 + z * z / n;
  const center = (p + z * z / (2 * n)) / denom;
  const spread = (z / denom) * Math.sqrt((p * (1 - p)) / n + z * z / (4 * n * n));
  const lo = Math.max(0, center - spread) * 100;
  const hi = Math.min(1, center + spread) * 100;
  return `[${lo.toFixed(1)}%, ${hi.toFixed(1)}%]`;
}

export function analyzePhase4(results: Phase4Result[]): string {
  const lines: string[] = [];
  const conds = [...CONDITIONS];
  const taskIds = [...new Set(results.map((r) => r.taskId))];

  // ─── Completion results ───────────────────────────────────────────────
  lines.push("## Overall Completion Results\n");
  lines.push("| Condition | Success | Rate | vs FULL |");
  lines.push("|---|---|---|---|");
  for (const c of conds) {
    const cr = results.filter((r) => r.condition === c);
    const pass = cr.filter((r) => r.success).length;
    const fullRate = rateOf(results, "FULL");
    const delta = (rateOf(results, c) - fullRate) * 100;
    lines.push(`| ${c} | ${pass}/${cr.length} | ${pct(rateOf(results, c))} | ${c === "FULL" ? "baseline" : delta.toFixed(1) + "pp"} |`);
  }

  // ─── Paired conversions/regressions ───────────────────────────────────
  lines.push("\n## Paired Conversions/Regressions vs MODEL_ONLY\n");
  lines.push("| Condition | Conversions | Regressions | Net |");
  lines.push("|---|---|---|---|");
  const moResults = results.filter((r) => r.condition === "MODEL_ONLY");
  for (const c of conds.filter((c) => c !== "MODEL_ONLY")) {
    const cr = results.filter((r) => r.condition === c);
    let conv = 0, reg = 0;
    for (const r of cr) {
      const mo = moResults.find((m) => m.taskId === r.taskId && m.rep === r.rep);
      if (mo && !mo.success && r.success) conv++;
      if (mo && mo.success && !r.success) reg++;
    }
    lines.push(`| ${c} | ${conv} | ${reg} | ${conv - reg} |`);
  }

  lines.push("\n## Paired vs FULL (candidate -> FULL regressions / conversions)\n");
  lines.push("| Candidate | Candidate->FULL Regressions | FULL->Candidate Loss | Net vs FULL |");
  lines.push("|---|---|---|---|");
  const fullResults = results.filter((r) => r.condition === "FULL");
  for (const c of conds.filter((c) => c !== "FULL")) {
    const cr = results.filter((r) => r.condition === c);
    let candToFull = 0, fullToCand = 0;
    for (const r of cr) {
      const f = fullResults.find((o) => o.taskId === r.taskId && o.rep === r.rep);
      if (f && !r.success && f.success) candToFull++;
      if (f && r.success && !f.success) fullToCand++;
    }
    lines.push(`| ${c} | ${candToFull} | ${fullToCand} | ${fullToCand - candToFull} |`);
  }

  // ─── Token / model-call / latency analysis ────────────────────────────
  lines.push("\n## Token / Model-Call / Latency Analysis\n");
  lines.push("| Condition | Avg Tokens | Avg Prompt | Avg Completion | Avg Calls | Avg Tools | Avg Successful Tools | Avg Time (s) |");
  lines.push("|---|---|---|---|---|---|---|---|");
  for (const c of conds) {
    const tot = avgOf(results, c, "totalTokens").toFixed(0);
    const pr = avgOf(results, c, "promptTokens").toFixed(0);
    const co = avgOf(results, c, "completionTokens").toFixed(0);
    const calls = avgOf(results, c, "modelCalls").toFixed(1);
    const tools = avgOf(results, c, "toolCalls").toFixed(1);
    const stools = avgOf(results, c, "successfulToolCalls").toFixed(1);
    const t = (avgOf(results, c, "executionTime") / 1000).toFixed(1);
    lines.push(`| ${c} | ${tot} | ${pr} | ${co} | ${calls} | ${tools} | ${stools} | ${t} |`);
  }

  // ─── Cost-effectiveness ───────────────────────────────────────────────
  lines.push("\n## Cost-Effectiveness\n");
  lines.push("| Condition | Success | Total Tokens | Model Calls | Latency (s) | Success/1k Tokens | Success/Call | Success/sec |");
  lines.push("|---|---|---|---|---|---|---|---|");
  for (const c of conds) {
    const succ = results.filter((r) => r.condition === c && r.success).length;
    const totTok = sumOf(results, c, "totalTokens");
    const calls = sumOf(results, c, "modelCalls");
    const timeSec = sumOf(results, c, "executionTime") / 1000;
    const per1k = totTok > 0 ? ((succ / totTok) * 1000).toFixed(3) : "0";
    const perCall = calls > 0 ? (succ / calls).toFixed(3) : "0";
    const perSec = timeSec > 0 ? (succ / timeSec).toFixed(3) : "0";
    lines.push(`| ${c} | ${succ} | ${totTok} | ${calls} | ${timeSec.toFixed(0)} | ${per1k} | ${perCall} | ${perSec} |`);
  }

  // ─── Context efficiency ───────────────────────────────────────────────
  lines.push("\n## Context Efficiency\n");
  lines.push("| Condition | Avg Task ctx | Avg State ctx | Avg Feedback ctx | Avg Retrieval ctx | Avg Context size |");
  lines.push("|---|---|---|---|---|---|");
  for (const c of conds) {
    const cr = results.filter((r) => r.condition === c);
    const avgFb = cr.length > 0 ? cr.reduce((s, r) => s + r.feedbackTokens, 0) / cr.length : 0;
    const avgRet = cr.length > 0 ? cr.reduce((s, r) => s + r.retrievalTokens, 0) / cr.length : 0;
    lines.push(`| ${c} | - | state-in-task | ${avgFb.toFixed(0)} | ${avgRet.toFixed(0)} | (within promptTokens ${avgOf(results, c, "promptTokens").toFixed(0)}) |`);
  }

  // ─── Retrieval efficiency ─────────────────────────────────────────────
  lines.push("\n## Retrieval Efficiency\n");
  lines.push("| Condition | Retrieval Calls | Avg Retrieval Tokens | Avg Retrieval Calls/Task | With Retrieval Success |");
  lines.push("|---|---|---|---|---|");
  const retrConds = conds.filter((c) => ["RETRIEVAL_ONLY", "FEEDBACK_RETRIEVAL", "RETRIEVAL_GOVERNOR", "FEEDBACK_RETRIEVAL_GOV", "FULL"].includes(c));
  for (const c of retrConds) {
    const cr = results.filter((r) => r.condition === c);
    const avgCalls = cr.length > 0 ? cr.reduce((s, r) => s + r.retrievalCalls, 0) / cr.length : 0;
    const avgRet = cr.length > 0 ? cr.reduce((s, r) => s + r.retrievalTokens, 0) / cr.length : 0;
    const succ = cr.filter((r) => r.success).length;
    lines.push(`| ${c} | ${sumOf(results, c, "retrievalCalls")} | ${avgRet.toFixed(0)} | ${avgCalls.toFixed(1)} | ${succ}/${cr.length} (${pct(rateOf(results, c))}) |`);
  }

  // ─── Feedback efficiency ──────────────────────────────────────────────
  lines.push("\n## Feedback Efficiency\n");
  lines.push("| Condition | Avg Feedback Tokens | Conversions | Failures despite feedback |");
  lines.push("|---|---|---|---|");
  for (const c of conds) {
    if (c === "MODEL_ONLY" || c === "RETRIEVAL_ONLY" || c === "RETRIEVAL_GOVERNOR") continue; // no feedback shown
    const cr = results.filter((r) => r.condition === c);
    const avgFb = cr.length > 0 ? cr.reduce((s, r) => s + r.feedbackTokens, 0) / cr.length : 0;
    const failures = cr.filter((r) => !r.success).length;
    const conv = cr.filter((r) => {
      const mo = moResults.find((m) => m.taskId === r.taskId && m.rep === r.rep);
      return mo && !mo.success && r.success;
    }).length;
    lines.push(`| ${c} | ${avgFb.toFixed(0)} | ${conv} | ${failures} |`);
  }

  // ─── Governor efficiency ──────────────────────────────────────────────
  lines.push("\n## Governor Efficiency\n");
  lines.push("| Condition | Rejected | Duplicates | No-ops | Wasted Calls |");
  lines.push("|---|---|---|---|---|");
  for (const c of conds) {
    const avgRej = avgOf(results, c, "rejectedActions").toFixed(1);
    const avgDup = avgOf(results, c, "duplicateActions").toFixed(1);
    const avgNoop = avgOf(results, c, "noopActions").toFixed(1);
    const avgWasted = avgOf(results, c, "rejectedActions") + avgOf(results, c, "noopActions");
    lines.push(`| ${c} | ${avgRej} | ${avgDup} | ${avgNoop} | ${avgWasted.toFixed(1)} |`);
  }

  // ─── Task-level ───────────────────────────────────────────────────────
  lines.push("\n## Task-Level Results\n");
  lines.push("| Task | " + conds.join(" | ") + " |");
  lines.push("|---|" + conds.map(() => "---").join("|") + "|");
  for (const task of taskIds) {
    const row = conds.map((c) => {
      const cr = results.filter((r) => r.taskId === task && r.condition === c);
      const pass = cr.filter((r) => r.success).length;
      return `${pass}/${cr.length}`;
    });
    lines.push(`| ${task} | ${row.join(" | ")} |`);
  }

  // ─── Trace analysis ───────────────────────────────────────────────────
  lines.push("\n## Trace Analysis (tasks recovered vs MODEL_ONLY)\n");
  const moPass = new Set(moResults.filter((r) => r.success).map((r) => r.taskId));
  for (const c of conds.filter((c) => c !== "MODEL_ONLY" && c !== "FULL")) {
    const cPass = new Set(results.filter((r) => r.condition === c && r.success).map((r) => r.taskId));
    const recovered = [...cPass].filter((t) => !moPass.has(t));
    const lost = [...moPass].filter((t) => !cPass.has(t));
    lines.push(`**${c}**: recovered [${recovered.join(", ")}] | lost [${lost.join(", ")}]`);
  }

  // ─── Statistical ──────────────────────────────────────────────────────
  lines.push("\n## Statistical Analysis (Wilson 95% CI)\n");
  lines.push("| Condition | n | Successes | Rate | 95% CI |");
  lines.push("|---|---|---|---|---|");
  for (const c of conds) {
    const cr = results.filter((r) => r.condition === c);
    const x = cr.filter((r) => r.success).length;
    lines.push(`| ${c} | ${cr.length} | ${x} | ${pct(rateOf(results, c))} | ${wilsonCI(x, cr.length, 1.96)} |`);
  }

  return lines.join("\n");
}

// ─── Minimal Effective Stack determination ───────────────────────────────────

export interface MinimalStackOutcome {
  found: boolean;
  winner: string | null;
  candidates: { cond: string; rate: number; ratioOfFull: number; tokReduction: number; callReduction: number; qualifies: boolean }[];
}

export function determineMinimalStack(results: Phase4Result[]): MinimalStackOutcome {
  const fullRate = rateOf(results, "FULL");
  const candidatesStatus: MinimalStackOutcome["candidates"] = [];

  for (const cand of MINIMAL_STACK_CRITERIA.candidates) {
    const rate = rateOf(results, cand);
    const ratio = fullRate > 0 ? rate / fullRate : 0;

    const fullTok = avgOf(results, "FULL", "totalTokens");
    const candTok = avgOf(results, cand, "totalTokens");
    const tokReduction = fullTok > 0 ? 1 - candTok / fullTok : 0;

    const fullCalls = avgOf(results, "FULL", "modelCalls");
    const candCalls = avgOf(results, cand, "modelCalls");
    const callReduction = fullCalls > 0 ? 1 - candCalls / fullCalls : 0;

    const qualifies =
      ratio >= MINIMAL_STACK_CRITERIA.minSuccessRatioOfFull &&
      (tokReduction >= MINIMAL_STACK_CRITERIA.minResourceReduction || callReduction >= MINIMAL_STACK_CRITERIA.minResourceReduction);

    candidatesStatus.push({ cond: cand, rate, ratioOfFull: ratio, tokReduction, callReduction, qualifies });
  }

  const qualifying = candidatesStatus.filter((c) => c.qualifies);
  // Prefer fewer mechanisms, then fewer calls, then fewer tokens
  const mechCount = (c: string): number => {
    if (c === "FEEDBACK_ONLY" || c === "RETRIEVAL_ONLY") return 1;
    if (c === "FEEDBACK_GOVERNOR" || c === "RETRIEVAL_GOVERNOR" || c === "FEEDBACK_RETRIEVAL") return 2;
    return 3;
  };
  qualifying.sort((a, b) => {
    const mc = mechCount(a.cond) - mechCount(b.cond);
    if (mc !== 0) return mc;
    const cc = b.callReduction - a.callReduction;
    if (cc !== 0) return cc;
    return b.tokReduction - a.tokReduction;
  });

  if (qualifying.length === 0) {
    return { found: false, winner: null, candidates: candidatesStatus };
  }
  return { found: true, winner: qualifying[0]!.cond, candidates: candidatesStatus };
}

// ─── Direct execution ────────────────────────────────────────────────────────

const isMainModule = process.argv[1] &&
  (process.argv[1].endsWith("phase4-runner.ts") || process.argv[1].endsWith("phase4-runner.js"));

if (isMainModule) {
  runPhase4()
    .then((results) => {
      const resultsDir = path.join(process.cwd(), "benchmarks", "results", "phase4");
      fs.mkdirSync(resultsDir, { recursive: true });
      fs.writeFileSync(path.join(resultsDir, "results.json"), JSON.stringify(results, null, 2), "utf-8");
      const analysis = analyzePhase4(results);
      fs.writeFileSync(path.join(resultsDir, "analysis.md"), analysis, "utf-8");
      const minStack = determineMinimalStack(results);
      fs.writeFileSync(path.join(resultsDir, "minimal-stack.json"), JSON.stringify(minStack, null, 2), "utf-8");
      console.log(`\nResults saved to ${resultsDir}`);
      console.log(analysis);
      console.log(`\n=== MINIMAL EFFECTIVE STACK ===`);
      console.log(JSON.stringify(minStack, null, 2));
    })
    .catch((err) => {
      console.error("Phase 4 failed:", err);
      process.exit(1);
    });
}
