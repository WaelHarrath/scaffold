import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { Qwen3Adapter } from "../src/model/qwen3.js";
import { MiniLMAdapter } from "../src/model/embedding.js";
import { EmbeddingCache } from "../src/retrieval/embedding-cache.js";
import { SemanticRetriever, type RetrievalItem } from "../src/retrieval/retriever.js";
import { createExecutor } from "../src/execution/executor.js";
import { createGovernorState } from "../src/execution/governor.js";
import { runScaffoldLoop, type ScaffoldDeps, type LoopResult } from "../src/execution/scaffold-loop.js";
import { SYSTEM_PROMPT } from "../src/execution/system-prompt.js";
import {
  formatModelOnlyPrompt,
  formatMinimalPrompt,
  formatRetrievalPrompt,
  formatFullPrompt,
} from "../src/execution/format-prompt.js";
import { estimateTokens } from "../src/context/context-budget.js";
import { TASKS } from "../src/benchmark/tasks.js";
import type { TaskDefinition, TaskResult } from "../src/benchmark/types.js";

// ─── Task Selection ───────────────────────────────────────────────────────────
// 2 tasks per category = 20 tasks total

const SELECTED_IDS = [
  "ST1", "ST2",
  "MS1", "MS2",
  "ER1", "ER2",
  "TO1", "TO2",
  "CP1", "CP2",
  "CF1", "CF2",
  "AS1", "AS2",
  "CV1", "CV2",
  "RA1", "RA2",
  "DC1", "DC2",
] as const;

const CONDITIONS = ["MODEL_ONLY", "MINIMAL", "RETRIEVAL", "FULL"] as const;

const REPS = 5;

// ─── Inference Parameters ─────────────────────────────────────────────────────

const INFERENCE_PARAMS = {
  modelId: "qwen3:4b-instruct",
  temperature: 0.1,
  maxTokens: 256,
  maxActions: 20,
  contextSize: 4096,
  reservedOutput: 256,
  inputBudget: 3840,
} as const;

// ─── Balanced Condition Ordering ──────────────────────────────────────────────

function balancedOrdering(reps: number): string[][] {
  const base = [...CONDITIONS];
  const orders: string[][] = [];
  for (let r = 0; r < reps; r++) {
    const offset = r % base.length;
    const order = [
      ...base.slice(offset),
      ...base.slice(0, offset),
    ];
    orders.push(order);
  }
  return orders;
}

// ─── File Reading Helper ──────────────────────────────────────────────────────

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

// ─── Condition Builders ───────────────────────────────────────────────────────

function buildModelOnlyDeps(workingDir: string): ScaffoldDeps {
  return {
    model: new Qwen3Adapter(INFERENCE_PARAMS.contextSize),
    executor: createExecutor(workingDir),
    governor: createGovernorState(),
    systemPrompt: SYSTEM_PROMPT,
    formatPrompt: (state, feedback) => formatModelOnlyPrompt(state, feedback),
  };
}

function buildMinimalDeps(workingDir: string): ScaffoldDeps {
  return {
    model: new Qwen3Adapter(INFERENCE_PARAMS.contextSize),
    executor: createExecutor(workingDir),
    governor: createGovernorState(),
    systemPrompt: SYSTEM_PROMPT,
    formatPrompt: (state, feedback) => formatMinimalPrompt(state, feedback),
  };
}

function buildRetrievalDeps(workingDir: string): ScaffoldDeps {
  const model = new Qwen3Adapter(INFERENCE_PARAMS.contextSize);
  const embeddingModel = new MiniLMAdapter();
  const cache = new EmbeddingCache(500);
  const retriever = new SemanticRetriever(embeddingModel, cache);

  let cachedItems: RetrievalItem[] | null = null;

  return {
    model,
    executor: createExecutor(workingDir),
    governor: createGovernorState(),
    systemPrompt: SYSTEM_PROMPT,
    formatPrompt: (state, feedback, retrieved) =>
      formatRetrievalPrompt(state, feedback, retrieved ?? ""),
    retrieve: async (state, _observation) => {
      if (!cachedItems) {
        cachedItems = readFilesInDir(workingDir);
      }

      if (cachedItems.length === 0) {
        return { text: "", tokens: 0 };
      }

      const query = `${state.task} ${state.lastAction ?? ""} ${state.currentGoal ?? ""}`.slice(0, 500);
      const results = await retriever.retrieve(query, cachedItems, 3);

      const parts: string[] = [];
      for (const r of results) {
        const item = cachedItems.find((i) => i.id === r.id);
        if (item) {
          parts.push(`[${r.id}] ${item.content.slice(0, 300)}`);
        }
      }

      const text = parts.join("\n");
      const tokens = estimateTokens(text);
      return { text, tokens };
    },
  };
}

function buildFullDeps(workingDir: string): ScaffoldDeps {
  const model = new Qwen3Adapter(INFERENCE_PARAMS.contextSize);
  const embeddingModel = new MiniLMAdapter();
  const cache = new EmbeddingCache(500);
  const retriever = new SemanticRetriever(embeddingModel, cache);

  let cachedItems: RetrievalItem[] | null = null;

  return {
    model,
    executor: createExecutor(workingDir),
    governor: createGovernorState(),
    systemPrompt: SYSTEM_PROMPT,
    formatPrompt: (state, feedback, retrieved) =>
      formatFullPrompt(state, feedback, retrieved ?? ""),
    retrieve: async (state, _observation) => {
      if (!cachedItems) {
        cachedItems = readFilesInDir(workingDir);
      }

      if (cachedItems.length === 0) {
        return { text: "", tokens: 0 };
      }

      const query = `${state.task} ${state.lastAction ?? ""} ${state.currentGoal ?? ""}`.slice(0, 500);
      const results = await retriever.retrieve(query, cachedItems, 3);

      const parts: string[] = [];
      for (const r of results) {
        const item = cachedItems.find((i) => i.id === r.id);
        if (item) {
          parts.push(`[${r.id}] ${item.content.slice(0, 300)}`);
        }
      }

      const text = parts.join("\n");
      const tokens = estimateTokens(text);
      return { text, tokens };
    },
  };
}

function buildDeps(condition: string, workingDir: string): ScaffoldDeps {
  switch (condition) {
    case "MODEL_ONLY": return buildModelOnlyDeps(workingDir);
    case "MINIMAL": return buildMinimalDeps(workingDir);
    case "RETRIEVAL": return buildRetrievalDeps(workingDir);
    case "FULL": return buildFullDeps(workingDir);
    default: throw new Error(`Unknown condition: ${condition}`);
  }
}

// ─── Workspace Setup ──────────────────────────────────────────────────────────

function setupWorkspace(task: TaskDefinition): string {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "scaffold-phase1-"));
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

// ─── Action Collection ────────────────────────────────────────────────────────

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

// ─── Checkpoint ───────────────────────────────────────────────────────────────

interface Checkpoint {
  results: TaskResult[];
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

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function runPhase1(): Promise<TaskResult[]> {
  const selectedTasks = TASKS.filter((t) => (SELECTED_IDS as readonly string[]).includes(t.id));
  const orders = balancedOrdering(REPS);

  console.log(`\n=== PHASE 1: QWEN3 4B CONTROLLED BASELINE + COMPONENT ABLATION ===`);
  console.log(`Model: ${INFERENCE_PARAMS.modelId}`);
  console.log(`Context: ${INFERENCE_PARAMS.contextSize} tokens`);
  console.log(`Temperature: ${INFERENCE_PARAMS.temperature}`);
  console.log(`Max tokens per call: ${INFERENCE_PARAMS.maxTokens}`);
  console.log(`Max actions per task: ${INFERENCE_PARAMS.maxActions}`);
  console.log(`Tasks: ${selectedTasks.length}`);
  console.log(`Conditions: ${CONDITIONS.length}`);
  console.log(`Repetitions: ${REPS}`);
  console.log(`Total executions: ${selectedTasks.length * CONDITIONS.length * REPS}`);
  console.log(`Condition orders:`);
  for (let r = 0; r < REPS; r++) {
    console.log(`  Rep ${r}: ${orders[r]!.join(" -> ")}`);
  }

  const resultsDir = path.join(process.cwd(), "benchmarks", "results", "phase1");
  const checkpoint = loadCheckpoint(resultsDir) ?? { results: [], completedKeys: [] };
  const completedKeys = new Set(checkpoint.completedKeys);

  const results: TaskResult[] = [...checkpoint.results];
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
          const deps = buildDeps(condition, workspaceDir);
          const loopResult = await runScaffoldLoop(task.objective, deps, {
            maxActions: INFERENCE_PARAMS.maxActions,
            temperature: INFERENCE_PARAMS.temperature,
            maxTokens: INFERENCE_PARAMS.maxTokens,
          });

          const actions = collectActions(loopResult.state);
          const verification = task.verify(workspaceDir, actions);

          const result: TaskResult = {
            taskId: task.id,
            category: task.category,
            success: verification.success,
            reason: verification.reason,
            modelCalls: loopResult.modelCalls,
            toolCalls: loopResult.toolCalls,
            rejectedActions: loopResult.rejectedActions,
            duplicateActions: loopResult.duplicateActions,
            noopActions: loopResult.noopActions,
            totalTokens: loopResult.totalTokens,
            executionTime: loopResult.executionTime,
            condition,
            rep,
            retrievalTokens: loopResult.retrievalTokens,
          };

          results.push(result);
          completedKeys.add(key);
          executed++;

          if (verification.success) succeeded++;

          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          const status = verification.success ? "PASS" : "FAIL";
          console.log(`${status} (${elapsed}s, ${loopResult.modelCalls} calls, ${loopResult.totalTokens} tok)`);

          // Save checkpoint every 5 executions
          if (executed % 5 === 0) {
            saveCheckpoint({ results, completedKeys: [...completedKeys] }, resultsDir);
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.log(`ERROR: ${msg}`);

          // Record infrastructure failure
          const result: TaskResult = {
            taskId: task.id,
            category: task.category,
            success: false,
            reason: `INFRASTRUCTURE: ${msg}`,
            modelCalls: 0,
            toolCalls: 0,
            rejectedActions: 0,
            duplicateActions: 0,
            noopActions: 0,
            totalTokens: 0,
            executionTime: Date.now() - startTime,
            condition,
            rep,
            retrievalTokens: 0,
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

  // Final checkpoint save
  saveCheckpoint({ results, completedKeys: [...completedKeys] }, resultsDir);

  console.log(`\n=== PHASE 1 COMPLETE ===`);
  console.log(`Executed: ${executed}`);
  console.log(`Succeeded: ${succeeded} (${((succeeded / executed) * 100).toFixed(1)}%)`);

  return results;
}

// ─── Analysis Functions ───────────────────────────────────────────────────────

export function analyzeResults(results: TaskResult[]): string {
  const lines: string[] = [];

  // Overall by condition
  lines.push("## Overall Results by Condition\n");
  for (const cond of CONDITIONS) {
    const condResults = results.filter((r) => r.condition === cond);
    const success = condResults.filter((r) => r.success).length;
    const total = condResults.length;
    const rate = total > 0 ? ((success / total) * 100).toFixed(1) : "0.0";
    const avgCalls = total > 0
      ? (condResults.reduce((s, r) => s + r.modelCalls, 0) / total).toFixed(1)
      : "0";
    const avgTokens = total > 0
      ? Math.round(condResults.reduce((s, r) => s + r.totalTokens, 0) / total)
      : 0;
    const avgTime = total > 0
      ? (condResults.reduce((s, r) => s + r.executionTime, 0) / total / 1000).toFixed(1)
      : "0";

    lines.push(`| ${cond} | ${success}/${total} | ${rate}% | ${avgCalls} | ${avgTokens} | ${avgTime}s |`);
  }

  // Conversions and regressions
  lines.push("\n## Conversions and Regressions\n");
  const modelOnlyResults = results.filter((r) => r.condition === "MODEL_ONLY");
  for (const cond of CONDITIONS.filter((c) => c !== "MODEL_ONLY")) {
    const condResults = results.filter((r) => r.condition === cond);
    const conversions = condResults.filter((r) => {
      const mo = modelOnlyResults.find((m) => m.taskId === r.taskId && m.rep === r.rep);
      return mo && !mo.success && r.success;
    });
    const regressions = condResults.filter((r) => {
      const mo = modelOnlyResults.find((m) => m.taskId === r.taskId && m.rep === r.rep);
      return mo && mo.success && !r.success;
    });

    lines.push(`### ${cond} vs MODEL_ONLY`);
    lines.push(`- Conversions: ${conversions.length}`);
    for (const c of conversions) {
      lines.push(`  - ${c.taskId} rep${c.rep}`);
    }
    lines.push(`- Regressions: ${regressions.length}`);
    for (const r of regressions) {
      lines.push(`  - ${r.taskId} rep${r.rep} (${r.reason})`);
    }
    lines.push("");
  }

  // Category analysis
  lines.push("## Category Results\n");
  const categories = [...new Set(results.map((r) => r.category))];
  lines.push("| Category | MODEL_ONLY | MINIMAL | RETRIEVAL | FULL |");
  lines.push("|---|---|---|---|---|");
  for (const cat of categories) {
    const row = CONDITIONS.map((cond) => {
      const catCond = results.filter((r) => r.category === cat && r.condition === cond);
      const success = catCond.filter((r) => r.success).length;
      return `${success}/${catCond.length}`;
    });
    lines.push(`| ${cat} | ${row.join(" | ")} |`);
  }

  // Failure classification
  lines.push("\n## Failure Classification\n");
  const failures = results.filter((r) => !r.success);
  const classifications: Record<string, number> = {};
  for (const f of failures) {
    let cls = "reasoning_failure";
    if (f.reason.startsWith("INFRASTRUCTURE:")) cls = "infrastructure";
    else if (f.reason.includes("exhausted")) cls = "budget_exhaustion";
    else if (f.reason.includes("duplicate")) cls = "repeated_action";
    else if (f.reason.includes("could not parse")) cls = "action_parse_failure";
    classifications[cls] = (classifications[cls] ?? 0) + 1;
  }
  for (const [cls, count] of Object.entries(classifications).sort((a, b) => b[1] - a[1])) {
    lines.push(`- ${cls}: ${count}`);
  }

  return lines.join("\n");
}

// ─── Direct Execution ─────────────────────────────────────────────────────────

const isMainModule = process.argv[1] &&
  (process.argv[1].endsWith("phase1-runner.ts") || process.argv[1].endsWith("phase1-runner.js"));

if (isMainModule) {
  runPhase1()
    .then((results) => {
      const analysis = analyzeResults(results);
      const reportDir = path.join(process.cwd(), "benchmarks", "results", "phase1");
      fs.mkdirSync(reportDir, { recursive: true });
      fs.writeFileSync(path.join(reportDir, "analysis.md"), analysis, "utf-8");
      fs.writeFileSync(path.join(reportDir, "results.json"), JSON.stringify(results, null, 2), "utf-8");
      console.log(`\nResults saved to ${reportDir}`);
      console.log(analysis);
    })
    .catch((err) => {
      console.error("Phase 1 failed:", err);
      process.exit(1);
    });
}
