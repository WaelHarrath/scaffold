import type { RetrievalBudgetLevel } from "./execution/format-compress.js";
import { ConfigurationError } from "./errors.js";

export const DEFAULT_MODEL = "qwen3:4b-instruct";
export const DEFAULT_EMBEDDING_MODEL = "all-minilm:latest";

export const DEFAULT_OLLAMA_ENDPOINT = "http://localhost:11434";

export const DEFAULT_CONFIG = {
  model: DEFAULT_MODEL,
  embeddingModel: DEFAULT_EMBEDDING_MODEL,
  contextWindow: 4096,
  reservedOutputTokens: 256,
  temperature: 0.1,
  maxOutputTokens: 256,
  maxActions: 20,
  topP: undefined as number | undefined,
  ollamaEndpoint: DEFAULT_OLLAMA_ENDPOINT,
  retrievalEnabled: true,
  retrievalTopK: 3,
  retrievalBudget: "RETRIEVAL_75" as RetrievalBudgetLevel,
  stateEnabled: true,
  feedbackEnabled: true,
  governorEnabled: true,
  executionTimeoutMs: 120_000,
  workingDirectory: process.cwd(),
  workspaceContainment: true,
  redactSecrets: true,
} as const;

export interface ScaffoldRuntimeConfig {
  /** Reasoning model id, e.g. "qwen3:4b-instruct". */
  readonly model?: string;
  /** Embedding/retrieval model id, e.g. "all-minilm:latest". */
  readonly embeddingModel?: string;
  /** Total model context window in tokens (validated default 4096). */
  readonly contextWindow?: number;
  /** Tokens reserved for model output. Input budget = contextWindow - this. */
  readonly reservedOutputTokens?: number;
  /** Sampling temperature (validated default 0.1). */
  readonly temperature?: number;
  /** Maximum output tokens per model call (validated operating value 256). */
  readonly maxOutputTokens?: number;
  /** Maximum number of action steps per execution (validated default 20). */
  readonly maxActions?: number;
  /** top-p, if supported by the provider. Optional. */
  readonly topP?: number;
  /** Ollama HTTP endpoint. */
  readonly ollamaEndpoint?: string;
  /** Enable semantic retrieval (validated default true). */
  readonly retrievalEnabled?: boolean;
  /** Retrieval top-K (validated default 3). */
  readonly retrievalTopK?: number;
  /** Retrieval admission budget (validated default RETRIEVAL_75). */
  readonly retrievalBudget?: RetrievalBudgetLevel;
  /** Enable state formatting (validated default true). */
  readonly stateEnabled?: boolean;
  /** Enable feedback formatting (validated default true). */
  readonly feedbackEnabled?: boolean;
  /** Enable the action governor (validated default true). */
  readonly governorEnabled?: boolean;
  /** Hard per-execution timeout in milliseconds (0 = no timeout). */
  readonly executionTimeoutMs?: number;
  /** Working directory for the default file/command executor. */
  readonly workingDirectory?: string;
  /** Enforce workspace path containment for action targets (validated default true). */
  readonly workspaceContainment?: boolean;
  /** Redact secret-like values from tool output/errors (validated default true). */
  readonly redactSecrets?: boolean;
}

export function validateScaffoldConfig(input: ScaffoldRuntimeConfig): void {
  if (input.contextWindow !== undefined && input.contextWindow < 512) {
    throw new ConfigurationError(`contextWindow must be >= 512, got ${input.contextWindow}`);
  }
  if (input.contextWindow !== undefined && input.contextWindow > 32768) {
    throw new ConfigurationError(`contextWindow must be <= 32768, got ${input.contextWindow}`);
  }
  if (input.reservedOutputTokens !== undefined && input.reservedOutputTokens < 0) {
    throw new ConfigurationError(`reservedOutputTokens must be >= 0, got ${input.reservedOutputTokens}`);
  }
  if (input.reservedOutputTokens !== undefined && input.contextWindow !== undefined && input.reservedOutputTokens >= input.contextWindow) {
    throw new ConfigurationError(`reservedOutputTokens (${input.reservedOutputTokens}) must be < contextWindow (${input.contextWindow})`);
  }
  if (input.temperature !== undefined && (input.temperature < 0 || input.temperature > 2)) {
    throw new ConfigurationError(`temperature must be in [0,2], got ${input.temperature}`);
  }
  if (input.maxOutputTokens !== undefined && input.maxOutputTokens < 1) {
    throw new ConfigurationError(`maxOutputTokens must be >= 1, got ${input.maxOutputTokens}`);
  }
  if (input.maxActions !== undefined && input.maxActions < 1) {
    throw new ConfigurationError(`maxActions must be >= 1, got ${input.maxActions}`);
  }
  if (input.topP !== undefined && (input.topP < 0 || input.topP > 1)) {
    throw new ConfigurationError(`topP must be in [0,1], got ${input.topP}`);
  }
  if (input.ollamaEndpoint !== undefined && !isHttpUrl(input.ollamaEndpoint)) {
    throw new ConfigurationError(`ollamaEndpoint must be an http(s) URL, got "${input.ollamaEndpoint}"`);
  }
  if (input.retrievalTopK !== undefined && input.retrievalTopK < 0) {
    throw new ConfigurationError(`retrievalTopK must be >= 0, got ${input.retrievalTopK}`);
  }
  if (input.executionTimeoutMs !== undefined && input.executionTimeoutMs < 0) {
    throw new ConfigurationError(`executionTimeoutMs must be >= 0, got ${input.executionTimeoutMs}`);
  }
  if (
    input.retrievalBudget !== undefined &&
    !isRetrievalBudgetLevel(input.retrievalBudget)
  ) {
    throw new ConfigurationError(`invalid retrievalBudget "${input.retrievalBudget}"`);
  }
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isRetrievalBudgetLevel(value: string): value is RetrievalBudgetLevel {
  return ["FULL", "RETRIEVAL_75", "RETRIEVAL_50", "RETRIEVAL_MIN"].includes(value);
}

export interface ResolvedScaffoldConfig {
  readonly model: string;
  readonly embeddingModel: string;
  readonly contextWindow: number;
  readonly reservedOutputTokens: number;
  readonly inputBudget: number;
  readonly temperature: number;
  readonly maxOutputTokens: number;
  readonly maxActions: number;
  readonly topP: number | undefined;
  readonly ollamaEndpoint: string;
  readonly retrievalEnabled: boolean;
  readonly retrievalTopK: number;
  readonly retrievalBudget: RetrievalBudgetLevel;
  readonly stateEnabled: boolean;
  readonly feedbackEnabled: boolean;
  readonly governorEnabled: boolean;
  readonly executionTimeoutMs: number;
  readonly workingDirectory: string;
  readonly workspaceContainment: boolean;
  readonly redactSecrets: boolean;
}

export function resolveConfig(input: ScaffoldRuntimeConfig = {}): ResolvedScaffoldConfig {
  const contextWindow = input.contextWindow ?? DEFAULT_CONFIG.contextWindow;
  const reservedOutputTokens = input.reservedOutputTokens ?? DEFAULT_CONFIG.reservedOutputTokens;
  const result: ResolvedScaffoldConfig = {
    model: input.model ?? DEFAULT_CONFIG.model,
    embeddingModel: input.embeddingModel ?? DEFAULT_CONFIG.embeddingModel,
    contextWindow,
    reservedOutputTokens,
    inputBudget: contextWindow - reservedOutputTokens,
    temperature: input.temperature ?? DEFAULT_CONFIG.temperature,
    maxOutputTokens: input.maxOutputTokens ?? DEFAULT_CONFIG.maxOutputTokens,
    maxActions: input.maxActions ?? DEFAULT_CONFIG.maxActions,
    topP: input.topP,
    ollamaEndpoint: input.ollamaEndpoint ?? DEFAULT_CONFIG.ollamaEndpoint,
    retrievalEnabled: input.retrievalEnabled ?? DEFAULT_CONFIG.retrievalEnabled,
    retrievalTopK: input.retrievalTopK ?? DEFAULT_CONFIG.retrievalTopK,
    retrievalBudget: input.retrievalBudget ?? DEFAULT_CONFIG.retrievalBudget,
    stateEnabled: input.stateEnabled ?? DEFAULT_CONFIG.stateEnabled,
    feedbackEnabled: input.feedbackEnabled ?? DEFAULT_CONFIG.feedbackEnabled,
    governorEnabled: input.governorEnabled ?? DEFAULT_CONFIG.governorEnabled,
    executionTimeoutMs: input.executionTimeoutMs ?? DEFAULT_CONFIG.executionTimeoutMs,
    workingDirectory: input.workingDirectory ?? DEFAULT_CONFIG.workingDirectory,
    workspaceContainment: input.workspaceContainment ?? DEFAULT_CONFIG.workspaceContainment,
    redactSecrets: input.redactSecrets ?? DEFAULT_CONFIG.redactSecrets,
  };
  validateScaffoldConfig(result);
  return result;
}
