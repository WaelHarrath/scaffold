export type ScaffoldErrorCode =
  | "CONFIGURATION_ERROR"
  | "MODEL_ERROR"
  | "TOOL_ERROR"
  | "EXECUTION_ERROR"
  | "TIMEOUT"
  | "CANCELLED"
  | "VALIDATION_ERROR"
  | "RUNTIME_ERROR";

/**
 * Base structured error thrown or returned by the SCAFFOLD runtime.
 *
 * Errors carry a stable `code` so a host application can branch on the error
 * category without parsing messages. They never carry secrets, credentials, or
 * full prompt/tool payloads — see {@link ScaffoldError.toSafeString}.
 */
export class ScaffoldError extends Error {
  readonly code: ScaffoldErrorCode;
  readonly causeDetail?: string;

  constructor(code: ScaffoldErrorCode, message: string, options?: { causeDetail?: string; cause?: unknown }) {
    super(message);
    this.name = "ScaffoldError";
    this.code = code;
    this.causeDetail = options?.causeDetail;
    if (options?.cause !== undefined) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }

  /**
   * Builds a safe, redacted single-line description suitable for logs or
   * bubbling up to a host. Guaranteed not to contain arbitrary tool/prompt
   * payloads (only the typed `message` and `code` are included).
   */
  toSafeString(): string {
    return `[${this.code}] ${this.message}`;
  }
}

export class ConfigurationError extends ScaffoldError {
  constructor(message: string, cause?: unknown) {
    super("CONFIGURATION_ERROR", message, { cause });
    this.name = "ConfigurationError";
  }
}

export class ModelError extends ScaffoldError {
  constructor(message: string, options?: { causeDetail?: string; cause?: unknown }) {
    super("MODEL_ERROR", message, options);
    this.name = "ModelError";
  }
}

export class ToolError extends ScaffoldError {
  constructor(message: string, options?: { causeDetail?: string; cause?: unknown }) {
    super("TOOL_ERROR", message, options);
    this.name = "ToolError";
  }
}

export class ExecutionError extends ScaffoldError {
  constructor(message: string, options?: { causeDetail?: string; cause?: unknown }) {
    super("EXECUTION_ERROR", message, options);
    this.name = "ExecutionError";
  }
}

export class TimeoutError extends ScaffoldError {
  constructor(message: string, options?: { causeDetail?: string; cause?: unknown }) {
    super("TIMEOUT", message, options);
    this.name = "TimeoutError";
  }
}

export class CancelledError extends ScaffoldError {
  constructor(message = "execution cancelled", options?: { cause?: unknown }) {
    super("CANCELLED", message, options);
    this.name = "CancelledError";
  }
}

export class ValidationError extends ScaffoldError {
  constructor(message: string, options?: { cause?: unknown }) {
    super("VALIDATION_ERROR", message, options);
    this.name = "ValidationError";
  }
}

export class RuntimeError extends ScaffoldError {
  constructor(message: string, options?: { cause?: unknown }) {
    super("RUNTIME_ERROR", message, options);
    this.name = "RuntimeError";
  }
}
