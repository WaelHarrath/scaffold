import type { ActionType } from "./action-parser.js";

export const VALID_ACTIONS: readonly ActionType[] = ["inspect", "search", "edit", "run", "finish"];

export function isValidAction(type: string): type is ActionType {
  return (VALID_ACTIONS as readonly string[]).includes(type);
}
