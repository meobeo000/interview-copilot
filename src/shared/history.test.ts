import { describe, expect, it } from "vitest";
import { capHistory, HISTORY_LIMIT } from "./history";
import type { ConversationItem } from "./types";

function item(index: number): ConversationItem {
  return {
    id: String(index),
    startedAt: index,
    rawTranscript: `raw ${index}`,
    cleanedQuestion: `question ${index}`,
    answer: {
      openingLine: `answer ${index}`,
      bullets: [],
      keywords: []
    }
  };
}

describe("capHistory", () => {
  it("keeps only the latest five completed Q&A items", () => {
    const history = capHistory([item(1), item(2), item(3), item(4), item(5), item(6)]);

    expect(history).toHaveLength(HISTORY_LIMIT);
    expect(history.map((entry) => entry.id)).toEqual(["6", "5", "4", "3", "2"]);
  });

  it("does not keep incomplete conversations", () => {
    const incomplete: ConversationItem = {
      id: "draft",
      startedAt: 10,
      rawTranscript: "Theo em backlink..."
    };

    expect(capHistory([incomplete, item(1)])).toHaveLength(1);
  });
});
