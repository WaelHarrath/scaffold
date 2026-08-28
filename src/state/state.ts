export interface TaskState {
  readonly task: string;
  currentGoal: string;
  currentFile: string | null;
  lastAction: string;
  lastResult: string;
  progress: "YES" | "NO" | "UNKNOWN";
  relevantFiles: string[];
  failedActions: string[];
  attemptedActions: string[];
  completionStatus: "in_progress" | "completed" | "failed" | "stuck";
}

export function createInitialState(task: string): TaskState {
  return {
    task,
    currentGoal: task,
    currentFile: null,
    lastAction: "",
    lastResult: "",
    progress: "UNKNOWN",
    relevantFiles: [],
    failedActions: [],
    attemptedActions: [],
    completionStatus: "in_progress",
  };
}

export function cloneState(state: TaskState): TaskState {
  return {
    task: state.task,
    currentGoal: state.currentGoal,
    currentFile: state.currentFile,
    lastAction: state.lastAction,
    lastResult: state.lastResult,
    progress: state.progress,
    relevantFiles: [...state.relevantFiles],
    failedActions: [...state.failedActions],
    attemptedActions: [...state.attemptedActions],
    completionStatus: state.completionStatus,
  };
}
