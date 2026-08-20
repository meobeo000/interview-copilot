import { describe, it, expect, beforeEach } from "vitest";
import { turnContextManager } from "../renderer/store/useCopilotStore";
import { createCommittedTurn, type CommittedInterviewTurn } from "../question-detector/committedTurn";
import { resolveFollowUpContext, extractDecisionFromCompletedTurn } from "../question-detector/followUpDetector";
import { buildAnswerContract } from "../llm/answerContract";
import type { QuestionIntentCategory } from "../question-detector/intentClassifier";
import type { SuggestedAnswer } from "../shared/types";

interface TurnScenario {
  id: string;
  transcript: string;
  expectedIntent: QuestionIntentCategory;
  isFollowUp?: boolean;
  unrelatedFactsForbidden: string[];
}

const ADVERSARIAL_20_TURNS: TurnScenario[] = [
  // 1. Domain Selection
  {
    id: "turn-01",
    transcript: "Domain A DR 55 traffic 0. Domain B DR 22 có traffic thật. Em chọn con nào?",
    expectedIntent: "DOMAIN_SELECTION",
    unrelatedFactsForbidden: ["PBN", "disavow", "301", "25 triệu"]
  },
  // 2. Follow-up 1
  {
    id: "turn-02",
    transcript: "Tại sao không chọn con A?",
    expectedIntent: "DOMAIN_SELECTION",
    isFollowUp: true,
    unrelatedFactsForbidden: ["disavow", "301", "GSC manual action", "25 triệu"]
  },
  // 3. PBN Timing
  {
    id: "turn-03",
    transcript: "Site mới mở 10 ngày thì em đã nên bơm link PBN vào chưa?",
    expectedIntent: "PBN_TIMING",
    unrelatedFactsForbidden: ["Domain A DR 55", "Domain B DR 22", "disavow"]
  },
  // 4. Follow-up 2
  {
    id: "turn-04",
    transcript: "Tín hiệu nào?",
    expectedIntent: "PBN_TIMING",
    isFollowUp: true,
    unrelatedFactsForbidden: ["Domain A DR 55", "disavow", "301"]
  },
  // 5. GSC Ranking Drop
  {
    id: "turn-05",
    transcript: "GSC báo impression tăng nhưng click giảm mạnh sau đợt cập nhật, em phân tích thế nào?",
    expectedIntent: "GSC_RANKING_DROP",
    unrelatedFactsForbidden: ["PBN 10 ngày", "Domain A DR 55", "301 migration"]
  },
  // 6. Follow-up 3
  {
    id: "turn-06",
    transcript: "Nếu CTR vẫn thấp thì sao?",
    expectedIntent: "GSC_RANKING_DROP",
    isFollowUp: true,
    unrelatedFactsForbidden: ["PBN 10 ngày", "Domain A DR 55", "301"]
  },
  // 7. Negative SEO Disavow
  {
    id: "turn-07",
    transcript: "Site bị bắn 50k backlink spam từ domain lạ trong 3 ngày, em có disavow ngay không?",
    expectedIntent: "NEGATIVE_SEO",
    unrelatedFactsForbidden: ["Domain A DR 55", "PBN 10 ngày", "GSC impression tăng"]
  },
  // 8. Follow-up 4
  {
    id: "turn-08",
    transcript: "Khi nào thì disavow?",
    expectedIntent: "NEGATIVE_SEO",
    isFollowUp: true,
    unrelatedFactsForbidden: ["Domain A DR 55", "PBN 10 ngày"]
  },
  // 9. Budget Allocation
  {
    id: "turn-09",
    transcript: "Ngân sách 25 triệu cho site mới em chia thế nào giữa content, guest post và entity?",
    expectedIntent: "BUDGET_ALLOCATION",
    unrelatedFactsForbidden: ["Domain A DR 55", "50k backlink spam", "GSC impression"]
  },
  // 10. Follow-up 5
  {
    id: "turn-10",
    transcript: "Còn PBN?",
    expectedIntent: "BUDGET_ALLOCATION",
    isFollowUp: true,
    unrelatedFactsForbidden: ["Domain A DR 55", "50k backlink spam"]
  },
  // 11. No Keyword Signal
  {
    id: "turn-11",
    transcript: "Site mở bot hai tuần vẫn chưa nhận keyword thì em xử lý thế nào?",
    expectedIntent: "NO_KEYWORD_SIGNAL",
    unrelatedFactsForbidden: ["25 triệu", "50k backlink spam", "Domain A DR 55"]
  },
  // 12. Follow-up 6
  {
    id: "turn-12",
    transcript: "Bước tiếp theo là gì?",
    expectedIntent: "NO_KEYWORD_SIGNAL",
    isFollowUp: true,
    unrelatedFactsForbidden: ["25 triệu", "50k backlink spam", "Domain A DR 55"]
  },
  // 13. Redirect 301 Migration
  {
    id: "turn-13",
    transcript: "Khi chuyển 301 sang domain mới thì cần giữ lại những gì để không mất thứ hạng?",
    expectedIntent: "REDIRECT_301",
    unrelatedFactsForbidden: ["25 triệu", "PBN 10 ngày", "50k backlink spam"]
  },
  // 14. Follow-up 7
  {
    id: "turn-14",
    transcript: "Sau đó thì sao?",
    expectedIntent: "REDIRECT_301",
    isFollowUp: true,
    unrelatedFactsForbidden: ["25 triệu", "PBN 10 ngày", "50k backlink spam"]
  },
  // 15. Core Update Recovery
  {
    id: "turn-15",
    transcript: "Site bị tụt 40% traffic sau đợt Core Update vừa rồi thì quy trình audit lại ra sao?",
    expectedIntent: "CORE_UPDATE_RECOVERY",
    unrelatedFactsForbidden: ["25 triệu", "301 domain mới", "PBN 10 ngày"]
  },
  // 16. Follow-up 8
  {
    id: "turn-16",
    transcript: "Em check gì tiếp?",
    expectedIntent: "CORE_UPDATE_RECOVERY",
    isFollowUp: true,
    unrelatedFactsForbidden: ["25 triệu", "301 domain mới", "PBN 10 ngày"]
  },
  // 17. Domain Selection 2 (New Domain Comparison)
  {
    id: "turn-17",
    transcript: "Domain C có 500 RD nhưng anchor spam tiếng Nhật. Domain D 50 RD sạch cùng ngành. Em lấy con nào?",
    expectedIntent: "DOMAIN_SELECTION",
    unrelatedFactsForbidden: ["Domain A DR 55", "Domain B DR 22", "Core Update tụt 40%"]
  },
  // 18. Follow-up 9
  {
    id: "turn-18",
    transcript: "Vì sao em chọn domain D?",
    expectedIntent: "DOMAIN_SELECTION",
    isFollowUp: true,
    unrelatedFactsForbidden: ["Domain A DR 55", "Domain B DR 22", "Core Update tụt 40%"]
  },
  // 19. Onpage Sapo Diagnosis
  {
    id: "turn-19",
    transcript: "Bài viết chuẩn SEO nhưng tỷ lệ thoát cao ở đoạn sapo, em tối ưu lại như thế nào?",
    expectedIntent: "ONPAGE_DIAGNOSIS",
    unrelatedFactsForbidden: ["Domain C 500 RD", "Domain D 50 RD", "Core Update 40%"]
  },
  // 20. Redirect 301 Contingency
  {
    id: "turn-20",
    transcript: "Site đang top nhưng có nguy cơ dính chặn mạng, em lên phương án 301 dự phòng thế nào?",
    expectedIntent: "REDIRECT_301",
    unrelatedFactsForbidden: ["đoạn sapo thoát cao", "Domain C 500 RD", "25 triệu"]
  }
];

describe("Adversarial 20-Turn Strict Turn Isolation & Contamination Test", () => {
  beforeEach(() => {
    turnContextManager.reset();
  });

  it("executes 20 consecutive turns and enforces zero cross-turn contamination", () => {
    const executedTurns: {
      turn: CommittedInterviewTurn;
      contract: ReturnType<typeof buildAnswerContract>;
      answer: SuggestedAnswer;
    }[] = [];

    for (let i = 0; i < ADVERSARIAL_20_TURNS.length; i++) {
      const scenario = ADVERSARIAL_20_TURNS[i];
      const prevContext = turnContextManager.getPreviousCompletedContext();

      const followUpContext = resolveFollowUpContext(scenario.transcript, prevContext, scenario.id);

      if (scenario.isFollowUp) {
        expect(followUpContext.contextResolved, `Turn ${scenario.id} should resolve follow-up context`).toBe(true);
        expect(followUpContext.previousTurnId, `Turn ${scenario.id} must have explicit parentTurnId`).toBe(
          ADVERSARIAL_20_TURNS[i - 1].id
        );
      } else {
        expect(followUpContext.contextResolved, `Turn ${scenario.id} topic switch must NOT resolve follow-up`).toBe(false);
      }

      const turn = createCommittedTurn({
        turnId: scenario.id,
        questionText: scenario.transcript,
        committedAt: 10000 + i * 5000,
        intent: scenario.expectedIntent,
        parentTurnId: followUpContext.previousTurnId,
        followUpContext
      });

      turnContextManager.recordCommittedTurn(turn);

      // Verify immutable snapshot invariant
      expect(turn.turnId).toBe(scenario.id);
      expect(turn.questionText).toBe(scenario.transcript);
      expect(turn.hash).toBeDefined();

      const contract = buildAnswerContract({
        question: turn.questionText,
        intent: turn.intent,
        followUpContext: turn.followUpContext
      });

      // Verify fact boundary in contract & context
      for (const forbidden of scenario.unrelatedFactsForbidden) {
        const contractSummary = JSON.stringify(contract);
        expect(
          contractSummary.includes(forbidden),
          `Turn ${scenario.id} contract must NOT contain unrelated fact: "${forbidden}"`
        ).toBe(false);
      }

      // Simulate Answer generation
      const answer: SuggestedAnswer = {
        openingLine: `Spoken answer for ${scenario.id}`,
        bullets: [`Key technical reason for ${scenario.id}`],
        keywords: [scenario.expectedIntent]
      };

      const decision = extractDecisionFromCompletedTurn(turn.questionText, turn.intent, answer, contract);

      turnContextManager.recordCompletedTurn({
        turnId: turn.turnId,
        question: turn.questionText,
        intent: turn.intent,
        entities: [...turn.entities],
        numericFacts: [...turn.numericFacts],
        decision,
        answerSummary: answer.openingLine,
        committedAt: turn.committedAt + 500
      });

      executedTurns.push({ turn, contract, answer });
    }

    // Verify all 20 turns maintained exact ownership
    expect(executedTurns).toHaveLength(20);
    for (let i = 0; i < executedTurns.length; i++) {
      expect(executedTurns[i].turn.turnId).toBe(ADVERSARIAL_20_TURNS[i].id);
    }
  });
});
