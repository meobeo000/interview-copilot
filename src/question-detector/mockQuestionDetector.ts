import type { QuestionDetectionResult } from "../shared/types";
import type { QuestionDetector } from "./types";

export class MockQuestionDetector implements QuestionDetector {
  async analyze(rawTranscript: string): Promise<QuestionDetectionResult> {
    const normalized = rawTranscript.replace(/\s+/g, " ").trim();
    const seoSignals = ["GSC", "GA4", "backlink", "canonical", "301", "404", "robots.txt", "sitemap"];
    const hitCount = seoSignals.filter((term) => normalized.toLowerCase().includes(term.toLowerCase())).length;

    if (!normalized.endsWith("?") || hitCount < 2) {
      return {
        isQuestion: false,
        confidence: 0.48,
        reason: "Mock detector is waiting for semantic completeness and SEO context."
      };
    }

    return {
      isQuestion: true,
      confidence: 0.93,
      cleanedQuestion:
        "Nếu website giảm organic traffic sau Core Update, có dấu hiệu mất referring domain, canonical/301 sai và lỗi indexing, bạn sẽ ưu tiên kiểm tra và xử lý thế nào?",
      topic: "Technical SEO / Core Update recovery"
    };
  }
}
