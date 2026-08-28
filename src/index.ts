/**
 * SCAFFOLD public API.
 *
 * External applications import ONLY from this entry point. The internal
 * implementation modules (state-manager, context-selector, governor internals,
 * retriever internals, feedback formatter internals, scaffold-loop internals)
 * are not part of the stable public surface.
 *
 * ```ts
 * import { createScaffold } from "scaffold";
 *
 * const scaffold = createScaffold({ model: "qwen3:4b-instruct", contextWindow: 4096 });
 * scaffold.registerTool({ name: "get_weather", execute: async () => ({ success: true, output: "sunny" }) });
 * const result = await scaffold.execute("Report the weather");
 * ```
 */

export { createScaffold } from "./runtime.js";
export type {
  Scaffold,
  ScaffoldResult,
  ExecuteOptions,
  CreateScaffoldOptions,
} from "./runtime.js";

export {
  resolveConfig,
  validateScaffoldConfig,
  DEFAULT_CONFIG,
  DEFAULT_MODEL,
  DEFAULT_EMBEDDING_MODEL,
  DEFAULT_OLLAMA_ENDPOINT,
} from "./config.js";
export type {
  ScaffoldRuntimeConfig,
  ResolvedScaffoldConfig,
} from "./config.js";

export {
  ScaffoldError,
  ConfigurationError,
  ModelError,
  ToolError,
  ExecutionError,
  TimeoutError,
  CancelledError,
  ValidationError,
  RuntimeError,
} from "./errors.js";
export type { ScaffoldErrorCode } from "./errors.js";

export {
  createToolRegistry,
  createToolExecutor,
  toExecutionResult,
} from "./tools.js";
export type {
  ScaffoldTool,
  ToolResult,
  ToolRegistry,
  ToolInvocationResult,
} from "./tools.js";

export { createLogger, isLogLevel } from "./logger.js";
export type { Logger, LogLevel } from "./logger.js";

// Workspace security / containment (public runtime path).
export {
  resolveWithinWorkspace,
  isInside,
  toWorkspaceRelative,
} from "./workspace.js";
export type { WorkspaceResolveOptions } from "./workspace.js";
export { createSecureExecutor } from "./secure-executor.js";
export type { SecureExecutorOptions } from "./secure-executor.js";
export {
  redactText,
  redactWithFlag,
} from "./redact.js";
export type { RedactOptions } from "./redact.js";

// Stable model/model-provider boundary types (hosts may implement custom providers).
export type {
  ReasoningModel,
  EmbeddingModel,
  ModelRequest,
  ModelResponse,
  TokenUsage,
} from "./model/types.js";
export { Qwen3Adapter } from "./model/qwen3.js";
export { MiniLMAdapter } from "./model/embedding.js";
