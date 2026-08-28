import type { TaskState } from "./state.js";
import { cloneState } from "./state.js";
import type { ParsedAction } from "../cognition/action-parser.js";

export function updateStateOnAction(
  state: TaskState,
  action: ParsedAction,
  success: boolean,
  output: string,
  filesChanged: string[],
): TaskState {
  const next = cloneState(state);

  const actionKey = `${action.type}:${action.target ?? ""}`;
  next.lastAction = actionKey;
  next.lastResult = output;

  // Track attempted action
  next.attemptedActions = [...next.attemptedActions, actionKey];

  if (!success) {
    next.failedActions = [...next.failedActions, actionKey];
  }

  // Track relevant files
  if (action.target && !next.relevantFiles.includes(action.target)) {
    next.relevantFiles = [...next.relevantFiles, action.target];
  }
  for (const f of filesChanged) {
    if (!next.relevantFiles.includes(f)) {
      next.relevantFiles = [...next.relevantFiles, f];
    }
  }

  // Update current file for inspect/edit actions
  if (action.target && (action.type === "inspect" || action.type === "edit")) {
    next.currentFile = action.target;
  }

  // Update progress heuristic
  if (action.type === "finish") {
    next.completionStatus = success ? "completed" : "failed";
    next.progress = success ? "YES" : "NO";
  } else if (action.type === "edit") {
    next.progress = success ? "YES" : "NO";
  } else if (action.type === "inspect" || action.type === "search") {
    // Inspect/search gathering info doesn't change progress unless it failed
    if (!success) {
      next.progress = "NO";
    }
  }

  return next;
}

export function addFailedAction(state: TaskState, actionKey: string): TaskState {
  const next = cloneState(state);
  if (!next.failedActions.includes(actionKey)) {
    next.failedActions = [...next.failedActions, actionKey];
  }
  next.attemptedActions = [...next.attemptedActions, actionKey];
  return next;
}

export function isStuck(state: TaskState, maxAttempts: number): boolean {
  // Count attempts per unique action key
  const attemptCounts = new Map<string, number>();
  for (const key of state.attemptedActions) {
    attemptCounts.set(key, (attemptCounts.get(key) ?? 0) + 1);
  }

  // Stuck if any action has been attempted more than maxAttempts times
  for (const count of attemptCounts.values()) {
    if (count > maxAttempts) return true;
  }

  return false;
}
