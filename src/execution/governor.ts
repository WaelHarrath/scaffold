import type { ParsedAction } from "../cognition/action-parser.js";

export type GovernorRejectionType = "duplicate" | "noop_limit" | "failed_replay" | null;

export interface GovernorDecision {
  readonly allowed: boolean;
  readonly reason: string | null;
  readonly rejectionType: GovernorRejectionType;
}

export interface GovernorState {
  readonly executedActions: string[];
  readonly failedActions: string[];
  readonly noopCount: Map<string, number>;
}

function serializeAction(action: ParsedAction): string {
  const parts: string[] = [action.type];
  if (action.target) parts.push(action.target);
  if (action.content) parts.push(action.content);
  return parts.join("::");
}

function noopKey(action: ParsedAction): string {
  return `${action.type}::${action.target ?? ""}`;
}

export function createGovernorState(): GovernorState {
  return {
    executedActions: [],
    failedActions: [],
    noopCount: new Map(),
  };
}

export function govern(
  state: GovernorState,
  action: ParsedAction,
  workspaceChanged: boolean,
): GovernorDecision {
  if (action.type === "finish") {
    return { allowed: true, reason: null, rejectionType: null };
  }

  const serialized = serializeAction(action);

  if (state.executedActions.length > 0) {
    const lastSerialized = state.executedActions[state.executedActions.length - 1]!;
    if (lastSerialized === serialized) {
      return { allowed: false, reason: `duplicate of previous action: ${action.type} ${action.target ?? ""}`, rejectionType: "duplicate" };
    }
  }

  if (action.type === "inspect" || action.type === "search" || action.type === "run") {
    const key = noopKey(action);
    const count = state.noopCount.get(key) ?? 0;
    if (count >= 3) {
      return { allowed: false, reason: `3+ identical ${action.type} on same target`, rejectionType: "noop_limit" };
    }
  }

  if (!workspaceChanged && state.failedActions.includes(serialized)) {
    return { allowed: false, reason: `previously failed action with unchanged workspace: ${action.type} ${action.target ?? ""}`, rejectionType: "failed_replay" };
  }

  return { allowed: true, reason: null, rejectionType: null };
}

export function recordExecution(
  state: GovernorState,
  action: ParsedAction,
  success: boolean,
  workspaceChanged: boolean,
): GovernorState {
  const serialized = serializeAction(action);
  const key = noopKey(action);

  const executedActions = [...state.executedActions, serialized];

  const failedActions = success
    ? state.failedActions.filter((f) => f !== serialized)
    : [...state.failedActions, serialized];

  const noopCount = new Map(state.noopCount);
  if (!workspaceChanged) {
    noopCount.set(key, (noopCount.get(key) ?? 0) + 1);
  } else {
    noopCount.set(key, 0);
  }

  return { executedActions, failedActions, noopCount };
}
