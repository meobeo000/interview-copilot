import { describe, it, expect } from "vitest";
import {
  detectFollowUp,
  resolveFollowUpContext
} from "./followUpDetector";
import { InterviewTurnContextManager, type InterviewTurnContext } from "./interviewTurnContext";
import { buildAnswerContract, formatContractForPrompt } from "../llm/answerContract";

describe("Phase 6.1 Follow-Up Detector & Context Resolution", () => {
  describe("detectFollowUp - Deterministic Shape Classification", () => {
    it("recognizes WHY questions", () => {
      const cases = [
        "Tại sao?",
        "Tại sao",
        "Vì sao?",
        "Vì sao",
        "Sao?",
        "Tại sao lại như vậy?",
        "Vì sao em chọn cách đó?"
      ];
      for (const c of cases) {
        const res = detectFollowUp(c);
        expect(res.detected, `Failed on: ${c}`).toBe(true);
        expect(res.type).toBe("WHY");
      }
    });

    it("recognizes SIGNAL questions", () => {
      const cases = [
        "Tín hiệu nào?",
        "Dựa vào tín hiệu nào?",
        "Em dựa vào đâu?",
        "Dựa vào đâu?",
        "Dựa trên tín hiệu nào?",
        "Nhìn vào chỉ số nào?"
      ];
      for (const c of cases) {
        const res = detectFollowUp(c);
        expect(res.detected, `Failed on: ${c}`).toBe(true);
        expect(res.type).toBe("SIGNAL");
      }
    });

    it("recognizes WHEN questions", () => {
      const cases = [
        "Khi nào?",
        "Khi nào em dừng?",
        "Khi nào thì dừng?",
        "Bao lâu thì dừng?",
        "Khi nào tăng link?"
      ];
      for (const c of cases) {
        const res = detectFollowUp(c);
        expect(res.detected, `Failed on: ${c}`).toBe(true);
        expect(res.type).toBe("WHEN");
      }
    });

    it("recognizes FAILURE_NEXT_STEP questions", () => {
      const cases = [
        "Nếu vẫn không lên thì sao?",
        "Nếu vẫn tụt thì sao?",
        "Nếu không lên thì sao?",
        "Vậy bước tiếp theo là gì?",
        "Vậy em check gì tiếp?",
        "Tiếp theo em làm gì?"
      ];
      for (const c of cases) {
        const res = detectFollowUp(c);
        expect(res.detected, `Failed on: ${c}`).toBe(true);
        expect(res.type).toBe("FAILURE_NEXT_STEP");
      }
    });

    it("recognizes ENTITY_CONTINUATION questions with target entity extraction", () => {
      const cases: [string, string][] = [
        ["Còn PBN?", "PBN"],
        ["Còn Guest Post?", "Guest Post"],
        ["Thế còn Entity?", "Entity"],
        ["Còn internal link?", "internal link"],
        ["Còn backlink thì sao?", "backlink"],
        ["Còn Content thì sao?", "content"]
      ];
      for (const [c, expectedEntity] of cases) {
        const res = detectFollowUp(c);
        expect(res.detected, `Failed on: ${c}`).toBe(true);
        expect(res.type).toBe("ENTITY_CONTINUATION");
        expect(res.targetEntity).toBe(expectedEntity);
      }
    });

    it("recognizes DECISION_REASON questions", () => {
      const res = detectFollowUp("Vì sao em chọn domain B?");
      expect(res.detected).toBe(true);
      expect(res.type).toBe("DECISION_REASON");
      expect(res.targetEntity).toBe("domain B");
    });

    it("recognizes GENERAL_CONTINUATION questions", () => {
      const cases = ["Rồi sao nữa?", "Sau đó thì sao?", "Rồi làm gì?"];
      for (const c of cases) {
        const res = detectFollowUp(c);
        expect(res.detected, `Failed on: ${c}`).toBe(true);
        expect(res.type).toBe("GENERAL_CONTINUATION");
      }
    });

    it("does NOT classify standard standalone questions as follow-ups", () => {
      const standaloneCases = [
        "Domain A DR 55 traffic 0 và domain B DR 20 có traffic thật em chọn con nào?",
        "Budget 20 triệu em phân bổ Content, Entity, Guest Post và PBN thế nào?",
        "Site mở bot hai tuần nhưng chưa nhận keyword em xử lý thế nào?"
      ];
      for (const c of standaloneCases) {
        const res = detectFollowUp(c);
        expect(res.detected).toBe(false);
      }
    });
  });

  describe("Required Test A — WHY Follow-Up", () => {
    it("inherits NEGATIVE_SEO and previous disavow decision", () => {
      const prevTurn: InterviewTurnContext = {
        turnId: "turn-neg-1",
        question: "20.000 backlink spam xuất hiện nhưng ranking chỉ dao động nhẹ. Em có disavow ngay không?",
        intent: "NEGATIVE_SEO",
        answerType: "DIRECT_DECISION",
        entities: ["negative SEO", "backlink", "Ahrefs", "GSC"],
        numericFacts: ["20.000 backlink"],
        decision: {
          action: "Do not disavow immediately; inspect and monitor first."
        },
        answerSummary: "Em chưa disavow ngay, em theo dõi thêm.",
        committedAt: Date.now() - 5000
      };

      const resolved = resolveFollowUpContext("Tại sao?", prevTurn, "turn-neg-followup");
      expect(resolved.followUpType).toBe("WHY");
      expect(resolved.contextResolved).toBe(true);
      expect(resolved.inheritedIntent).toBe("NEGATIVE_SEO");
      expect(resolved.previousDecision?.action).toContain("Do not disavow");

      const contract = buildAnswerContract({
        question: "Tại sao?",
        intent: resolved.inheritedIntent,
        followUpContext: resolved
      });

      expect(contract.answerType).toBe("DIRECT_DECISION");
      expect(contract.firstSentenceDirective).toContain("disavow");
      const prompt = formatContractForPrompt(contract);
      expect(prompt).toContain("[INTERVIEW FOLLOW-UP CONTEXT]:");
      expect(prompt).toContain("NEGATIVE_SEO");
      expect(prompt).toContain("Do not disavow immediately");
    });
  });

  describe("Required Test B — Fresh Session (No Previous Context)", () => {
    it("reports followUpDetected = true but contextResolved = false with no fabricated context", () => {
      const resolved = resolveFollowUpContext("Tại sao?", null, "turn-fresh");
      expect(resolved.followUpType).toBe("WHY");
      expect(resolved.contextResolved).toBe(false);
      expect(resolved.inheritedIntent).toBeUndefined();
      expect(resolved.previousQuestion).toBeUndefined();
      expect(resolved.previousTurnId).toBeUndefined();

      const contract = buildAnswerContract({
        question: "Tại sao?",
        intent: "UNKNOWN",
        followUpContext: resolved
      });
      const prompt = formatContractForPrompt(contract);
      expect(prompt).not.toContain("[INTERVIEW FOLLOW-UP CONTEXT]:");
    });
  });

  describe("Required Test C — Domain Decision Preservation", () => {
    it("inherits DOMAIN_SELECTION, preserves DR values and domain B choice", () => {
      const prevTurn: InterviewTurnContext = {
        turnId: "turn-dom-1",
        question: "Domain A DR 55 traffic bằng 0, domain B DR 20 có traffic thật. Em chọn domain nào?",
        intent: "DOMAIN_SELECTION",
        answerType: "DIRECT_DECISION",
        entities: ["DR", "traffic", "expired domain"],
        numericFacts: ["dr:20,55"],
        decision: {
          choice: "domain B",
          action: "Em chọn domain B."
        },
        answerSummary: "Em chọn domain B.",
        committedAt: Date.now() - 5000
      };

      const resolved = resolveFollowUpContext("Vì sao?", prevTurn, "turn-dom-followup");
      expect(resolved.contextResolved).toBe(true);
      expect(resolved.inheritedIntent).toBe("DOMAIN_SELECTION");
      expect(resolved.inheritedNumericFacts).toContain("dr:20,55");
      expect(resolved.previousDecision?.choice).toBe("domain B");

      const contract = buildAnswerContract({
        question: "Vì sao?",
        intent: resolved.inheritedIntent,
        followUpContext: resolved
      });

      expect(contract.answerType).toBe("DIRECT_DECISION");
      expect(contract.firstSentenceDirective).toContain("domain B");
    });
  });

  describe("Required Test D — Signal Follow-Up", () => {
    it("inherits PBN_TIMING and enforces concrete signal AnswerContract", () => {
      const prevTurn: InterviewTurnContext = {
        turnId: "turn-pbn-1",
        question: "Khoảng khi nào em bắt đầu đi PBN?",
        intent: "PBN_TIMING",
        answerType: "DIRECT_TIMING_EXPLANATION",
        entities: ["PBN", "indexing", "impression"],
        numericFacts: [],
        decision: {
          action: "Wait for indexing and impressions."
        },
        committedAt: Date.now() - 5000
      };

      const resolved = resolveFollowUpContext("Tín hiệu nào?", prevTurn, "turn-pbn-followup");
      expect(resolved.contextResolved).toBe(true);
      expect(resolved.followUpType).toBe("SIGNAL");
      expect(resolved.inheritedIntent).toBe("PBN_TIMING");

      const contract = buildAnswerContract({
        question: "Tín hiệu nào?",
        intent: resolved.inheritedIntent,
        followUpContext: resolved
      });

      expect(contract.answerType).toBe("DIRECT_TIMING_EXPLANATION");
      expect(contract.firstSentenceDirective).toContain("concrete, verifiable signals");
    });
  });

  describe("Required Test E — Failure Next Step", () => {
    it("inherits NO_KEYWORD_SIGNAL and progresses beyond initial checklist", () => {
      const prevTurn: InterviewTurnContext = {
        turnId: "turn-nokey-1",
        question: "Site index hai tuần nhưng chưa nhận keyword, em xử lý thế nào?",
        intent: "NO_KEYWORD_SIGNAL",
        answerType: "DIRECT_ACTION_DIAGNOSIS",
        entities: ["indexing", "keyword", "on-page", "internal link"],
        numericFacts: ["duration:2_tuần"],
        decision: {
          action: "Check intent, on-page, and internal links."
        },
        answerSummary: "check intent + on-page + internal link",
        committedAt: Date.now() - 5000
      };

      const resolved = resolveFollowUpContext("Nếu vẫn không lên thì sao?", prevTurn, "turn-nokey-followup");
      expect(resolved.contextResolved).toBe(true);
      expect(resolved.followUpType).toBe("FAILURE_NEXT_STEP");
      expect(resolved.inheritedIntent).toBe("NO_KEYWORD_SIGNAL");

      const contract = buildAnswerContract({
        question: "Nếu vẫn không lên thì sao?",
        intent: resolved.inheritedIntent,
        followUpContext: resolved
      });

      expect(contract.answerType).toBe("DIRECT_ACTION_DIAGNOSIS");
      expect(contract.firstSentenceDirective).toContain("next level of diagnostic action");
    });
  });

  describe("Required Test F — Entity Continuation", () => {
    it("inherits BUDGET_ALLOCATION, preserves 20 million budget, focuses on PBN", () => {
      const prevTurn: InterviewTurnContext = {
        turnId: "turn-bud-1",
        question: "Budget 20 triệu em phân bổ Content, Entity, Guest Post và PBN thế nào?",
        intent: "BUDGET_ALLOCATION",
        answerType: "DIRECT_ALLOCATION",
        entities: ["Content", "Entity", "Guest Post", "PBN"],
        numericFacts: ["budget:20000000:vnd"],
        decision: {
          action: "8tr Content, 4tr Entity, 5tr Guest Post, 3tr PBN"
        },
        committedAt: Date.now() - 5000
      };

      const resolved = resolveFollowUpContext("Còn PBN?", prevTurn, "turn-bud-followup");
      expect(resolved.contextResolved).toBe(true);
      expect(resolved.followUpType).toBe("ENTITY_CONTINUATION");
      expect(resolved.targetEntity).toBe("PBN");
      expect(resolved.inheritedIntent).toBe("BUDGET_ALLOCATION");

      const contract = buildAnswerContract({
        question: "Còn PBN?",
        intent: resolved.inheritedIntent,
        followUpContext: resolved
      });

      expect(contract.answerType).toBe("DIRECT_ALLOCATION");
      expect(contract.firstSentenceDirective).toContain("PBN");
      expect(contract.requiredFacts).toContain("budget:20000000:vnd");
    });
  });

  describe("Required Test G — Constraint Preservation", () => {
    it("preserves all ruled-out constraints and metric values across follow-up", () => {
      const prevTurn: InterviewTurnContext = {
        turnId: "turn-const-1",
        question: "Traffic giảm 40%. Không có Core Update. Không có manual action. Indexing và crawl bình thường. Referring domain không thay đổi. Em check gì?",
        intent: "STRATEGY_PLAN",
        entities: ["traffic", "Core Update", "manual action", "indexing", "crawl", "referring domain"],
        numericFacts: ["metrics: 40%"],
        scenarioConstraints: {
          coreUpdateOccurred: false,
          manualAction: false,
          indexingIssue: false,
          crawlIssue: false,
          referringDomainLoss: false,
          trafficChangePercent: -40,
          provenance: []
        },
        committedAt: Date.now() - 5000
      };

      const resolved = resolveFollowUpContext("Vậy bước tiếp theo là gì?", prevTurn, "turn-const-followup");
      expect(resolved.contextResolved).toBe(true);

      const contract = buildAnswerContract({
        question: "Vậy bước tiếp theo là gì?",
        intent: resolved.inheritedIntent,
        followUpContext: resolved
      });

      const sc = contract.scenarioConstraints;
      expect(sc?.coreUpdateOccurred).toBe(false);
      expect(sc?.manualAction).toBe(false);
      expect(sc?.indexingIssue).toBe(false);
      expect(sc?.crawlIssue).toBe(false);
      expect(sc?.referringDomainLoss).toBe(false);
      expect(sc?.trafficChangePercent).toBe(-40);

      const prompt = formatContractForPrompt(contract);
      expect(prompt).toContain("coreUpdateOccurred = false");
      expect(prompt).toContain("manualAction = false");
      expect(prompt).toContain("referringDomainLoss = false");
    });
  });

  describe("Required Test H — Context Replacement", () => {
    it("replaces Turn A with Turn B when Turn B completes", () => {
      const manager = new InterviewTurnContextManager();

      // Turn A
      manager.recordCompletedTurn({
        turnId: "turn-A",
        question: "Domain A hay domain B?",
        intent: "DOMAIN_SELECTION",
        entities: ["DR"],
        numericFacts: ["dr:20,55"],
        committedAt: Date.now() - 10000
      });

      // Turn B
      manager.recordCompletedTurn({
        turnId: "turn-B",
        question: "Sau một đợt Core Update organic traffic giảm 50%, em xử lý thế nào?",
        intent: "CORE_UPDATE_RECOVERY",
        entities: ["Core Update", "traffic"],
        numericFacts: ["metrics: 50%"],
        committedAt: Date.now() - 5000
      });

      // Turn C
      const resolved = resolveFollowUpContext("Tại sao?", manager.getPreviousCompletedContext(), "turn-C");
      expect(resolved.contextResolved).toBe(true);
      expect(resolved.previousTurnId).toBe("turn-B");
      expect(resolved.inheritedIntent).toBe("CORE_UPDATE_RECOVERY");
      expect(resolved.inheritedEntities).not.toContain("DR");
    });
  });

  describe("Required Test I — Aborted Turn Handling", () => {
    it("does not pollute or destroy previous completed context on aborted turn", () => {
      const manager = new InterviewTurnContextManager();

      // Turn A completed
      manager.recordCompletedTurn({
        turnId: "turn-A",
        question: "Khoảng khi nào em bắt đầu đi PBN?",
        intent: "PBN_TIMING",
        entities: ["PBN"],
        numericFacts: [],
        committedAt: Date.now() - 10000
      });

      // Turn B starts but is aborted before completion
      manager.setCurrentTurn({
        turnId: "turn-B-in-flight",
        question: "Partial unfinished utterance...",
        intent: "UNKNOWN",
        entities: [],
        numericFacts: [],
        committedAt: Date.now()
      });
      manager.abortCurrentTurn();

      // Next follow-up
      const prevContext = manager.getPreviousCompletedContext();
      expect(prevContext?.turnId).toBe("turn-A");
      expect(prevContext?.intent).toBe("PBN_TIMING");

      const resolved = resolveFollowUpContext("Tín hiệu nào?", prevContext, "turn-followup");
      expect(resolved.contextResolved).toBe(true);
      expect(resolved.inheritedIntent).toBe("PBN_TIMING");
    });
  });
});
