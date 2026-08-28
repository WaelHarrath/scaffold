import type { TaskState } from "../state/state.js";

export function formatModelOnlyPrompt(state: TaskState, _feedback: string | null): string {
  return `TASK: ${state.task}`;
}

export function formatMinimalPrompt(state: TaskState, feedback: string | null): string {
  const parts: string[] = [];
  parts.push(`TASK: ${state.task}`);

  const stateBits: string[] = [];
  if (state.lastAction) stateBits.push(`last=${state.lastAction}`);
  if (state.progress !== "UNKNOWN") stateBits.push(`progress=${state.progress}`);
  if (state.relevantFiles.length > 0) stateBits.push(`files=${state.relevantFiles.join(",")}`);
  if (state.completionStatus !== "in_progress") stateBits.push(`status=${state.completionStatus}`);
  if (state.failedActions.length > 0) stateBits.push(`failed=${state.failedActions.length}`);

  if (stateBits.length > 0) {
    parts.push(`STATE: ${stateBits.join("; ")}`);
  }

  if (feedback) {
    parts.push(`FEEDBACK: ${feedback}`);
  }

  return parts.join("\n");
}

export function formatRetrievalPrompt(state: TaskState, feedback: string | null, retrieved: string): string {
  const parts: string[] = [];
  parts.push(`TASK: ${state.task}`);

  if (retrieved) {
    parts.push(`RELEVANT: ${retrieved}`);
  }

  if (feedback) {
    parts.push(`FEEDBACK: ${feedback}`);
  }

  return parts.join("\n");
}

export function formatFullPrompt(
  state: TaskState,
  feedback: string | null,
  retrieved: string,
): string {
  const parts: string[] = [];
  parts.push(`TASK: ${state.task}`);

  const stateBits: string[] = [];
  if (state.lastAction) stateBits.push(`last=${state.lastAction}`);
  if (state.progress !== "UNKNOWN") stateBits.push(`progress=${state.progress}`);
  if (state.relevantFiles.length > 0) stateBits.push(`files=${state.relevantFiles.join(",")}`);
  if (state.completionStatus !== "in_progress") stateBits.push(`status=${state.completionStatus}`);
  if (state.failedActions.length > 0) stateBits.push(`failed=${state.failedActions.length}`);

  if (stateBits.length > 0) {
    parts.push(`STATE: ${stateBits.join("; ")}`);
  }

  if (retrieved) {
    parts.push(`RELEVANT: ${retrieved}`);
  }

  if (feedback) {
    parts.push(`FEEDBACK: ${feedback}`);
  }

  return parts.join("\n");
}

// ─── Phase 3 ablation format functions ───────────────────────────────────────

export function formatStateOnlyPrompt(state: TaskState, _feedback: string | null): string {
  const parts: string[] = [];
  parts.push(`TASK: ${state.task}`);

  const stateBits: string[] = [];
  if (state.lastAction) stateBits.push(`last=${state.lastAction}`);
  if (state.progress !== "UNKNOWN") stateBits.push(`progress=${state.progress}`);
  if (state.relevantFiles.length > 0) stateBits.push(`files=${state.relevantFiles.join(",")}`);
  if (state.completionStatus !== "in_progress") stateBits.push(`status=${state.completionStatus}`);
  if (state.failedActions.length > 0) stateBits.push(`failed=${state.failedActions.length}`);

  if (stateBits.length > 0) {
    parts.push(`STATE: ${stateBits.join("; ")}`);
  }

  return parts.join("\n");
}

export function formatFeedbackOnlyPrompt(_state: TaskState, feedback: string | null): string {
  const parts: string[] = [];
  parts.push(`TASK: ${_state.task}`);

  if (feedback) {
    parts.push(`FEEDBACK: ${feedback}`);
  }

  return parts.join("\n");
}

export function formatRetrievalOnlyPrompt(
  state: TaskState,
  _feedback: string | null,
  retrieved: string,
): string {
  const parts: string[] = [];
  parts.push(`TASK: ${state.task}`);

  if (retrieved) {
    parts.push(`RELEVANT: ${retrieved}`);
  }

  return parts.join("\n");
}

export function formatStateRetrievalPrompt(
  state: TaskState,
  _feedback: string | null,
  retrieved: string,
): string {
  const parts: string[] = [];
  parts.push(`TASK: ${state.task}`);

  const stateBits: string[] = [];
  if (state.lastAction) stateBits.push(`last=${state.lastAction}`);
  if (state.progress !== "UNKNOWN") stateBits.push(`progress=${state.progress}`);
  if (state.relevantFiles.length > 0) stateBits.push(`files=${state.relevantFiles.join(",")}`);
  if (state.completionStatus !== "in_progress") stateBits.push(`status=${state.completionStatus}`);
  if (state.failedActions.length > 0) stateBits.push(`failed=${state.failedActions.length}`);

  if (stateBits.length > 0) {
    parts.push(`STATE: ${stateBits.join("; ")}`);
  }

  if (retrieved) {
    parts.push(`RELEVANT: ${retrieved}`);
  }

  return parts.join("\n");
}

export function formatFeedbackRetrievalPrompt(
  _state: TaskState,
  feedback: string | null,
  retrieved: string,
): string {
  const parts: string[] = [];
  parts.push(`TASK: ${_state.task}`);

  if (retrieved) {
    parts.push(`RELEVANT: ${retrieved}`);
  }

  if (feedback) {
    parts.push(`FEEDBACK: ${feedback}`);
  }

  return parts.join("\n");
}
