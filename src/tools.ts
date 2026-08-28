import type { Executor, ExecutionResult } from "./execution/executor.js";
import { ToolError } from "./errors.js";

/**
 * A generic, domain-agnostic tool that a host application registers with the
 * SCAFFOLD runtime. SCAFFOLD has no opinion about what a tool does — it only
 * needs a name, an optional description/schema, and an execute function.
 *
 * Tool execution must:
 *  - normalize failures (return a structured failure, do not throw blindly)
 *  - never expose secrets
 *  - never silently convert a failure into a success
 */
export interface ScaffoldTool<Args = unknown, Out = unknown> {
  /** Unique tool name, e.g. "query_database", "get_weather". */
  readonly name: string;
  /** Human-readable description (used for logging/docs; the system
   *  prompt does not advertise host tools). */
  readonly description?: string;
  /** Optional loose schema description of the accepted input. Not enforced;
   *  tools validate their own input where appropriate. */
  readonly inputSchema?: unknown;
  /** Execute the tool against the provided input and return a structured result. */
  execute(input: Args): Promise<ToolResult<Out>> | ToolResult<Out>;
}

/** Structured result returned by a tool. Mirrors the ExecutionResult shape. */
export interface ToolResult<Out = unknown> {
  readonly success: boolean;
  readonly output: string;
  readonly data?: Out;
  readonly error: string | null;
  /** Files changed by the tool (for governor/state change detection). */
  readonly filesChanged?: string[];
}

/** Result returned by a tool invocation dispatched by the runtime executor. */
export interface ToolInvocationResult {
  readonly toolName: string;
  readonly success: boolean;
  readonly output: string;
  readonly error: string | null;
  readonly filesChanged: string[];
}

/** Maps a registered tool result onto the ExecutionResult shape. */
export function toExecutionResult(name: string, result: ToolResult): ToolInvocationResult {
  return {
    toolName: name,
    success: result.success,
    output: result.output,
    error: result.error,
    filesChanged: result.filesChanged ?? [],
  };
}

/** In-memory registry of tools registered by the host application. */
export interface ToolRegistry {
  register(tool: ScaffoldTool): void;
  /** Register many tools at once; throws on duplicate names. */
  registerAll(tools: readonly ScaffoldTool[]): void;
  has(name: string): boolean;
  get(name: string): ScaffoldTool | undefined;
  names(): string[];
  /** Ordered list of tool invocations dispatched through the runtime executor. */
  listInvocations(): ToolInvocationResult[];
  /** Record a dispatched tool invocation (used by the runtime executor). */
  recordInvocation(invocation: ToolInvocationResult): void;
  clearInvocations(): void;
  readonly count: number;
}

export function createToolRegistry(): ToolRegistry {
  const tools = new Map<string, ScaffoldTool>();
  const invocations: ToolInvocationResult[] = [];
  return {
    register(tool: ScaffoldTool): void {
      if (!tool || typeof tool.name !== "string" || tool.name.length === 0) {
        throw new ToolError("cannot register a tool without a valid name");
      }
      if (tools.has(tool.name)) {
        throw new ToolError(`a tool named "${tool.name}" is already registered`);
      }
      tools.set(tool.name, tool);
    },
    registerAll(input: readonly ScaffoldTool[]): void {
      for (const tool of input) {
        this.register(tool);
      }
    },
    has(name: string): boolean {
      return tools.has(name);
    },
    get(name: string): ScaffoldTool | undefined {
      return tools.get(name);
    },
    names(): string[] {
      return [...tools.keys()];
    },
    listInvocations(): ToolInvocationResult[] {
      return invocations.slice();
    },
    recordInvocation(invocation: ToolInvocationResult): void {
      invocations.push(invocation);
    },
    clearInvocations(): void {
      invocations.length = 0;
    },
    get count(): number {
      return tools.size;
    },
  };
}

/**
 * Wraps the default executor so that registered tools can be dispatched
 * through the model's generic `run` action: if the command's first token matches
 * a registered tool name, the tool is invoked instead of a shell command.
 *
 * This is an additive, domain-agnostic extension. The default executor behavior
 * is preserved for every non-tool command, so the base runtime is unaffected
 * when no tools are registered.
 */
export function createToolExecutor(
  defaultExecutor: Executor,
  registry: ToolRegistry,
): Executor {
  return {
    async execute(action): Promise<ExecutionResult> {
      if (action.type === "run" && action.target) {
        const resolved = resolveToolInvocation(action.target, registry);
        if (resolved) {
          try {
            const result = await registry.get(resolved.name)!.execute(resolved.args);
            const normalized: ToolResult = {
              success: result.success,
              output: result.output ?? "",
              error: result.error ?? null,
              filesChanged: result.filesChanged ?? [],
            };
            const inv = toExecutionResult(resolved.name, normalized);
            registry.recordInvocation(inv);
            return {
              success: inv.success,
              output: inv.output,
              error: inv.error,
              filesChanged: inv.filesChanged,
            };
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            const inv: ToolInvocationResult = {
              toolName: resolved.name,
              success: false,
              output: "",
              error: `tool "${resolved.name}" threw: ${msg}`,
              filesChanged: [],
            };
            registry.recordInvocation(inv);
            return {
              success: false,
              output: "",
              error: inv.error,
              filesChanged: [],
            };
          }
        }
      }
      return defaultExecutor.execute(action);
    },
  };
}

interface ToolInvocation {
  name: string;
  args: unknown;
}

function resolveToolInvocation(command: string, registry: ToolRegistry): ToolInvocation | null {
  const trimmed = command.trim();
  if (!trimmed) return null;
  const spaceIndex = trimmed.search(/\s/);
  const firstToken = spaceIndex === -1 ? trimmed : trimmed.slice(0, spaceIndex);
  if (!registry.has(firstToken)) return null;

  let remainder = spaceIndex === -1 ? "" : trimmed.slice(spaceIndex).trim();
  let args: unknown = remainder;
  if (remainder.length > 0) {
    try {
      // If the remainder parses as JSON, pass structured args; otherwise the raw string.
      args = JSON.parse(remainder);
    } catch {
      args = remainder;
    }
  }
  return { name: firstToken, args };
}
