import { describe, expect, it } from "vitest";
import { classifyQuestionIntent } from "../question-detector/intentClassifier";
import { isEligibleForSpeculativeAnswer } from "../question-detector/speculativeConfig";
import { ContextAwareTranscriptCorrector } from "../corrector/contextAwareCorrector";

describe("Phase 2 Three Target Questions Validation", () => {
  const corrector = new ContextAwareTranscriptCorrector();

  const testCases = [
    {
      id: "Q1",
      partialPreamble: "Site mở bot hai tuần vẫn chưa nhận keyword...",
      full: "Site mở bot hai tuần vẫn chưa nhận keyword thì em xử lý thế nào?",
      expectedIntent: "NO_KEYWORD_SIGNAL"
    },
    {
      id: "Q2",
      partialPreamble: "Domain A DR 55 traffic bằng 0, domain B DR 20 nhưng có traffic thật...",
      full: "Domain A DR 55 traffic bằng 0, domain B DR 20 nhưng có traffic thật và backlink đúng niche. Em chọn con nào?",
      expectedIntent: "DOMAIN_SELECTION"
    },
    {
      id: "Q3",
      partialPreamble: "Trong GSC impressions giảm 5%, click giảm 40%, average position từ 3.2 xuống 6.8...",
      full: "Trong GSC impressions giảm 5%, click giảm 40%, average position từ 3.2 xuống 6.8. Em phân tích thế nào?",
      expectedIntent: "GSC_RANKING_DROP"
    }
  ];

  testCases.forEach((tc) => {
    it(`validates ${tc.id}: ${tc.full}`, () => {
      // 1. Partial preamble speech is protected from premature cutting off
      const preambleCorrected = corrector.correct(tc.partialPreamble, { domain: "seo_igaming_interview" });
      const preambleIntent = classifyQuestionIntent(preambleCorrected.correctedText, tc.partialPreamble);

      expect(preambleIntent.category).toBe(tc.expectedIntent);
      // Preamble without end marker is protected (false) so interviewer can finish
      expect(isEligibleForSpeculativeAnswer(preambleIntent, preambleCorrected.correctedText)).toBe(false);

      // 2. Full question normalization & intent consistency
      const fullCorrected = corrector.correct(tc.full, { domain: "seo_igaming_interview" });
      const fullIntent = classifyQuestionIntent(fullCorrected.correctedText, tc.full);

      expect(fullIntent.category).toBe(tc.expectedIntent);
      // Completed question with question marker triggers answer generation
      expect(isEligibleForSpeculativeAnswer(fullIntent, fullCorrected.correctedText)).toBe(true);
    });
  });
});
