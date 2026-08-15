import { describe, expect, it } from "vitest";
import { classifyQuestionIntent } from "../question-detector/intentClassifier";
import { isEligibleForSpeculativeAnswer } from "../question-detector/speculativeConfig";
import { ContextAwareTranscriptCorrector } from "../corrector/contextAwareCorrector";

describe("Phase 2 Three Target Questions Validation", () => {
  const corrector = new ContextAwareTranscriptCorrector();

  const testCases = [
    {
      id: "Q1",
      partial: "Site mở bot hai tuần vẫn chưa nhận keyword...",
      full: "Site mở bot hai tuần vẫn chưa nhận keyword thì em xử lý thế nào?",
      expectedIntent: "NO_KEYWORD_SIGNAL"
    },
    {
      id: "Q2",
      partial: "Domain A DR 55 traffic bằng 0, domain B DR 20 nhưng có traffic thật...",
      full: "Domain A DR 55 traffic bằng 0, domain B DR 20 nhưng có traffic thật và backlink đúng niche. Em chọn con nào?",
      expectedIntent: "DOMAIN_SELECTION"
    },
    {
      id: "Q3",
      partial: "Trong GSC impressions giảm 5%, click giảm 40%, average position từ 3.2 xuống 6.8...",
      full: "Trong GSC impressions giảm 5%, click giảm 40%, average position từ 3.2 xuống 6.8. Em phân tích thế nào?",
      expectedIntent: "GSC_RANKING_DROP"
    }
  ];

  testCases.forEach((tc) => {
    it(`validates ${tc.id}: ${tc.full}`, () => {
      // 1. Partial transcription normalization & intent detection
      const partialCorrected = corrector.correct(tc.partial, { domain: "seo_igaming_interview" });
      const partialIntent = classifyQuestionIntent(partialCorrected.correctedText, tc.partial);

      expect(partialIntent.category).toBe(tc.expectedIntent);
      expect(isEligibleForSpeculativeAnswer(partialIntent, partialCorrected.correctedText)).toBe(true);

      // 2. Full question normalization & intent consistency (speculative request reused)
      const fullCorrected = corrector.correct(tc.full, { domain: "seo_igaming_interview" });
      const fullIntent = classifyQuestionIntent(fullCorrected.correctedText, tc.full);

      expect(fullIntent.category).toBe(tc.expectedIntent);
      // Because intent matches, speculative request is reused with exactly ONE Gemini request!
      expect(partialIntent.category).toBe(fullIntent.category);
    });
  });
});
