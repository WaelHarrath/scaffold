import type { ReasoningModel } from "../model/types.js";
import type { TaskState } from "../state/state.js";
import { createInitialState, cloneState } from "../state/state.js";
import { type Executor } from "./executor.js";
import { type GovernorState, govern, recordExecution } from "./governor.js";
import { type FeedbackResult, formatFeedback } from "../feedback/feedback.js";
import { parseAction } from "../cognition/action-parser.js";

export interface LoopConfig {
  readonly maxActions: number;
  readonly temperature: number;
  readonly maxTokens: number;
  readonly governorEnabled?: boolean;
}

export interface LoopResult {
  readonly state: TaskState;
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
  readonly executionTime: number;
  readonly retrievalTokens: number;
  readonly feedbackTokens: number;
}

export interface ScaffoldDeps {
  readonly model: ReasoningModel;
  readonly executor: Executor;
  readonly governor: GovernorState;
  readonly systemPrompt: string;
  readonly formatPrompt: (state: TaskState, feedback: string | null, retrieved?: string) => string | Promise<string>;
  readonly selectContext?: (state: TaskState, observation: string | null) => string;
  readonly formatFeedback?: (result: FeedbackResult) => string;
  readonly retrieve?: (state: TaskState, observation: string | null) => Promise<{ text: string; tokens: number }>;
}

const DEFAULT_CONFIG: LoopConfig = {
  maxActions: 20,
  temperature: 0.1,
  maxTokens: 512,
};

function buildDefaultFeedback(result: FeedbackResult): string {
  return formatFeedback(result);
}

export async function runScaffoldLoop(
  task: string,
  deps: ScaffoldDeps,
  config?: Partial<LoopConfig>,
): Promise<LoopResult> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const startTime = Date.now();

  let state = createInitialState(task);
  let governor = deps.governor;
  const feedbackFormatter = deps.formatFeedback ?? buildDefaultFeedback;

  let modelCalls = 0;
  let toolCalls = 0;
  let successfulToolCalls = 0;
  let rejectedActions = 0;
  let duplicateActions = 0;
  let noopActions = 0;
  let promptTokens = 0;
  let completionTokens = 0;
  let totalTokens = 0;
  let retrievalTokens = 0;
  let feedbackTokens = 0;

  let lastFeedback: string | null = null;
  let lastObservation: string | null = null;

  for (let step = 0; step < cfg.maxActions; step++) {
    // Retrieve if callback provided
    let retrieved: string | undefined;
    if (deps.retrieve) {
      const r = await deps.retrieve(state, lastObservation);
      retrieved = r.text;
      retrievalTokens += r.tokens;
    }

    // Format prompt
    const userPrompt = await deps.formatPrompt(state, lastFeedback, retrieved);

    // Call model
    const response = await deps.model.generate({
      systemPrompt: deps.systemPrompt,
      userPrompt,
      maxTokens: cfg.maxTokens,
      temperature: cfg.temperature,
    });
    modelCalls++;
    promptTokens += response.usage.promptTokens;
    completionTokens += response.usage.completionTokens;
    totalTokens += response.usage.totalTokens;

    // Parse action
    const action = parseAction(response.content);
    if (!action) {
      lastFeedback = feedbackFormatter({
        action: { type: "inspect" },
        success: false,
        progress: "NO",
        changed: [],
        output: null,
        error: "could not parse model output as action",
        reason: null,
      });
      lastObservation = null;
      continue;
    }

    // Finish: verify and break
    if (action.type === "finish") {
      const updated = cloneState(state);
      updated.completionStatus = "completed";
      updated.lastAction = `finish ${action.target ?? ""}`;
      updated.lastResult = "task marked complete";
      state = updated;

      return {
        state,
        success: true,
        reason: action.target ?? "model signaled completion",
        modelCalls,
        toolCalls,
        successfulToolCalls,
        rejectedActions,
        duplicateActions,
        noopActions,
        promptTokens,
        completionTokens,
        totalTokens,
        executionTime: Date.now() - startTime,
        retrievalTokens,
        feedbackTokens,
      };
    }

    // Governor check
    if (cfg.governorEnabled !== false) {
      const decision = govern(governor, action, lastObservation !== null);
      if (!decision.allowed) {
        rejectedActions++;
        if (decision.rejectionType === "duplicate") {
          duplicateActions++;
        }
        lastFeedback = feedbackFormatter({
          action,
          success: false,
          progress: "NO",
          changed: [],
          output: null,
          error: null,
          reason: decision.reason,
        });
        lastObservation = null;
        continue;
      }
    }

    // Execute
    const execResult = await deps.executor.execute(action);
    toolCalls++;
    if (execResult.success) {
      successfulToolCalls++;
    }

    const changed = execResult.filesChanged;
    if (execResult.success && changed.length === 0 && (action.type === "inspect" || action.type === "search")) {
      noopActions++;
    }

    governor = recordExecution(governor, action, execResult.success, changed.length > 0);

    // Build feedback
    const feedbackResult: FeedbackResult = {
      action,
      success: execResult.success,
      progress: execResult.success ? "YES" : "NO",
      changed,
      output: execResult.output || null,
      error: execResult.error,
      reason: null,
    };

    lastFeedback = feedbackFormatter(feedbackResult);
    feedbackTokens += Math.ceil(lastFeedback.length / 4);
    lastObservation = execResult.success ? execResult.output : null;

    // Update state
    const updated = cloneState(state);
    updated.lastAction = `${action.type} ${action.target ?? ""}`;
    updated.lastResult = execResult.success ? (execResult.output.slice(0, 200) || "ok") : (execResult.error?.slice(0, 200) ?? "failed");
    updated.progress = execResult.success ? "YES" : "NO";
    updated.attemptedActions.push(updated.lastAction);

    if (changed.length > 0) {
      for (const f of changed) {
        if (!updated.relevantFiles.includes(f)) {
          updated.relevantFiles.push(f);
        }
      }
      updated.currentFile = changed[0]!;
    }

    if (!execResult.success && execResult.error) {
      updated.failedActions.push(updated.lastAction);
    }

    state = updated;
  }

  return {
    state,
    success: false,
    reason: `exhausted ${cfg.maxActions} actions without completion`,
    modelCalls,
    toolCalls,
    successfulToolCalls,
    rejectedActions,
    duplicateActions,
    noopActions,
    promptTokens,
    completionTokens,
    totalTokens,
    executionTime: Date.now() - startTime,
    retrievalTokens,
    feedbackTokens,
  };
}
