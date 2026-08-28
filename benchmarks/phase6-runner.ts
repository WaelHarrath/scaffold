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
  formatState,
  formatFeedbackCompressed,
  formatRetrievalBudgeted,
  type StateCompressionLevel,
  type FeedbackCompressionLevel,
  type RetrievalBudgetLevel,
} from "../src/execution/format-compress.js";
import { estimateTokens } from "../src/context/context-budget.js";
import { formatAdaptiveRetrieval, type AdaptiveBudgetLevel } from "../src/retrieval/adaptive-budget.js";
import type { TaskDefinition } from "../src/benchmark/types.js";
import type { FeedbackResult } from "../src/feedback/feedback.js";
import type { TaskState } from "../src/state/state.js";

// ─── Config ──────────────────────────────────────────────────────────────────

const SELECTED_IDS = [
  "ST1", "ST2", "MS1", "MS2", "ER1", "ER2",
  "TO1", "TO2", "CP1", "CP2", "CF1", "CF2",
  "AS1", "AS2", "CV1", "CV2", "RA1", "RA2",
  "DC1", "DC2",
] as const;

export interface ConditionSpec {
  readonly id: string;
  readonly state: StateCompressionLevel | null;
  readonly feedback: FeedbackCompressionLevel | null;
  readonly retrieval: RetrievalBudgetLevel | null;
  readonly adaptive?: AdaptiveBudgetLevel;
}

export const CORE_CONDITIONS: ConditionSpec[] = [
  { id: "FULL_CONTROL", state: "FULL_STATE", feedback: "FULL_FEEDBACK", retrieval: "FULL" },
  { id: "COMPACT_STATE", state: "COMPACT_STATE", feedback: "FULL_FEEDBACK", retrieval: "FULL" },
  { id: "MIN_STATE", state: "MIN_STATE", feedback: "FULL_FEEDBACK", retrieval: "FULL" },
  { id: "COMPACT_FEEDBACK", state: "FULL_STATE", feedback: "COMPACT_FEEDBACK", retrieval: "FULL" },
  { id: "MINIMAL_FEEDBACK", state: "FULL_STATE", feedback: "MINIMAL_FEEDBACK", retrieval: "FULL" },
  { id: "RETRIEVAL_75", state: "FULL_STATE", feedback: "FULL_FEEDBACK", retrieval: "RETRIEVAL_75" },
  { id: "RETRIEVAL_50", state: "FULL_STATE", feedback: "FULL_FEEDBACK", retrieval: "RETRIEVAL_50" },
  { id: "RETRIEVAL_MIN", state: "FULL_STATE", feedback: "FULL_FEEDBACK", retrieval: "RETRIEVAL_MIN" },
  { id: "STATE_COMPACT_FB_COMPACT", state: "COMPACT_STATE", feedback: "COMPACT_FEEDBACK", retrieval: "FULL" },
];

const REPS = 5;
const INFERENCE_PARAMS = {
  modelId: "qwen3:4b-instruct",
  temperature: 0.1,
  topP: "N/A (not exposed by adapter)",
  seed: "N/A (not supported by adapter)",
  maxTokens: 256,
  maxActions: 20,
  contextSize: 4096,
  reservedOutput: 256,
  inputBudget: 3840,
} as const;

// ─── Result schema (per constraint #8) ───────────────────────────────────────

export interface Phase6Result {
  readonly model: string;
  readonly contextSize: number;
  readonly temperature: number;
  readonly topP: string;
  readonly seed: string;
  readonly outputLimit: number;
  readonly condition: string;
  readonly stateLevel: string;
  readonly feedbackLevel: string;
  readonly retrievalLevel: string;
  readonly taskId: string;
  readonly category: string;
  readonly rep: number;
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
  readonly budgetExhausted: boolean;
  readonly success: boolean;
  readonly reason: string;
  readonly failureClass: string;
  readonly actionSequence: string[];
}

// ─── Condition ordering ──────────────────────────────────────────────────────

function balancedOrdering<T>(reps: number, items: T[]): T[][] {
  const orders: T[][] = [];
  for (let r = 0; r < reps; r++) {
    const offset = (r + 5) % items.length; // distinct offset vs Phases 1-4
    const order = [...items.slice(offset), ...items.slice(0, offset)];
    orders.push(order);
  }
  return orders;
}

// ─── Workspace helpers ───────────────────────────────────────────────────────

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
          // skip
        }
      }
    }
  } catch {
    // ignore
  }
  return items;
}

function setupWorkspace(task: TaskDefinition): string {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "scaffold-phase6-"));
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

function classifyFailure(reason: string, modelCalls: number, maxActions: number): string {
  if (reason.startsWith("INFRASTRUCTURE:")) return "infrastructure";
  if (reason.includes("exhausted")) return "budget_exhaustion";
  if (reason.includes("duplicate")) return "repeated_action";
  if (reason.includes("could not parse")) return "action_parse_failure";
  if (modelCalls >= maxActions) return "budget_exhaustion";
  return "reasoning_failure";
}

// ─── Condition deps builder ──────────────────────────────────────────────────

export interface BuiltDeps {
  deps: ScaffoldDeps;
  retrievalCalls: () => number;
}

export function buildDeps(spec: ConditionSpec, workingDir: string): BuiltDeps {  const model = new Qwen3Adapter(INFERENCE_PARAMS.contextSize);
  const executor = createExecutor(workingDir);
  const governor = createGovernorState();
  const embeddingModel = new MiniLMAdapter();
  const cache = new EmbeddingCache(500);
  const retriever = new SemanticRetriever(embeddingModel, cache);
  let retrievalCallCount = 0;
  let cachedItems: RetrievalItem[] | null = null;

  const useRetrieval = spec.retrieval !== null;

  const deps: ScaffoldDeps = {
    model: model as any,
    executor,
    governor,
    systemPrompt: SYSTEM_PROMPT,
    formatPrompt: (state, feedback, retrieved) => {
      const parts: string[] = [];
      parts.push(`TASK: ${state.task}`);
      if (spec.state) {
        const s = formatState(state, spec.state);
        if (s) parts.push(s);
      }
      if (retrieved) parts.push(`RELEVANT: ${retrieved}`);
      if (feedback) parts.push(`FEEDBACK: ${feedback}`);
      return parts.join("\n");
    },
    ...(spec.feedback
      ? { formatFeedback: (r: FeedbackResult) => formatFeedbackCompressed(r, spec.feedback as FeedbackCompressionLevel) }
      : {}),
    ...(useRetrieval
      ? {
          retrieve: async (state: TaskState, _observation: string | null) => {
            retrievalCallCount++;
            if (!cachedItems) cachedItems = readFilesInDir(workingDir);
            const items = cachedItems;
            if (items.length === 0) return { text: "", tokens: 0 };
            const query = `${state.task} ${state.lastAction ?? ""} ${state.currentGoal ?? ""}`.slice(0, 500);
            const results = await retriever.retrieve(query, items, 3);
            if (spec.adaptive) {
              const ranked = results
                .map((res) => ({ id: res.id, content: items.find((i) => i.id === res.id)?.content ?? "", score: res.score ?? 0 }))
                .filter((i) => i.content.length > 0);
              const outcome = formatAdaptiveRetrieval(ranked, spec.adaptive as AdaptiveBudgetLevel);
              return { text: outcome.text, tokens: outcome.tokens };
            }
            const ranked = results
              .map((res) => ({ id: res.id, content: items.find((i) => i.id === res.id)?.content ?? "" }))
              .filter((i) => i.content.length > 0);
            const text = formatRetrievalBudgeted(ranked, spec.retrieval as RetrievalBudgetLevel);
            return { text, tokens: estimateTokens(text) };
          },
        }
      : {}),
  };

  return { deps, retrievalCalls: () => retrievalCallCount };
}

// ─── Checkpointing ───────────────────────────────────────────────────────────

interface Checkpoint {
  results: Phase6Result[];
  completedKeys: string[];
}
function saveCheckpoint(cp: Checkpoint, dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "checkpoint.json"), JSON.stringify(cp, null, 2), "utf-8");
}
function loadCheckpoint(dir: string): Checkpoint | null {
  try {
    const p = path.join(dir, "checkpoint.json");
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf-8")) as Checkpoint;
  } catch {
    // ignore
  }
  return null;
}

// ─── Main run ────────────────────────────────────────────────────────────────

export async function runPhase6(conditions: ConditionSpec[]): Promise<Phase6Result[]> {
  const selectedTasks = TASKS.filter((t) => (SELECTED_IDS as readonly string[]).includes(t.id));
  const orders = balancedOrdering<ConditionSpec>(REPS, conditions);
  const resultsDir = path.join(process.cwd(), "benchmarks", "results", "phase6");
  const checkpoint = loadCheckpoint(resultsDir) ?? { results: [], completedKeys: [] };
  const completedKeys = new Set(checkpoint.completedKeys);
  const results: Phase6Result[] = [...checkpoint.results];
  let executed = 0;
  let succeeded = 0;

  console.log(`\n=== PHASE 6: EFFICIENCY OPTIMIZATION OF THE PROVEN FULL STACK ===`);
  console.log(`Model: ${INFERENCE_PARAMS.modelId}`);
  console.log(`Context: ${INFERENCE_PARAMS.contextSize} tokens (hard cap, unmodified)`);
  console.log(`Temperature: ${INFERENCE_PARAMS.temperature}; top-p: ${INFERENCE_PARAMS.topP}; seed: ${INFERENCE_PARAMS.seed}`);
  console.log(`Output limit: ${INFERENCE_PARAMS.maxTokens} / call; Task reps: ${REPS}; Total executions: ${selectedTasks.length * conditions.length * REPS}`);

  for (let rep = 0; rep < REPS; rep++) {
    const order = orders[rep]!;
    console.log(`\n--- Rep ${rep} (order: ${order.map((c) => c.id).join(" -> ")}) ---`);
    for (const task of selectedTasks) {
      for (const cond of order) {
        const key = `${task.id}|${cond.id}|${rep}`;
        if (completedKeys.has(key)) {
          console.log(`  SKIP ${task.id} ${cond.id} rep${rep} (checkpoint)`);
          continue;
        }
        const startTime = Date.now();
        process.stdout.write(`  ${task.id} ${cond.id} rep${rep}... `);
        const workspaceDir = setupWorkspace(task);
        try {
          const { deps, retrievalCalls } = buildDeps(cond, workspaceDir);
          const loopResult = await runScaffoldLoop(task.objective, deps, {
            maxActions: INFERENCE_PARAMS.maxActions,
            temperature: INFERENCE_PARAMS.temperature,
            maxTokens: INFERENCE_PARAMS.maxTokens,
            governorEnabled: true,
          });
          const actions = loopResult.state.attemptedActions.map((a) => {
            const p = a.split(" ");
            return { success: !loopResult.state.failedActions.includes(a), actionType: p[0] ?? "unknown", target: p.slice(1).join(" ") || undefined };
          });
          const verification = task.verify(workspaceDir, actions);
          const budgetExhausted = loopResult.modelCalls >= INFERENCE_PARAMS.maxActions && !verification.success;
          const failureClass = verification.success ? "success" : classifyFailure(verification.reason, loopResult.modelCalls, INFERENCE_PARAMS.maxActions);

          const result: Phase6Result = {
            model: INFERENCE_PARAMS.modelId,
            contextSize: INFERENCE_PARAMS.contextSize,
            temperature: INFERENCE_PARAMS.temperature,
            topP: INFERENCE_PARAMS.topP,
            seed: INFERENCE_PARAMS.seed,
            outputLimit: INFERENCE_PARAMS.maxTokens,
            condition: cond.id,
            stateLevel: cond.state ?? "NONE",
            feedbackLevel: cond.feedback ?? "NONE",
            retrievalLevel: cond.retrieval ?? "NONE",
            taskId: task.id,
            category: task.category,
            rep,
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
            budgetExhausted,
            success: verification.success,
            reason: verification.reason,
            failureClass,
            actionSequence: loopResult.state.attemptedActions,
          };
          results.push(result);
          completedKeys.add(key);
          executed++;
          if (verification.success) succeeded++;
          console.log(`${verification.success ? "PASS" : "FAIL"} (${((Date.now() - startTime) / 1000).toFixed(1)}s, ${loopResult.modelCalls} calls, ${loopResult.totalTokens} tok)`);
          if (executed % 5 === 0) saveCheckpoint({ results, completedKeys: [...completedKeys] }, resultsDir);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.log(`ERROR: ${msg}`);
          const result: Phase6Result = {
            model: INFERENCE_PARAMS.modelId,
            contextSize: INFERENCE_PARAMS.contextSize,
            temperature: INFERENCE_PARAMS.temperature,
            topP: INFERENCE_PARAMS.topP,
            seed: INFERENCE_PARAMS.seed,
            outputLimit: INFERENCE_PARAMS.maxTokens,
            condition: cond.id,
            stateLevel: cond.state ?? "NONE",
            feedbackLevel: cond.feedback ?? "NONE",
            retrievalLevel: cond.retrieval ?? "NONE",
            taskId: task.id,
            category: task.category,
            rep,
            modelCalls: 0, toolCalls: 0, successfulToolCalls: 0,
            rejectedActions: 0, duplicateActions: 0, noopActions: 0,
            promptTokens: 0, completionTokens: 0, totalTokens: 0,
            feedbackTokens: 0, retrievalTokens: 0, retrievalCalls: 0,
            executionTime: Date.now() - startTime,
            budgetExhausted: false,
            success: false,
            reason: `INFRASTRUCTURE: ${msg}`,
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
  console.log(`\n=== PHASE 6 RUN COMPLETE (this pass) ===`);
  console.log(`Executed this pass: ${executed}; Cumulative succeeded: ${succeeded}`);
  console.log(`Cumulative total results: ${results.length}`);
  return results;
}

// ─── Analysis ────────────────────────────────────────────────────────────────

function rateOf(results: Phase6Result[], cond: string): number {
  const cr = results.filter((r) => r.condition === cond);
  return cr.length > 0 ? cr.filter((r) => r.success).length / cr.length : 0;
}
function avgOf(results: Phase6Result[], cond: string, field: keyof Phase6Result): number {
  const cr = results.filter((r) => r.condition === cond);
  return cr.length > 0 ? cr.reduce((s, r) => s + (r[field] as number), 0) / cr.length : 0;
}
function sumOf(results: Phase6Result[], cond: string, field: keyof Phase6Result): number {
  const cr = results.filter((r) => r.condition === cond);
  return cr.reduce((s, r) => s + (r[field] as number), 0);
}

const HARD_TASKS = ["MS2", "CF2", "RA2", "DC1"];

export function analyzePhase6(results: Phase6Result[], conditions: ConditionSpec[]): string {
  const L: string[] = [];
  const condIds = conditions.map((c) => c.id);

  L.push("## Phase 6 Cross-Condition Results (aggregate)\n");
  L.push(`| Condition | STATE | FEEDBACK | RETR | n | Success | Rate | avgCalls | avgPromptTok | avgTotalTok | latency_s |`);
  L.push("|---|---|---|---|---|---|---|---|---|---|---|");
  for (const id of condIds) {
    const cr = results.filter((r) => r.condition === id);
    if (cr.length === 0) continue;
    const spec = conditions.find((c) => c.id === id);
    const pass = cr.filter((r) => r.success).length;
    L.push(`| ${id} | ${spec!.state ?? "-"} | ${spec!.feedback ?? "-"} | ${spec!.retrieval ?? "-"} | ${cr.length} | ${pass} | ${(rateOf(results, id) * 100).toFixed(1)}% | ${avgOf(results, id, "modelCalls").toFixed(1)} | ${avgOf(results, id, "promptTokens").toFixed(0)} | ${avgOf(results, id, "totalTokens").toFixed(0)} | ${(avgOf(results, id, "executionTime") / 1000).toFixed(1)} |`);
    L.push(`| ${id} | tools ${avgOf(results,id,"toolCalls").toFixed(1)} | succTools ${avgOf(results,id,"successfulToolCalls").toFixed(1)} | rej ${avgOf(results,id,"rejectedActions").toFixed(1)} | dup ${avgOf(results,id,"duplicateActions").toFixed(1)} | retrTok ${avgOf(results,id,"retrievalTokens").toFixed(0)} | retrCalls ${avgOf(results,id,"retrievalCalls").toFixed(1)} | fbTok ${avgOf(results,id,"feedbackTokens").toFixed(0)} | | | |`);
  }

  L.push("\n## Hard-Task Stress (MS2, CF2, RA2, DC1)\n");
  L.push("| Condition | MS2 | CF2 | RA2 | DC1 | Full-rate |");
  L.push("|---|---|---|---|---|---|");
  for (const id of condIds) {
    const cr = results.filter((r) => r.condition === id);
    if (cr.length === 0) continue;
    const cells = HARD_TASKS.map((t) => `${cr.filter((r) => r.taskId === t && r.success).length}/${cr.filter((r) => r.taskId === t).length}`);
    const fullRate = rateOf(results, id);
    const hood = cr.filter((r) => HARD_TASKS.includes(r.taskId) && r.success).length;
    L.push(`| ${id} | ${cells.join(" | ")} | ${fullRate.toFixed(3)} (hard ${hood}/${HARD_TASKS.length * 5}) |`);
  }

  // Conversions / regressions vs FULL_CONTROL
  L.push("\n## Paired Conversions / Regressions vs FULL_CONTROL\n");
  L.push("| Candidate | Conversions | Regressions | Net |");
  L.push("|---|---|---|---|");
  const fc = results.filter((r) => r.condition === "FULL_CONTROL");
  for (const id of condIds) {
    if (id === "FULL_CONTROL") continue;
    const cr = results.filter((r) => r.condition === id);
    let conv = 0, reg = 0;
    for (const r of cr) {
      const f = fc.find((o) => o.taskId === r.taskId && o.rep === r.rep);
      if (!f) continue;
      if (!f.success && r.success) conv++;
      if (f.success && !r.success) reg++;
    }
    L.push(`| ${id} | ${conv} | ${reg} | ${conv - reg} |`);
  }

  // Cost-effectiveness
  L.push("\n## Cost-Effectiveness\n");
  L.push("| Condition | Success | Total Tokens | Calls | Success/1k Tokens | Success/Call |");
  L.push("|---|---|---|---|---|---|");
  for (const id of condIds) {
    const cr = results.filter((r) => r.condition === id);
    if (cr.length === 0) continue;
    const succ = cr.filter((r) => r.success).length;
    const tok = sumOf(results, id, "totalTokens");
    const calls = sumOf(results, id, "modelCalls");
    L.push(`| ${id} | ${succ} | ${tok} | ${calls} | ${tok > 0 ? ((succ / tok) * 1000).toFixed(3) : 0} | ${calls > 0 ? (succ / calls).toFixed(3) : 0} |`);
  }

  return L.join("\n");
}

// Pareto: dominates FULL_CONTROL if completion >= and (fewer calls OR fewer tokens OR lower latency) with no unacceptable regression (net >= -0)
export interface ParetoOutcome {
  full_control: string;
  dominates: { condition: string; reason: string[] }[];
  full_pareto_optimal: boolean;
}
export function paretoAnalysis(results: Phase6Result[], conditions: ConditionSpec[]): ParetoOutcome {
  const id = "FULL_CONTROL";
  const fc = results.filter((r) => r.condition === id);
  const fcSuccess = fc.filter((r) => r.success).length;
  const fcTok = fc.reduce((s, r) => s + r.totalTokens, 0);
  const fcCalls = fc.reduce((s, r) => s + r.modelCalls, 0);
  const fcLat = fc.reduce((s, r) => s + r.executionTime, 0);
  const dominates: ParetoOutcome["dominates"] = [];

  for (const cond of conditions) {
    if (cond.id === id) continue;
    const cr = results.filter((r) => r.condition === cond.id);
    if (cr.length === 0) continue;
    const succ = cr.filter((r) => r.success).length;
    const tok = cr.reduce((s, r) => s + r.totalTokens, 0);
    const calls = cr.reduce((s, r) => s + r.modelCalls, 0);
    const lat = cr.reduce((s, r) => s + r.executionTime, 0);
    // net regression vs FULL_CONTROL (paired)
    const reg = cr.filter((r) => { const f = fc.find((o) => o.taskId === r.taskId && o.rep === r.rep); return f && f.success && !r.success; }).length;
    const reasons: string[] = [];
    if (succ < fcSuccess) {
      // not dominating (lower completion) — but still record no domination
      dominateCheck: continue;
    }
    if (calls < fcCalls) reasons.push("fewer model calls");
    if (tok < fcTok) reasons.push("fewer total tokens");
    if (lat < fcLat) reasons.push("lower latency");
    if (reasons.length > 0 && reg === 0) {
      dominates.push({ condition: cond.id, reason: reasons });
    }
  }

  const fullParetoOptimal = dominates.length === 0;
  return { full_control: id, dominates, full_pareto_optimal: fullParetoOptimal };
}

// BEST_COMPRESSION selection (composite of best STATE + best FEEDBACK + best RETRIEVAL)
export interface BestCompression {
  stateLevel: StateCompressionLevel;
  feedbackLevel: FeedbackCompressionLevel;
  retrievalLevel: RetrievalBudgetLevel;
}
export function selectBestCompression(results: Phase6Result[]): BestCompression {
  const stateOrder: StateCompressionLevel[] = ["FULL_STATE", "COMPACT_STATE", "MIN_STATE", "PROGRESS_STATE"];
  const fbOrder: FeedbackCompressionLevel[] = ["FULL_FEEDBACK", "COMPACT_FEEDBACK", "MINIMAL_FEEDBACK"];
  const retrOrder: RetrievalBudgetLevel[] = ["FULL", "RETRIEVAL_75", "RETRIEVAL_50", "RETRIEVAL_MIN"];

  // Candidate condition → compression level maps
  const stateConds: [StateCompressionLevel, string][] = [
    ["FULL_STATE", "FULL_CONTROL"],
    ["COMPACT_STATE", "COMPACT_STATE"],
    ["MIN_STATE", "MIN_STATE"],
    ["PROGRESS_STATE", "PROGRESS_STATE"],
  ];
  const fbConds: [FeedbackCompressionLevel, string][] = [
    ["FULL_FEEDBACK", "FULL_CONTROL"],
    ["COMPACT_FEEDBACK", "COMPACT_FEEDBACK"],
    ["MINIMAL_FEEDBACK", "MINIMAL_FEEDBACK"],
  ];
  const retrConds: [RetrievalBudgetLevel, string][] = [
    ["FULL", "FULL_CONTROL"],
    ["RETRIEVAL_75", "RETRIEVAL_75"],
    ["RETRIEVAL_50", "RETRIEVAL_50"],
    ["RETRIEVAL_MIN", "RETRIEVAL_MIN"],
  ];

  const bestState = pickBest(results, stateConds);
  const bestFb = pickBest(results, fbConds);
  const bestRetr = pickBest(results, retrConds);
  return { stateLevel: bestState, feedbackLevel: bestFb, retrievalLevel: bestRetr };
}

function pickBest<T extends string>(results: Phase6Result[], cand: [T, string][]): T {
  // Prefer: completion >= FULL_CONTROL (0.9x), then fewest tokens, then fewest calls, then fewest mechanisms in prompt
  const fcRate = rateOf(results, "FULL_CONTROL");
  const eligible = cand.filter(([, cond]) => {
    const cr = results.filter((r) => r.condition === cond);
    if (cr.length === 0) return false;
    return rateOf(results, cond) >= fcRate * 0.9;
  });
  const pool = eligible.length > 0 ? eligible : cand.filter(([, cond]) => results.some((r) => r.condition === cond));
  pool.sort((a, b) => {
    const tokA = sumOf(results, a[1], "totalTokens") / Math.max(1, results.filter((r) => r.condition === a[1]).length);
    const tokB = sumOf(results, b[1], "totalTokens") / Math.max(1, results.filter((r) => r.condition === b[1]).length);
    return tokA - tokB;
  });
  return pool[0]![0];
}
