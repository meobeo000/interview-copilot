import { describe, it, expect, beforeEach, vi } from "vitest";
import { useCopilotStore, turnContextManager, generateAnswerForTurn } from "./useCopilotStore";
import { createCommittedTurn } from "../../question-detector/committedTurn";
import { resolveFollowUpContext, extractDecisionFromCompletedTurn } from "../../question-detector/followUpDetector";
import type { ConversationItem, SuggestedAnswer } from "../../shared/types";

describe("Strict Turn Isolation & Manual Answer Safety", () => {
  beforeEach(() => {
    turnContextManager.reset();
    useCopilotStore.setState({
      status: "Idle",
      liveTranscript: "",
      rawQuestion: "",
      cleanedQuestion: "",
      detectedTopic: "",
      answer: { openingLine: "", bullets: [], keywords: [], streamingText: "" },
      history: [],
      error: undefined
    });
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("1. Resolves immutable snapshot on manual answer request", async () => {
    const q1Turn = createCommittedTurn({
      turnId: "turn-iso-1",
      questionText: "Domain A DR 55 traffic 0. Domain B DR 22 có traffic thật. Em chọn con nào?",
      rawTranscript: "Domain A DR 55 traffic 0. Domain B DR 22 có traffic thật. Em chọn con nào?",
      committedAt: Date.now(),
      intent: "DOMAIN_SELECTION",
      entities: ["domain A", "domain B", "DR", "traffic"],
      numericFacts: ["55", "0", "22"]
    });

    turnContextManager.recordCommittedTurn(q1Turn);

    // Call generateAnswerForTurn directly
    await generateAnswerForTurn(q1Turn.turnId, useCopilotStore.setState, useCopilotStore.getState);

    const state = useCopilotStore.getState();
    expect(state.status).toBe("Listening");
    expect(state.history.length).toBe(1);
    expect(state.history[0].turnId).toBe("turn-iso-1");
    expect(state.history[0].cleanedQuestion).toBe("Domain A DR 55 traffic 0. Domain B DR 22 có traffic thật. Em chọn con nào?");
  });

  it("2. Stale/manual race: live transcript of Q2 does NOT enter Q1 manual answer", async () => {
    const q1Turn = createCommittedTurn({
      turnId: "turn-q1",
      questionText: "Domain A DR 55 traffic 0. Domain B DR 22 có traffic thật. Em chọn con nào?",
      rawTranscript: "Domain A DR 55 traffic 0. Domain B DR 22 có traffic thật. Em chọn con nào?",
      committedAt: Date.now() - 5000,
      intent: "DOMAIN_SELECTION",
      entities: ["domain A", "domain B"],
      numericFacts: ["55", "0", "22"]
    });
    turnContextManager.recordCommittedTurn(q1Turn);

    // Interviewer begins speaking Q2 in live buffer
    useCopilotStore.setState({
      status: "Listening",
      liveTranscript: "Budget 25 triệu cho site mới em chia thế nào..."
    });

    // User triggers manual answer for Q1
    await generateAnswerForTurn(q1Turn.turnId, useCopilotStore.setState, useCopilotStore.getState);

    const state = useCopilotStore.getState();
    const historyQ1 = state.history.find((h) => h.turnId === "turn-q1" || h.id === "turn-q1");

    expect(historyQ1).toBeDefined();
    expect(historyQ1?.cleanedQuestion).not.toContain("Budget");
    expect(historyQ1?.cleanedQuestion).not.toContain("25 triệu");
    expect(historyQ1?.cleanedQuestion).toBe("Domain A DR 55 traffic 0. Domain B DR 22 có traffic thật. Em chọn con nào?");
  });

  it("3. Response ownership: late response for Turn 17 does not overwrite Turn 18", async () => {
    const turn17 = createCommittedTurn({
      turnId: "turn-17",
      questionText: "Site mở bot hai tuần vẫn chưa nhận keyword thì em xử lý thế nào?",
      committedAt: Date.now() - 10000,
      intent: "NO_KEYWORD_SIGNAL"
    });
    turnContextManager.recordCommittedTurn(turn17);

    // Turn 17 answer generation starts
    const answer17: SuggestedAnswer = {
      openingLine: "Em chưa đi link ngay, em kiểm tra lại indexing và internal link.",
      bullets: ["Check search intent", "Audit internal linking"],
      keywords: ["indexing", "on-page"]
    };

    // Before Turn 17 finishes, Turn 18 is committed
    const turn18 = createCommittedTurn({
      turnId: "turn-18",
      questionText: "Nếu vẫn không nhận keyword thì bước tiếp theo em làm gì?",
      committedAt: Date.now(),
      intent: "NO_KEYWORD_SIGNAL"
    });
    turnContextManager.recordCommittedTurn(turn18);

    // Simulate history containing turn17 and turn18
    const item17: ConversationItem = {
      id: "req-17",
      turnId: "turn-17",
      startedAt: Date.now() - 10000,
      rawTranscript: turn17.rawTranscript,
      cleanedQuestion: turn17.questionText,
      answer: answer17
    };

    const item18: ConversationItem = {
      id: "req-18",
      turnId: "turn-18",
      startedAt: Date.now(),
      rawTranscript: turn18.rawTranscript,
      cleanedQuestion: turn18.questionText
    };

    useCopilotStore.setState({
      history: [item18, item17]
    });

    const state = useCopilotStore.getState();
    expect(state.history[0].turnId).toBe("turn-18");
    expect(state.history[1].turnId).toBe("turn-17");
    expect(state.history[1].answer?.openingLine).toContain("Em chưa đi link ngay");
    expect(state.history[0].cleanedQuestion).toContain("Nếu vẫn không nhận keyword");
  });

  it("4. Follow-up inheritance vs Topic Switch Isolation", () => {
    // Turn 1: Domain Selection
    const turn1 = createCommittedTurn({
      turnId: "turn-domain-1",
      questionText: "Domain A DR 55 traffic 0. Domain B DR 22 có traffic thật. Em chọn con nào?",
      committedAt: 1000,
      intent: "DOMAIN_SELECTION",
      entities: ["domain A", "domain B", "DR", "traffic"],
      numericFacts: ["55", "0", "22"]
    });
    turnContextManager.recordCommittedTurn(turn1);

    const answer1: SuggestedAnswer = {
      openingLine: "Em chọn domain B vì có traffic thật.",
      bullets: ["Domain B có tín hiệu người dùng thật", "Domain A DR cao nhưng traffic 0 rủi ro spam"],
      keywords: ["domain B", "traffic"]
    };

    const decision1 = extractDecisionFromCompletedTurn(turn1.questionText, "DOMAIN_SELECTION", answer1);
    turnContextManager.recordCompletedTurn({
      turnId: turn1.turnId,
      question: turn1.questionText,
      intent: turn1.intent,
      entities: [...turn1.entities],
      numericFacts: [...turn1.numericFacts],
      decision: decision1,
      committedAt: 1000
    });

    // Turn 2: Short follow-up "Tại sao không chọn con A?"
    const prevContext = turnContextManager.getPreviousCompletedContext();
    const followUp2 = resolveFollowUpContext("Tại sao không chọn con A?", prevContext, "turn-followup-2");

    expect(followUp2.contextResolved).toBe(true);
    expect(followUp2.previousTurnId).toBe("turn-domain-1");
    expect(followUp2.inheritedEntities).toContain("domain A");
    expect(followUp2.inheritedEntities).toContain("domain B");
    expect(followUp2.inheritedNumericFacts).toContain("55");

    const turn2 = createCommittedTurn({
      turnId: "turn-followup-2",
      questionText: "Tại sao không chọn con A?",
      committedAt: 2000,
      intent: "DOMAIN_SELECTION",
      parentTurnId: followUp2.previousTurnId,
      followUpContext: followUp2
    });
    turnContextManager.recordCommittedTurn(turn2);

    const answer2: SuggestedAnswer = {
      openingLine: "Domain A DR 55 nhưng traffic bằng 0 cho thấy backlink profile có thể bị thổi phồng hoặc dính thuật toán.",
      bullets: ["DR ảo", "Không có traffic thực tế"],
      keywords: ["Domain A", "traffic 0"]
    };

    turnContextManager.recordCompletedTurn({
      turnId: turn2.turnId,
      question: turn2.questionText,
      intent: turn2.intent,
      entities: [...turn2.entities],
      numericFacts: [...turn2.numericFacts],
      answerSummary: answer2.openingLine,
      committedAt: 2000
    });

    // Turn 3: Topic switch to BUDGET_ALLOCATION
    // "Budget 25 triệu cho site mới em chia thế nào?"
    const prevContextAfter2 = turnContextManager.getPreviousCompletedContext();
    const followUp3 = resolveFollowUpContext("Budget 25 triệu cho site mới em chia thế nào?", prevContextAfter2, "turn-budget-3");

    // Must NOT be resolved as a follow-up to Domain Selection
    expect(followUp3.contextResolved).toBe(false);
    expect(followUp3.inheritedEntities).toHaveLength(0);
    expect(followUp3.inheritedNumericFacts).toHaveLength(0);
    expect(followUp3.inheritedEntities).not.toContain("domain A");
    expect(followUp3.inheritedEntities).not.toContain("domain B");
  });
});
