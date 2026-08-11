import type { ConversationItem } from "./types";

export const HISTORY_LIMIT = 5;

export function capHistory(items: ConversationItem[]): ConversationItem[] {
  return items
    .filter((item) => item.cleanedQuestion && item.answer)
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, HISTORY_LIMIT);
}
