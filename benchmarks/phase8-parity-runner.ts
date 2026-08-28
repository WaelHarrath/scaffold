import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { TASKS } from "../src/benchmark/tasks.js";
import { runScaffoldLoop } from "../src/execution/scaffold-loop.js";
import { buildDeps } from "./phase6-runner.js";
import type { ConditionSpec } from "./phase6-runner.js";
import type { TaskDefinition } from "../src/benchmark/types.js";

// ─── Phase 8 (parity): ADAPTIVE_HYBRID vs RETRIEVAL_75 ───────────────────────
// Goal: EMPIRICAL proof-of-parity. The structural audit shows no task file
// exceeds 225 chars, so the truncation-triggered adaptive policy can never fire
// (0 expansions). This run empirically confirms that wiring ADAPTIVE_HYBRID into
// the real retrieval path produces identical retrieval tokens/completion to the
// fixed RETRIEVAL_75 baseline — i.e. adaptive retrieval cannot recover anything
// on a benchmark whose sources all fit within the base slice.
//
// Two conditions: RETRIEVAL_75 (fixed) and ADAPTIVE_HYBRID (deterministic,
// truncation-triggered). Modest rep count = short proof-of-parity, NOT a full
// comparative benchmark (a full run would be redundant with this negative proof).

const SELECTED_IDS = [
  "ST1", "ST2", "MS1", "MS2", "ER1", "ER2",
  "TO1", "TO2", "CP1", "CP2", "CF1", "CF2",
  "AS1", "AS2", "CV1", "CV2", "RA1", "RA2",
  "DC1", "DC2",
] as const;

export interface Phase8Condition {
  readonly id: "RETRIEVAL_75" | "ADAPTIVE_HYBRID";
  readonly spec: ConditionSpec;
}

export const PHASE8_CONDITIONS: Phase8Condition[] = [
  { id: "RETRIEVAL_75", spec: { id: "RETRIEVAL_75", state: "FULL_STATE", feedback: "FULL_FEEDBACK", retrieval: "RETRIEVAL_75" } },
  { id: "ADAPTIVE_HYBRID", spec: { id: "ADAPTIVE_HYBRID", state: "FULL_STATE", feedback: "FULL_FEEDBACK", retrieval: "RETRIEVAL_75", adaptive: "ADAPTIVE_HYBRID" } },
];

const REPS = 5; // short proof-of-parity

const INFERENCE_PARAMS = {
  modelId: "qwen3:4b-instruct",
  temperature: 0.1,
  maxTokens: 256,
  maxActions: 20,
  contextSize: 4096,
  reservedOutput: 256,
  inputBudget: 3840,
} as const;

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

export interface Phase8Result {
  readonly model: string;
  readonly contextSize: number;
  readonly temperature: number;
  readonly condition: string;
  readonly taskId: string;
  readonly category: string;
  readonly rep: number;
  readonly success: boolean;
  readonly modelCalls: number;
  readonly toolCalls: number;
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly totalTokens: number;
  readonly retrievalTokens: number;
  readonly retrievalCalls: number;
  readonly executionTime: number;
  readonly failureClass: string;
  readonly reason: string;
  readonly orderPosition: number;
}

interface Checkpoint {
  results: Phase8Result[];
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

function setupWorkspace(task: TaskDefinition): string {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "scaffold-phase8-"));
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

export async function runPhase8(): Promise<Phase8Result[]> {
  const selectedTasks = TASKS.filter((t) => (SELECTED_IDS as readonly string[]).includes(t.id));
  const resultsDir = path.join(process.cwd(), "benchmarks", "results", "phase8");
  const checkpoint = loadCheckpoint(resultsDir) ?? { results: [], completedKeys: [] };
  const completedKeys = new Set(checkpoint.completedKeys);
  const results: Phase8Result[] = [...checkpoint.results];

  let executed = 0;

  console.log(`\n=== PHASE 8 (PARITY): ADAPTIVE_HYBRID vs RETRIEVAL_75 ===`);
  console.log(`Model: ${INFERENCE_PARAMS.modelId}`);
  console.log(`Context: ${INFERENCE_PARAMS.contextSize} tokens (hard cap, unmodified)`);
  console.log(`Conditions: RETRIEVAL_75 vs ADAPTIVE_HYBRID (proof-of-parity only)`);
  console.log(`Tasks: ${selectedTasks.length}; Reps/condition: ${REPS}; Total: ${selectedTasks.length * PHASE8_CONDITIONS.length * REPS}`);

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
      const condOrder: ("RETRIEVAL_75" | "ADAPTIVE_HYBRID")[] = (rep + ti) % 2 === 0
        ? ["RETRIEVAL_75", "ADAPTIVE_HYBRID"]
        : ["ADAPTIVE_HYBRID", "RETRIEVAL_75"];
      for (const condId of condOrder) {
        const cond = PHASE8_CONDITIONS.find((c) => c.id === condId)!;
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
          const failureClass = verification.success ? "success" : classifyFailure(verification.reason, loopResult.modelCalls, INFERENCE_PARAMS.maxActions);

          const result: Phase8Result = {
            model: INFERENCE_PARAMS.modelId,
            contextSize: INFERENCE_PARAMS.contextSize,
            temperature: INFERENCE_PARAMS.temperature,
            condition: cond.id,
            taskId: task.id,
            category: task.category,
            rep,
            success: verification.success,
            modelCalls: loopResult.modelCalls,
            toolCalls: loopResult.toolCalls,
            promptTokens: loopResult.promptTokens,
            completionTokens: loopResult.completionTokens,
            totalTokens: loopResult.totalTokens,
            retrievalTokens: loopResult.retrievalTokens,
            retrievalCalls: retrievalCalls(),
            executionTime: loopResult.executionTime,
            failureClass,
            reason: verification.reason,
            orderPosition: globalOrderPos,
          };
          results.push(result);
          completedKeys.add(key);
          executed++;
          globalOrderPos++;
          console.log(`${verification.success ? "PASS" : "FAIL"} (${((Date.now() - startTime) / 1000).toFixed(1)}s, ${loopResult.modelCalls} calls, ${loopResult.totalTokens} tok)`);
          if (executed % 5 === 0) saveCheckpoint({ results, completedKeys: [...completedKeys] }, resultsDir);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          const result: Phase8Result = {
            model: INFERENCE_PARAMS.modelId,
            contextSize: INFERENCE_PARAMS.contextSize,
            temperature: INFERENCE_PARAMS.temperature,
            condition: cond.id,
            taskId: task.id,
            category: task.category,
            rep,
            success: false,
            modelCalls: 0, toolCalls: 0,
            promptTokens: 0, completionTokens: 0, totalTokens: 0,
            retrievalTokens: 0, retrievalCalls: 0,
            executionTime: Date.now() - startTime,
            failureClass: "infrastructure",
            reason: `INFRASTRUCTURE: ${msg}`,
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

  saveCheckpoint({ results, completedKeys: [...completedKeys] }, resultsDir);
  console.log(`\n=== PHASE 8 PARITY RUN COMPLETE ===`);
  console.log(`Executed this pass: ${executed}; Cumulative results: ${results.length}`);
  return results;
}
