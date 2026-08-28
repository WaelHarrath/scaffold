import type { ContextBudget } from "./context-budget.js";
import type { TaskState } from "../state/state.js";

export interface ContextCandidate {
  readonly id: string;
  readonly content: string;
  readonly priority: number;
  readonly category: "task" | "goal" | "state" | "observation" | "error" | "retrieved" | "history" | "constraint";
}

export interface SelectedContext {
  readonly candidates: ContextCandidate[];
  readonly totalTokens: number;
  readonly dropped: string[];
}

const CATEGORY_PRIORITY: Record<ContextCandidate["category"], number> = {
  task: 100,
  goal: 90,
  error: 85,
  observation: 80,
  state: 70,
  constraint: 60,
  retrieved: 50,
  history: 30,
};

const REQUIRED_CATEGORIES: ReadonlySet<ContextCandidate["category"]> = new Set(["task", "goal"]);

export function buildCandidates(
  state: TaskState,
  observation: string | null,
  errors: string[],
  retrieved: { id: string; content: string; score: number }[],
  history: string[],
): ContextCandidate[] {
  const candidates: ContextCandidate[] = [];

  candidates.push({
    id: "task",
    content: state.task,
    priority: CATEGORY_PRIORITY.task,
    category: "task",
  });

  if (state.currentGoal !== state.task) {
    candidates.push({
      id: "goal",
      content: state.currentGoal,
      priority: CATEGORY_PRIORITY.goal,
      category: "goal",
    });
  }

  for (const err of errors) {
    candidates.push({
      id: `error-${candidates.length}`,
      content: err,
      priority: CATEGORY_PRIORITY.error,
      category: "error",
    });
  }

  if (observation) {
    candidates.push({
      id: "observation",
      content: observation,
      priority: CATEGORY_PRIORITY.observation,
      category: "observation",
    });
  }

  const stateParts: string[] = [];
  if (state.currentFile) stateParts.push(`currentFile: ${state.currentFile}`);
  if (state.lastAction) stateParts.push(`lastAction: ${state.lastAction}`);
  if (state.progress !== "UNKNOWN") stateParts.push(`progress: ${state.progress}`);
  if (state.relevantFiles.length > 0) stateParts.push(`files: ${state.relevantFiles.join(", ")}`);
  if (state.completionStatus !== "in_progress") stateParts.push(`status: ${state.completionStatus}`);

  if (stateParts.length > 0) {
    candidates.push({
      id: "state",
      content: stateParts.join("; "),
      priority: CATEGORY_PRIORITY.state,
      category: "state",
    });
  }

  for (const item of retrieved) {
    candidates.push({
      id: item.id,
      content: item.content,
      priority: CATEGORY_PRIORITY.retrieved + item.score * 10,
      category: "retrieved",
    });
  }

  for (const entry of history) {
    candidates.push({
      id: `history-${candidates.length}`,
      content: entry,
      priority: CATEGORY_PRIORITY.history,
      category: "history",
    });
  }

  return candidates;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function selectContext(
  candidates: ContextCandidate[],
  budget: ContextBudget,
  usedTokens: number,
): SelectedContext {
  const sorted = [...candidates].sort((a, b) => b.priority - a.priority);

  const selected: ContextCandidate[] = [];
  const dropped: string[] = [];
  let tokens = usedTokens;

  const required: ContextCandidate[] = [];
  const optional: ContextCandidate[] = [];

  for (const c of sorted) {
    if (REQUIRED_CATEGORIES.has(c.category)) {
      required.push(c);
    } else {
      optional.push(c);
    }
  }

  for (const c of required) {
    tokens += estimateTokens(c.content);
    selected.push(c);
  }

  for (const c of optional) {
    const cost = estimateTokens(c.content);
    if (tokens + cost <= budget.inputBudget) {
      tokens += cost;
      selected.push(c);
    } else {
      dropped.push(c.id);
    }
  }

  return {
    candidates: selected,
    totalTokens: tokens,
    dropped,
  };
}
