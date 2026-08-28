import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { TASKS } from "../src/benchmark/tasks.js";
import { runScaffoldLoop } from "../src/execution/scaffold-loop.js";
import { buildDeps } from "./phase6-runner.js";
import type { ConditionSpec as P6ConditionSpec } from "./phase6-runner.js";
import type { TaskDefinition } from "../src/benchmark/types.js";

// ─── Phase 7: RETRIEVAL_75 validation vs FULL_CONTROL ────────────────────────
// Runs ONLY FULL_CONTROL and RETRIEVAL_75, 10 reps x 20 tasks each = 400 execs.
// Results stored SEPARATELY in benchmarks/results/phase7/. Nothing in Phase 0-6
// is read for analysis (fresh run); Phase 0-6 results are never written.

const SELECTED_IDS = [
  "ST1", "ST2", "MS1", "MS2", "ER1", "ER2",
  "TO1", "TO2", "CP1", "CP2", "CF1", "CF2",
  "AS1", "AS2", "CV1", "CV2", "RA1", "RA2",
  "DC1", "DC2",
] as const;

export interface Phase7Condition {
  readonly id: "FULL_CONTROL" | "RETRIEVAL_75";
  readonly spec: P6ConditionSpec;
}

export const PHASE7_CONDITIONS: Phase7Condition[] = [
  { id: "FULL_CONTROL", spec: { id: "FULL_CONTROL", state: "FULL_STATE", feedback: "FULL_FEEDBACK", retrieval: "FULL" } },
  { id: "RETRIEVAL_75", spec: { id: "RETRIEVAL_75", state: "FULL_STATE", feedback: "FULL_FEEDBACK", retrieval: "RETRIEVAL_75" } },
];

const REPS = 10;

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

// Per-execution hard timeout (infrastructure containment only; NOT a change to
// the cognitive mechanism). A single hung model/HTTP request must not stall or
// kill the whole run — it is classified as an infrastructure failure instead.
const EXEC_TIMEOUT_MS = 150_000;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`INFRASTRUCTURE: execution timeout (${ms}ms) after ${label}`)), ms);
    p.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); }
    );
  });
}

export interface Phase7Result {
  readonly model: string;
  readonly contextSize: number;
  readonly temperature: number;
  readonly topP: string;
  readonly seed: string;
  readonly outputLimit: number;
  readonly condition: string;
  readonly taskId: string;
  readonly category: string;
  readonly rep: number;
  readonly success: boolean;
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
  readonly failureClass: string;
  readonly reason: string;
  readonly actionSequence: string[];
  readonly orderPosition: number;
}

interface Checkpoint {
  results: Phase7Result[];
  completedKeys: string[];
  orderLog: { rep: number; taskId: string; condOrder: [string, string] }[];
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

function setupWorkspace(task: TaskDefinition): string {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "scaffold-phase7-"));
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

export async function runPhase7(): Promise<Phase7Result[]> {
  const selectedTasks = TASKS.filter((t) => (SELECTED_IDS as readonly string[]).includes(t.id));
  const resultsDir = path.join(process.cwd(), "benchmarks", "results", "phase7");
  const checkpoint = loadCheckpoint(resultsDir) ?? { results: [], completedKeys: [], orderLog: [] };
  const completedKeys = new Set(checkpoint.completedKeys);
  const results: Phase7Result[] = [...checkpoint.results];
  const orderLog: Checkpoint["orderLog"] = [...checkpoint.orderLog];

  let executed = 0;

  console.log(`\n=== PHASE 7: RETRIEVAL_75 VALIDATION & ROBUSTNESS ===`);
  console.log(`Model: ${INFERENCE_PARAMS.modelId}`);
  console.log(`Context: ${INFERENCE_PARAMS.contextSize} tokens (hard cap, unmodified)`);
  console.log(`Conditions: FULL_CONTROL vs RETRIEVAL_75 (ONLY)`);
  console.log(`Tasks: ${selectedTasks.length}; Reps/condition: ${REPS}; Total: ${selectedTasks.length * PHASE7_CONDITIONS.length * REPS}`);

  // Balanced ordering:
  //  - Task order rotates per rep (offset = rep).
  //  - For each (rep, task), the two conditions are interleaved adjacently, their
  //    order alternating by (rep + task-index) parity. This avoids running one
  //    condition entirely before the other.
  const repTaskOrders: string[][] = [];
  for (let rep = 0; rep < REPS; rep++) {
    const offset = rep % selectedTasks.length;
    repTaskOrders.push([...selectedTasks.slice(offset), ...selectedTasks.slice(0, offset)].map((t) => t.id));
  }

  let globalOrderPos = results.length;
  for (let rep = 0; rep < REPS; rep++) {
    console.log(`\n--- Rep ${rep} (task order: ${repTaskOrders[rep]!.slice(0, 6).join(", ")} ...) ---`);
    for (let ti = 0; ti < selectedTasks.length; ti++) {
      const task = selectedTasks[ti]!;
      const condOrder: [string, string] = (rep + ti) % 2 === 0
        ? ["FULL_CONTROL", "RETRIEVAL_75"]
        : ["RETRIEVAL_75", "FULL_CONTROL"];
      const blockBothDone = condOrder.every((cid) => completedKeys.has(`${task.id}|${cid}|${rep}`));
      if (!blockBothDone) orderLog.push({ rep, taskId: task.id, condOrder });
      for (const condId of condOrder) {
        const cond = PHASE7_CONDITIONS.find((c) => c.id === condId)!;
        const key = `${task.id}|${cond.id}|${rep}`;
        if (completedKeys.has(key)) {
          console.log(`  SKIP ${task.id} ${cond.id} rep${rep} (checkpoint)`);
          globalOrderPos++;
          continue;
        }
        const startTime = Date.now();
        process.stdout.write(`  ${task.id} ${cond.id} rep${rep}... `);
        const workspaceDir = setupWorkspace(task);
        try {
          const built = buildDeps(cond.spec, workspaceDir);
          const loopResult = await withTimeout(
            runScaffoldLoop(task.objective, built.deps, {
              maxActions: INFERENCE_PARAMS.maxActions,
              temperature: INFERENCE_PARAMS.temperature,
              maxTokens: INFERENCE_PARAMS.maxTokens,
              governorEnabled: true,
            }),
            EXEC_TIMEOUT_MS,
            `${task.id}/${cond.id}/rep${rep}`
          );
          const retrievalCalls = built.retrievalCalls;
          const actions = loopResult.state.attemptedActions.map((a) => {
            const p = a.split(" ");
            return { success: !loopResult.state.failedActions.includes(a), actionType: p[0] ?? "unknown", target: p.slice(1).join(" ") || undefined };
          });
          const verification = task.verify(workspaceDir, actions);
          const budgetExhausted = loopResult.modelCalls >= INFERENCE_PARAMS.maxActions && !verification.success;
          const failureClass = verification.success ? "success" : classifyFailure(verification.reason, loopResult.modelCalls, INFERENCE_PARAMS.maxActions);

          const result: Phase7Result = {
            model: INFERENCE_PARAMS.modelId,
            contextSize: INFERENCE_PARAMS.contextSize,
            temperature: INFERENCE_PARAMS.temperature,
            topP: INFERENCE_PARAMS.topP,
            seed: INFERENCE_PARAMS.seed,
            outputLimit: INFERENCE_PARAMS.maxTokens,
            condition: cond.id,
            taskId: task.id,
            category: task.category,
            rep,
            success: verification.success,
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
            failureClass,
            reason: verification.reason,
            actionSequence: loopResult.state.attemptedActions,
            orderPosition: globalOrderPos,
          };
          results.push(result);
          completedKeys.add(key);
          executed++;
          globalOrderPos++;
          console.log(`${verification.success ? "PASS" : "FAIL"} (${((Date.now() - startTime) / 1000).toFixed(1)}s, ${loopResult.modelCalls} calls, ${loopResult.totalTokens} tok)`);
          if (executed % 5 === 0) saveCheckpoint({ results, completedKeys: [...completedKeys], orderLog }, resultsDir);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          const result: Phase7Result = {
            model: INFERENCE_PARAMS.modelId,
            contextSize: INFERENCE_PARAMS.contextSize,
            temperature: INFERENCE_PARAMS.temperature,
            topP: INFERENCE_PARAMS.topP,
            seed: INFERENCE_PARAMS.seed,
            outputLimit: INFERENCE_PARAMS.maxTokens,
            condition: cond.id,
            taskId: task.id,
            category: task.category,
            rep,
            success: false,
            modelCalls: 0, toolCalls: 0, successfulToolCalls: 0,
            rejectedActions: 0, duplicateActions: 0, noopActions: 0,
            promptTokens: 0, completionTokens: 0, totalTokens: 0,
            feedbackTokens: 0, retrievalTokens: 0, retrievalCalls: 0,
            executionTime: Date.now() - startTime,
            budgetExhausted: false,
            failureClass: "infrastructure",
            reason: `INFRASTRUCTURE: ${msg}`,
            actionSequence: [],
            orderPosition: globalOrderPos,
          };
          results.push(result);
          completedKeys.add(key);
          executed++;
          globalOrderPos++;
          console.log(`ERROR: ${msg}`);
        } finally {
          cleanupWorkspace(workspaceDir);
        }
      }
    }
  }

  saveCheckpoint({ results, completedKeys: [...completedKeys], orderLog }, resultsDir);
  console.log(`\n=== PHASE 7 RUN COMPLETE ===`);
  console.log(`Executed this pass: ${executed}; Cumulative results: ${results.length}`);
  return results;
}
