import { describe, it, expect } from "vitest";
import { classifyQuestionIntent } from "./intentClassifier";
import { classifyQuestionShape } from "./questionShapeClassifier";
import { buildAnswerContract } from "../llm/answerContract";
import { resolveFollowUpContext } from "./followUpDetector";
import { DEFAULT_CANDIDATE_PROFILE } from "../shared/candidateProfile";
import type { InterviewTurnContext } from "./interviewTurnContext";

describe("Phase 6.3.1 Live-Gate Failure Correction Regressions", () => {
  describe("1. Guest Post Metrics vs Domain Selection", () => {
    it("classifies Guest Post evaluation question as STRATEGY_PLAN despite DR and traffic mentions", () => {
      // Original regression
      const q1 = "Tiêu chí chọn lọc site đi Guest Post chất lượng cao của em là gì? Em kiểm tra traffic organic, DR và anchor text ra sao trước khi mua?";
      expect(classifyQuestionIntent(q1).category).toBe("STRATEGY_PLAN");

      // Unseen paraphrase 1
      const q2 = "Khi mua bài PR và guest post thì em check chỉ số DR hay organic traffic trên Ahrefs như thế nào?";
      expect(classifyQuestionIntent(q2).category).toBe("STRATEGY_PLAN");

      // Unseen paraphrase 2
      const q3 = "Tiêu chuẩn chọn site đặt bài guest post và link báo ngách cá cược của em là gì?";
      expect(classifyQuestionIntent(q3).category).toBe("STRATEGY_PLAN");

      // Adversarial negative case: Expired domain comparison MUST remain DOMAIN_SELECTION
      const q4 = "Domain A DR 50 traffic 0, domain B DR 20 có traffic thật. Em chọn domain nào?";
      expect(classifyQuestionIntent(q4).category).toBe("DOMAIN_SELECTION");
    });
  });

  describe("2. Concrete Technical Defects vs Generic Strategy", () => {
    it("classifies concrete technical faults as ONPAGE_DIAGNOSIS even when words like audit/xử lý appear", () => {
      // Original regression
      const q1 = "URL bài viết bị lỗi canonical trỏ vòng tròn và sitemap không update, em audit và xử lý qua GSC như thế nào?";
      const res1 = classifyQuestionIntent(q1);
      expect(res1.category).toBe("ONPAGE_DIAGNOSIS");
      const contract1 = buildAnswerContract({
        question: q1,
        intent: res1,
        candidateProfile: DEFAULT_CANDIDATE_PROFILE
      });
      expect(contract1.answerType).toBe("DIRECT_ACTION_DIAGNOSIS");

      // Unseen paraphrase 1: Redirect loop defect
      const q2 = "Website xuất hiện redirect loop và thẻ canonical bị đặt sai URL gốc, em xử lý và fix lỗi kỹ thuật này ra sao?";
      expect(classifyQuestionIntent(q2).category).toBe("ONPAGE_DIAGNOSIS");

      // Unseen paraphrase 2: Stale sitemap & duplicate content
      const q3 = "Sitemap không update và các bài viết bị duplicate content làm giảm chất lượng trang, em kiểm tra và audit thế nào?";
      expect(classifyQuestionIntent(q3).category).toBe("ONPAGE_DIAGNOSIS");

      // Adversarial negative case: Generic 30-day kickoff plan MUST remain STRATEGY_PLAN
      const q4 = "Trong 30 ngày đầu nhận site mới toanh, em lên kế hoạch audit và triển khai tổng thể thế nào?";
      expect(classifyQuestionIntent(q4).category).toBe("STRATEGY_PLAN");
    });
  });

  describe("3. Internal-Link Workflow vs NO_KEYWORD_SIGNAL", () => {
    it("classifies internal link and silo structuring as STRATEGY_PLAN unless explicit missing ranking symptom exists", () => {
      // Original regression
      const q1 = "Em thiết kế cấu trúc silo và internal link cho money page như thế nào để tối ưu bot crawl và truyền link equity?";
      expect(classifyQuestionIntent(q1).category).toBe("STRATEGY_PLAN");

      // Unseen paraphrase 1
      const q2 = "Cách em điều hướng internal links giữa category và money page để bot Google crawl hiệu quả nhất?";
      expect(classifyQuestionIntent(q2).category).toBe("STRATEGY_PLAN");

      // Unseen paraphrase 2
      const q3 = "Chiến lược phân tầng topic cluster và internal link cho site cá cược thể thao?";
      expect(classifyQuestionIntent(q3).category).toBe("STRATEGY_PLAN");

      // Adversarial negative case: Explicit symptom of bot crawling without keyword reception MUST be NO_KEYWORD_SIGNAL
      const q4 = "Site mới mở bot 10 ngày chưa nhận keyword và chưa có impression, em xử lý thế nào?";
      expect(classifyQuestionIntent(q4).category).toBe("NO_KEYWORD_SIGNAL");
    });
  });

  describe("4. Negation Suppresses Secondary Topic Routing", () => {
    it("does not allow negated concepts to contribute positive routing score", () => {
      // Original regression: CTR drop with negated cannibalization
      const q1 = "Site đang có impression tăng nhưng click giảm mạnh mà không phải do cannibalization, em kiểm tra yếu tố nào?";
      expect(classifyQuestionIntent(q1).category).toBe("GSC_RANKING_DROP");

      // Unseen paraphrase 1: Drop without Core Update or backlink loss
      const q2 = "Traffic giảm 40% nhưng không có Core Update và referring domain không mất, em check gì trước?";
      expect(classifyQuestionIntent(q2).category).toBe("GSC_RANKING_DROP");

      // Unseen paraphrase 2: Spam link spike not negative SEO -> routes to STRATEGY_PLAN
      const q3 = "Site nhận hơn 10.000 backlink lạ nhưng không phải do negative SEO hay đối thủ chơi xấu, em xử lý sao?";
      expect(classifyQuestionIntent(q3).category).toBe("STRATEGY_PLAN");

      // Adversarial negative case: Affirmative cannibalization MUST route to ONPAGE_DIAGNOSIS
      const q4 = "Hai landing page đang bị cannibalization từ khóa làm tụt thứ hạng, em xử lý thế nào?";
      expect(classifyQuestionIntent(q4).category).toBe("ONPAGE_DIAGNOSIS");
    });
  });

  describe("5. Follow-Up Inheritance Precedence", () => {
    it("inherits previous intent when resolving concise entity continuation follow-ups", () => {
      const prevBudgetContext: InterviewTurnContext = {
        turnId: "turn-budget-1",
        question: "Budget 20 triệu em phân bổ Content, Entity, Guest Post và PBN thế nào?",
        intent: "BUDGET_ALLOCATION",
        entities: ["content", "Entity", "Guest Post", "PBN"],
        numericFacts: ["budget: 20 triệu"],
        committedAt: Date.now() - 5000
      };

      // Follow-up: "Còn canonical?" in budget/roadmap context
      const res = resolveFollowUpContext("Còn canonical?", prevBudgetContext, "turn-followup-canonical");
      expect(res.contextResolved).toBe(true);
      expect(res.inheritedIntent).toBe("BUDGET_ALLOCATION");
      expect(res.inheritedEntities).toContain("canonical");

      const contract = buildAnswerContract({
        question: "Còn canonical?",
        intent: "BUDGET_ALLOCATION",
        candidateProfile: DEFAULT_CANDIDATE_PROFILE,
        followUpContext: res
      });
      expect(contract.answerType).toBe("DIRECT_ALLOCATION");
    });
  });

  describe("6. Binary Choice Actions in Technical Questions", () => {
    it("assigns DIRECT_DECISION to diagnosis questions that present binary action choices", () => {
      // Case 1: Merge vs rewrite
      const q1 = "Khi hai bài viết cùng rank một nhóm keyword và bị cannibalization làm tụt thứ hạng, em phân tích Search Intent để merge hay rewrite content?";
      const shape1 = classifyQuestionShape(q1);
      expect(shape1.choiceComparison).toBe(true);
      const contract1 = buildAnswerContract({
        question: q1,
        intent: "ONPAGE_DIAGNOSIS",
        candidateProfile: DEFAULT_CANDIDATE_PROFILE
      });
      expect(contract1.answerType).toBe("DIRECT_DECISION");

      // Case 2: Title optimization vs 301 redirect
      const q2 = "Hai landing page cùng cạnh tranh keyword thì em tối ưu lại title heading hay redirect 301?";
      const shape2 = classifyQuestionShape(q2);
      expect(shape2.choiceComparison).toBe(true);
      const contract2 = buildAnswerContract({
        question: q2,
        intent: "ONPAGE_DIAGNOSIS",
        candidateProfile: DEFAULT_CANDIDATE_PROFILE
      });
      expect(contract2.answerType).toBe("DIRECT_DECISION");
    });
  });

  describe("7. False-Premise Proposition Challenges", () => {
    it("detects premise confirmation questions and mandates upfront direct evaluation", () => {
      const q1 = "Competitor có hơn 2.000 referring domains, vậy mình cũng phải build đủ 2.000 referring domains mới cạnh tranh được, đúng không?";
      const shape1 = classifyQuestionShape(q1);
      expect(shape1.challengePremiseRequired).toBe(true);
      const contract1 = buildAnswerContract({
        question: q1,
        intent: "STRATEGY_PLAN",
        candidateProfile: DEFAULT_CANDIDATE_PROFILE
      });
      expect(contract1.firstSentenceDirective).toContain("evaluate the premise upfront by explicitly agreeing or disagreeing");

      const q2 = "Cứ 301 toàn bộ expired domain DR cao về trang chủ money site là link juice sẽ truyền 100% an toàn mà không lo penalty, đúng không?";
      const shape2 = classifyQuestionShape(q2);
      expect(shape2.challengePremiseRequired).toBe(true);
      const contract2 = buildAnswerContract({
        question: q2,
        intent: "REDIRECT_301",
        candidateProfile: DEFAULT_CANDIDATE_PROFILE
      });
      expect(contract2.firstSentenceDirective).toContain("evaluate the premise upfront by explicitly agreeing or disagreeing");
    });
  });
});
