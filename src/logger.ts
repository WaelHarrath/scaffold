export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

export interface Logger {
  debug(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  /** Current minimum level; "silent" disables all output. */
  readonly level: LogLevel;
}

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
};

export function isLogLevel(value: string): value is LogLevel {
  return value in LEVEL_ORDER;
}

function defaultWriter(level: LogLevel, message: string): void {
  if (level === "error") {
    console.error("[scaffold] " + message);
  } else {
    console.log("[scaffold] " + message);
  }
}

/**
 * Minimal, security-aware logger.
 *
 * Security contract:
 *  - Never log credentials, authorization headers, environment dumps, or secrets.
 *  - Never log full prompts or full tool payloads by default (the runtime logs
 *    only counts and safe identifiers, see the runtime observability layer).
 *  - The host controls verbosity via the `level` option.
 */
export class RuntimeLogger implements Logger {
  readonly level: LogLevel;
  private readonly write: (level: LogLevel, message: string) => void;

  constructor(level: LogLevel = "info", write?: (level: LogLevel, message: string) => void) {
    this.level = level;
    this.write = write ?? defaultWriter;
  }

  private enabled(level: LogLevel): boolean {
    return LEVEL_ORDER[level] >= LEVEL_ORDER[this.level];
  }

  debug(message: string): void {
    if (this.enabled("debug")) this.write("debug", message);
  }

  info(message: string): void {
    if (this.enabled("info")) this.write("info", message);
  }

  warn(message: string): void {
    if (this.enabled("warn")) this.write("warn", message);
  }

  error(message: string): void {
    if (this.enabled("error")) this.write("error", message);
  }
}

export function createLogger(level: LogLevel = "info", write?: (level: LogLevel, message: string) => void): Logger {
  return new RuntimeLogger(level, write);
}
