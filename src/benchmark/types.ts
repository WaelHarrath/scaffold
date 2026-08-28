export interface WorkspaceFile {
  readonly path: string;
  readonly content: string;
}

export interface TaskDefinition {
  readonly id: string;
  readonly category: string;
  readonly objective: string;
  readonly difficulty: number;
  readonly workspace: readonly WorkspaceFile[];
  verify(
    workspaceDir: string,
    actions: { success: boolean; actionType: string; target?: string }[],
  ): { success: boolean; reason: string };
}

export interface TaskResult {
  readonly taskId: string;
  readonly category: string;
  readonly success: boolean;
  readonly reason: string;
  readonly modelCalls: number;
  readonly toolCalls: number;
  readonly rejectedActions: number;
  readonly duplicateActions: number;
  readonly noopActions: number;
  readonly totalTokens: number;
  readonly executionTime: number;
  readonly condition: string;
  readonly rep: number;
  readonly retrievalTokens: number;
}
