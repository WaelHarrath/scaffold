export type ActionType = "inspect" | "search" | "edit" | "run" | "finish";

export interface ParsedAction {
  readonly type: ActionType;
  readonly target?: string;
  readonly content?: string;
}

const ACTION_KEYWORDS: Record<string, ActionType> = {
  inspect: "inspect",
  search: "search",
  edit: "edit",
  run: "run",
  finish: "finish",
};

function normalizeAction(raw: string): ActionType | null {
  const lower = raw.trim().toLowerCase();
  return ACTION_KEYWORDS[lower] ?? null;
}

export function parseAction(raw: string): ParsedAction | null {
  if (!raw || !raw.trim()) return null;

  const trimmed = raw.trim();

  // Format 1: ACTION: <type> TARGET: <target> CONTENT: <content>
  // Flexible with spacing, newlines, mixed case
  const structuredPattern =
    /ACTION\s*:\s*(\w+)\s+(?:TARGET\s*:\s*(\S+))?\s*(?:CONTENT\s*:\s*([\s\S]*))?/i;
  const structuredMatch = trimmed.match(structuredPattern);
  if (structuredMatch) {
    const actionMatch = structuredMatch[1];
    if (!actionMatch) return null;
    const actionType = normalizeAction(actionMatch);
    if (!actionType) return null;

    const target = structuredMatch[2] || undefined;
    const content = structuredMatch[3]?.trim() || undefined;

    return { type: actionType, target, content };
  }

  // Format 2: Bare format — "<action> <target>"
  // Split on first whitespace
  const barePattern = /^(\w+)\s+(.*)$/s;
  const bareMatch = trimmed.match(barePattern);
  if (bareMatch) {
    const bareMatch1 = bareMatch[1];
    const bareMatch2 = bareMatch[2];
    if (!bareMatch1 || !bareMatch2) return null;
    const actionType = normalizeAction(bareMatch1);
    if (!actionType) return null;

    const remainder = bareMatch2.trim();

    // For finish, the remainder is optional extra text
    if (actionType === "finish") {
      return { type: "finish", target: remainder || undefined };
    }

    // For other actions, the remainder is the target
    if (remainder) {
      return { type: actionType, target: remainder };
    }

    // Single word action with no target (e.g. bare "finish")
    return { type: actionType };
  }

  // Format 3: Single keyword (e.g. "finish" alone)
  const singleWord = normalizeAction(trimmed);
  if (singleWord) {
    return { type: singleWord };
  }

  return null;
}
