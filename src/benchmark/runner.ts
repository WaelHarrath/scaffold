import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { TaskDefinition, TaskResult } from "./types.js";
import type { ReasoningModel } from "../model/types.js";
import { runScaffoldLoop, type ScaffoldDeps } from "../execution/scaffold-loop.js";

export interface RunConfig {
  readonly reps: number;
  readonly conditions: string[];
  readonly temperature: number;
  readonly maxTokens: number;
  readonly maxActions: number;
}

function setupWorkspace(task: TaskDefinition): string {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "scaffold-bench-"));
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
    // best-effort cleanup
  }
}

function saveCheckpoint(results: TaskResult[], checkpointPath: string): void {
  fs.mkdirSync(path.dirname(checkpointPath), { recursive: true });
  fs.writeFileSync(checkpointPath, JSON.stringify(results, null, 2), "utf-8");
}

function loadCheckpoint(checkpointPath: string): TaskResult[] | null {
  try {
    if (fs.existsSync(checkpointPath)) {
      return JSON.parse(fs.readFileSync(checkpointPath, "utf-8")) as TaskResult[];
    }
  } catch {
    // corrupt checkpoint, start fresh
  }
  return null;
}

function collectActionsFromLoop(
  state: import("../state/state.js").TaskState,
): { success: boolean; actionType: string; target?: string }[] {
  return state.attemptedActions.map((a) => {
    const parts = a.split(" ");
    return {
      success: !state.failedActions.includes(a),
      actionType: parts[0] ?? "unknown",
      target: parts.slice(1).join(" ") || undefined,
    };
  });
}

export async function runBenchmark(
  tasks: readonly TaskDefinition[],
  _model: ReasoningModel,
  config: RunConfig,
  conditionBuilder: (condition: string) => ScaffoldDeps,
): Promise<TaskResult[]> {
  const results: TaskResult[] = [];
  const checkpointDir = path.join(
    process.cwd(),
    "benchmarks",
    "results",
    `run-${Date.now()}`,
  );
  const checkpointPath = path.join(checkpointDir, "checkpoint.json");

  const existing = loadCheckpoint(checkpointPath);
  if (existing && existing.length > 0) {
    results.push(...existing);
  }

  const completedKeys = new Set(
    results.map((r) => `${r.taskId}|${r.condition}|${r.rep}`),
  );

  for (let rep = 0; rep < config.reps; rep++) {
    for (const task of tasks) {
      for (const condition of config.conditions) {
        const key = `${task.id}|${condition}|${rep}`;
        if (completedKeys.has(key)) {
          continue;
        }

        const workspaceDir = setupWorkspace(task);
        try {
          const deps = conditionBuilder(condition);
          const loopResult = await runScaffoldLoop(task.objective, deps, {
            maxActions: config.maxActions,
            temperature: config.temperature,
            maxTokens: config.maxTokens,
          });

          const actions = collectActionsFromLoop(loopResult.state);
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
          saveCheckpoint(results, checkpointPath);
        } finally {
          cleanupWorkspace(workspaceDir);
        }
      }
    }
  }

  return results;
}
