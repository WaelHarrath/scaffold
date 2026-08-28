export const DEFAULT_CONTEXT_SIZE = 4096;
export const DEFAULT_RESERVED_OUTPUT = 256;

export interface ContextBudget {
  readonly total: number;
  readonly reservedOutput: number;
  readonly inputBudget: number;
}

export function createBudget(
  total: number = DEFAULT_CONTEXT_SIZE,
  reservedOutput: number = DEFAULT_RESERVED_OUTPUT,
): ContextBudget {
  return {
    total,
    reservedOutput,
    inputBudget: total - reservedOutput,
  };
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function remainingBudget(budget: ContextBudget, usedTokens: number): number {
  return Math.max(0, budget.inputBudget - usedTokens);
}

export function fitsInBudget(text: string, budget: ContextBudget, usedSoFar: number): boolean {
  return estimateTokens(text) <= remainingBudget(budget, usedSoFar);
}
