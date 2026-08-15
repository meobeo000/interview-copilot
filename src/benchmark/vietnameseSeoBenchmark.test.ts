import { describe, expect, it } from "vitest";
import { ContextAwareTranscriptCorrector } from "../corrector/contextAwareCorrector";
import { classifyQuestionIntent } from "../question-detector/intentClassifier";
import { VIETNAMESE_SEO_BENCHMARK_CASES } from "./vietnameseSeoBenchmark.data";

describe("Mixed Vietnamese/English SEO Benchmark (32 Cases)", () => {
  const corrector = new ContextAwareTranscriptCorrector();

  it("contains at least 30 realistic interview cases", () => {
    expect(VIETNAMESE_SEO_BENCHMARK_CASES.length).toBeGreaterThanOrEqual(30);
  });

  VIETNAMESE_SEO_BENCHMARK_CASES.forEach((benchmarkCase) => {
    it(`[${benchmarkCase.id}] ${benchmarkCase.description}`, () => {
      // 1. Semantic normalization boundary
      const correctionResult = corrector.correct(benchmarkCase.rawTranscript, {
        domain: "seo_igaming_interview"
      });

      // Raw transcript must be preserved untouched
      expect(correctionResult.rawText).toBe(benchmarkCase.rawTranscript);

      // Expected normalized terms must appear in correctedText
      for (const term of benchmarkCase.expectedNormalizedTerms) {
        expect(
          correctionResult.correctedText.toLowerCase()
        ).toContain(term.toLowerCase());
      }

      // 2. Question Intent Classification
      const intent = classifyQuestionIntent(
        correctionResult.correctedText,
        benchmarkCase.rawTranscript
      );

      expect(intent.category).toBe(benchmarkCase.expectedIntent);
      expect(intent.rawTranscript).toBe(benchmarkCase.rawTranscript);

      if (benchmarkCase.expectedIntent !== "UNKNOWN") {
        expect(intent.confidence).toBeGreaterThanOrEqual(0.7);
        expect(intent.evidence.length).toBeGreaterThan(0);
      } else {
        expect(intent.confidence).toBeLessThan(0.5);
      }
    });
  });
});
