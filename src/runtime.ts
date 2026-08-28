import * as fs from "node:fs";
import * as path from "node:path";
import type { ReasoningModel, EmbeddingModel } from "./model/types.js";
import { Qwen3Adapter } from "./model/qwen3.js";
import { MiniLMAdapter } from "./model/embedding.js";
import { EmbeddingCache } from "./retrieval/embedding-cache.js";
import { SemanticRetriever, type RetrievalItem } from "./retrieval/retriever.js";
import { createExecutor } from "./execution/executor.js";
import { createSecureExecutor } from "./secure-executor.js";
import { createGovernorState } from "./execution/governor.js";
import { runScaffoldLoop, type ScaffoldDeps, type LoopResult } from "./execution/scaffold-loop.js";
import { SYSTEM_PROMPT } from "./execution/system-prompt.js";
import { formatRetrievalBudgeted } from "./execution/format-compress.js";
import { formatFeedbackCompressed } from "./execution/format-compress.js";
import { estimateTokens } from "./context/context-budget.js";
import {
  resolveConfig,
  type ResolvedScaffoldConfig,
  type ScaffoldRuntimeConfig,
} from "./config.js";
import {
  ScaffoldError,
  ModelError,
  TimeoutError,
  CancelledError,
  RuntimeError,
} from "./errors.js";
import { createLogger, type Logger, type LogLevel } from "./logger.js";
import {
  createToolRegistry,
  createToolExecutor,
  type ScaffoldTool,
  type ToolRegistry,
} from "./tools.js";

/** Structured result returned to the host application. */
export interface ScaffoldResult {
  /** Whether the task completed with a successful finish signal. */
  readonly success: boolean;
  /** Final model/finish response text. */
  readonly response: string;
  /** Ordered action descriptions attempted during execution. */
  readonly actions: string[];
  /** Errors observed during execution (executor/tool failures), redacted. */
  readonly errors: string[];
  /** Total wall-clock duration of the execution in milliseconds. */
  readonly durationMs: number;
  /** Reasoning model id used. */
  readonly model: string;
  /** Number of model calls made. */
  readonly modelCalls: number;
  /** Number of tool (action) executions attempted (incl. failed). */
  readonly toolCalls: number;
  /** Token estimates collected from the model provider. */
  readonly tokenEstimates: {
    readonly promptTokens: number;
    readonly completionTokens: number;
    readonly totalTokens: number;
    readonly feedbackTokens: number;
    readonly retrievalTokens: number;
  };
  /** Retrieval statistics (representative counts only — no retrieved content). */
  readonly retrievalStats: {
    readonly enabled: boolean;
    readonly calls: number;
    readonly tokens: number;
  };
  /** Why execution ended. */
  readonly terminationReason:
    | "completed"
    | "exhausted"
    | "timeout"
    | "cancelled"
    | "error";
  /** Stable identifier for this execution. */
  readonly executionId: string;
  /** Registered tool invocation summaries (name + success only). */
  readonly toolExecutions: readonly { readonly toolName: string; readonly success: boolean }[];
}

export interface ExecuteOptions {
  /** Abort/cancel support. Aborting rejects execute with a CancelledError. */
  readonly signal?: AbortSignal;
  /** Per-call temperature override (defaults to config temperature). */
  readonly temperature?: number;
  /** Per-call max actions override (defaults to config maxActions). */
  readonly maxActions?: number;
  /** Per-call max output tokens override (defaults to config maxOutputTokens). */
  readonly maxOutputTokens?: number;
}

export interface Scaffold {
  readonly config: ResolvedScaffoldConfig;
  registerTool(tool: ScaffoldTool): void;
  registerTools(tools: readonly ScaffoldTool[]): void;
  execute(task: string, options?: ExecuteOptions): Promise<ScaffoldResult>;
  /** Primary alias of {@link Scaffold.execute}. */
  run(task: string, options?: ExecuteOptions): Promise<ScaffoldResult>;
  readonly logger: Logger;
}

export interface CreateScaffoldOptions {
  /** Runtime configuration (validated at construction). */
  readonly config?: ScaffoldRuntimeConfig;
  /** Inject a reasoning model (primarily for testing / custom providers). */
  readonly model?: ReasoningModel;
  /** Inject an embedding model (primarily for testing / custom providers). */
  readonly embeddingModel?: EmbeddingModel;
  /** Logging level or a custom logger. */
  readonly logger?: LogLevel | Logger;
}

export function createScaffold(options: CreateScaffoldOptions = {}): Scaffold {
  const config = resolveConfig(options.config ?? {});
  const logger = typeof options.logger === "string" || options.logger === undefined
    ? createLogger(options.logger ?? ("info" as LogLevel))
    : options.logger;

  const registry: ToolRegistry = createToolRegistry();
  const rawModel: ReasoningModel = options.model ?? new Qwen3Adapter(config.contextWindow, config.ollamaEndpoint);
  const model: ReasoningModel = wrapModel(rawModel, logger);
  const embeddingModel: EmbeddingModel = options.embeddingModel ?? new MiniLMAdapter(config.ollamaEndpoint);

  const retriever = new SemanticRetriever(embeddingModel, new EmbeddingCache(500));
  let retrievalCallCount = 0;

  function buildDeps(executeOpts: ExecuteOptions, workingDir: string): ScaffoldDeps {
    const baseExecutor = createExecutor(workingDir);
    const secureBase = createSecureExecutor(baseExecutor, workingDir, {
      containment: { enabled: config.workspaceContainment, followSymlinks: true },
      redact: config.redactSecrets ? { secretStrings: [] } : { extraPatterns: [] },
    });
    const useRetrieval = config.retrievalEnabled;
    let cachedItems: RetrievalItem[] | null = null;

    const formatPrompt = (state: import("./state/state.js").TaskState, feedback: string | null, retrieved?: string): string => {
      const parts: string[] = [];
      parts.push(`TASK: ${state.task}`);
      const stateEnabled = config.stateEnabled;
      if (stateEnabled) {
        const bits: string[] = [];
        if (state.lastAction) bits.push(`last=${state.lastAction}`);
        if (state.progress !== "UNKNOWN") bits.push(`progress=${state.progress}`);
        if (state.relevantFiles.length > 0) bits.push(`files=${state.relevantFiles.join(",")}`);
        if (state.completionStatus !== "in_progress") bits.push(`status=${state.completionStatus}`);
        if (state.failedActions.length > 0) bits.push(`failed=${state.failedActions.length}`);
        if (bits.length > 0) parts.push(`STATE: ${bits.join("; ")}`);
      }
      if (retrieved) parts.push(`RELEVANT: ${retrieved}`);
      if (config.feedbackEnabled && feedback) parts.push(`FEEDBACK: ${feedback}`);
      return parts.join("\n");
    };

    const formatFeedbackFn = config.feedbackEnabled
      ? (r: import("./feedback/feedback.js").FeedbackResult) => formatFeedbackCompressed(r, "FULL_FEEDBACK")
      : undefined;

    void executeOpts;

    const deps: ScaffoldDeps = {
      model,
      executor: createToolExecutor(secureBase, registry),
      governor: createGovernorState(),
      systemPrompt: SYSTEM_PROMPT,
      formatPrompt,
      ...(formatFeedbackFn ? { formatFeedback: formatFeedbackFn } : {}),
      ...(useRetrieval
        ? {
            retrieve: async (state: import("./state/state.js").TaskState, _observation: string | null) => {
              retrievalCallCount++;
              if (!cachedItems) cachedItems = readWorkspaceFiles(workingDir);
              const items = cachedItems;
              if (items.length === 0) return { text: "", tokens: 0 };
              try {
                const query = `${state.task} ${state.lastAction ?? ""} ${state.currentGoal ?? ""}`.slice(0, 500);
                const topK = config.retrievalTopK;
                const results = await retriever.retrieve(query, items, Math.max(1, topK));
                const ranked = results
                  .map((res) => ({ id: res.id, content: items.find((i) => i.id === res.id)?.content ?? "" }))
                  .filter((i) => i.content.length > 0);
                const text = formatRetrievalBudgeted(ranked, config.retrievalBudget);
                return { text, tokens: estimateTokens(text) };
              } catch (err) {
                logger.warn(`retrieval unavailable, continuing without it: ${err instanceof Error ? err.message : String(err)}`);
                return { text: "", tokens: 0 };
              }
            },
          }
        : {}),
    };
    return deps;
  }

  async function execute(task: string, executeOpts: ExecuteOptions = {}): Promise<ScaffoldResult> {
    const startTime = Date.now();
    const executionId = makeExecutionId();
    const workingDir = config.workingDirectory;

    const abortController = new AbortController();
    const onAbort = () => abortController.abort();
    executeOpts.signal?.addEventListener("abort", onAbort, { once: true });
    if (executeOpts.signal?.aborted) {
      abortController.abort();
    }

    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    if (config.executionTimeoutMs > 0) {
      timeoutHandle = setTimeout(
        () => abortController.abort(new TimeoutError(`execution timed out after ${config.executionTimeoutMs}ms`)),
        config.executionTimeoutMs,
      );
    }

    try {
      const deps = buildDeps(executeOpts, workingDir);
      const loopTask = runScaffoldLoop(task, deps, {
        maxActions: executeOpts.maxActions ?? config.maxActions,
        temperature: executeOpts.temperature ?? config.temperature,
        maxTokens: executeOpts.maxOutputTokens ?? config.maxOutputTokens,
        governorEnabled: config.governorEnabled,
      });

      const result = await raceWithAbort(loopTask, abortController.signal, config.executionTimeoutMs);
      return buildResult(result, config, retrievalCallCount, startTime, executionId, registry, false);
    } finally {
      executeOpts.signal?.removeEventListener("abort", onAbort);
      if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
    }
  }

  return {
    config,
    registerTool(tool: ScaffoldTool): void {
      registry.register(tool);
    },
    registerTools(tools: readonly ScaffoldTool[]): void {
      registry.registerAll(tools);
    },
    execute,
    run: execute,
    logger,
  };
}

async function raceWithAbort<T>(promise: Promise<T>, signal: AbortSignal, timeoutMs: number): Promise<T> {
  if (signal.aborted) {
    throw signal.reason instanceof Error && signal.reason.name === "TimeoutError"
      ? new TimeoutError(`execution timed out after ${timeoutMs}ms`)
      : new CancelledError();
  }

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      const reason = signal.reason;
      if (reason instanceof Error && reason.name === "TimeoutError") {
        reject(new TimeoutError(`execution timed out after ${timeoutMs}ms`));
      } else {
        reject(new CancelledError());
      }
    };
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (err) => {
        signal.removeEventListener("abort", onAbort);
        reject(err);
      },
    );
  });
}

function buildResult(
  loopResult: LoopResult,
  config: ResolvedScaffoldConfig,
  retrievalCallCount: number,
  startTime: number,
  executionId: string,
  registry: ToolRegistry,
  _aborted: boolean,
): ScaffoldResult {
  const invocations = registry.listInvocations();
  const toolExecutions = invocations.map((i) => ({ toolName: i.toolName, success: i.success }));

  return {
    success: loopResult.success,
    response: loopResult.reason,
    actions: loopResult.state.attemptedActions.slice(),
    errors: loopResult.state.failedActions.map((a) => `action failed: ${a}`),
    durationMs: Date.now() - startTime,
    model: config.model,
    modelCalls: loopResult.modelCalls,
    toolCalls: loopResult.toolCalls,
    tokenEstimates: {
      promptTokens: loopResult.promptTokens,
      completionTokens: loopResult.completionTokens,
      totalTokens: loopResult.totalTokens,
      feedbackTokens: loopResult.feedbackTokens,
      retrievalTokens: loopResult.retrievalTokens,
    },
    retrievalStats: {
      enabled: config.retrievalEnabled,
      calls: retrievalCallCount,
      tokens: loopResult.retrievalTokens,
    },
    terminationReason: loopResult.success ? "completed" : "exhausted",
    executionId,
    toolExecutions,
  };
}

function readWorkspaceFiles(dir: string): RetrievalItem[] {
  const items: RetrievalItem[] = [];
  const SKIPPED_DIRS = new Set(["node_modules", ".git", "dist", ".cache", "coverage"]);

  const visit = (dirPath: string, depth: number): void => {
    if (depth > 8) return;
    let entries;
    try {
      entries = fs.readdirSync(dirPath, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRS.has(entry.name)) visit(dirPath + path.sep + entry.name, depth + 1);
      } else if (entry.isFile()) {
        const fullPath = dirPath + path.sep + entry.name;
        if (isIgnoredForRetrieval(entry.name)) continue;
        try {
          const content = fs.readFileSync(fullPath, "utf-8");
          const rel = path.relative(dir, fullPath);
          items.push({ id: rel, content: content.slice(0, 2000) });
        } catch {
          // skip unreadable files
        }
      }
    }
  };

  try {
    visit(dir, 0);
  } catch {
    // ignore
  }
  return items;
}

function isIgnoredForRetrieval(name: string): boolean {
  return name === "node_modules" || name === ".git" || name.endsWith(".log") || name.endsWith(".tmp");
}

let executionCounter = 0;
function makeExecutionId(): string {
  executionCounter++;
  return `exec-${Date.now().toString(36)}-${executionCounter}`;
}

/** Wraps a reasoning model so transport/provider failures surface as ModelError. */
function wrapModel(raw: ReasoningModel, logger: Logger): ReasoningModel {
  return {
    modelId: raw.modelId,
    async generate(request) {
      try {
        return await raw.generate(request);
      } catch (err) {
        logger.error(`model call failed: ${err instanceof Error ? err.message : String(err)}`);
        throw new ModelError(
          `model generation failed`,
          { causeDetail: err instanceof Error ? err.message.slice(0, 500) : String(err), cause: err },
        );
      }
    },
  };
}

export { ScaffoldError, ModelError, TimeoutError, CancelledError, RuntimeError };
