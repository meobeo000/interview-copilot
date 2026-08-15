import { describe, expect, it } from "vitest";
import {
  calculatePipelineMetrics,
  extractFirstUsefulAnswer,
  formatPipelineMetricsLog,
  type PipelineTimestamps
} from "./telemetry";

describe("Telemetry & Latency Calculations", () => {
  it("calculates accurate pipeline metrics across all timestamps", () => {
    const timestamps: PipelineTimestamps = {
      speechLastActivityAt: 1000,
      lastSttPartialAt: 950,
      lastSttFinalAt: 1000,
      questionIntentReadyAt: 1400,
      questionCommittedAt: 2800,
      answerRequestStartedAt: 2820,
      firstAnswerTokenAt: 3300,
      firstUsefulAnswerAt: 3500,
      answerCompletedAt: 4200
    };

    const metrics = calculatePipelineMetrics(timestamps);

    expect(metrics.speechEndToIntent).toBe(400);
    expect(metrics.speechEndToCommit).toBe(1800);
    expect(metrics.intentToRequest).toBe(1420);
    expect(metrics.requestToFirstToken).toBe(480);
    expect(metrics.speechEndToFirstToken).toBe(2300);
    expect(metrics.speechEndToFirstUsefulAnswer).toBe(2500);
    expect(metrics.totalAnswerGeneration).toBe(1380);

    const logBlock = formatPipelineMetricsLog(metrics);
    expect(logBlock).toContain("[INTERVIEW LATENCY]");
    expect(logBlock).toContain("speechEndToIntent: 400 ms");
    expect(logBlock).toContain("speechEndToCommit: 1800 ms");
    expect(logBlock).toContain("intentToRequest: 1420 ms");
    expect(logBlock).toContain("requestToFirstToken: 480 ms");
    expect(logBlock).toContain("speechEndToFirstToken: 2300 ms");
    expect(logBlock).toContain("speechEndToFirstUsefulAnswer: 2500 ms");
    expect(logBlock).toContain("totalAnswerGeneration: 1380 ms");
  });

  describe("extractFirstUsefulAnswer", () => {
    it("rejects JSON structural tokens, syntax delimiters, and empty strings", () => {
      expect(extractFirstUsefulAnswer("")).toBeUndefined();
      expect(extractFirstUsefulAnswer("   \n\t ")).toBeUndefined();
      expect(extractFirstUsefulAnswer("{")).toBeUndefined();
      expect(extractFirstUsefulAnswer("{\n  \"openingLine\": \"\"")).toBeUndefined();
      expect(extractFirstUsefulAnswer("{\"openingLine\": \"")).toBeUndefined();
      expect(extractFirstUsefulAnswer("```json")).toBeUndefined();
      expect(extractFirstUsefulAnswer("```json\n{\n  \"openingLine\": \"\"")).toBeUndefined();
      expect(extractFirstUsefulAnswer({ openingLine: "", bullets: [] })).toBeUndefined();
      expect(extractFirstUsefulAnswer({ openingLine: "   ", bullets: ["  "] })).toBeUndefined();
    });

    it("extracts meaningful readable answers from string fragments", () => {
      const result = extractFirstUsefulAnswer("Em chưa tăng backlink ngay.");
      expect(result).toBe("Em chưa tăng backlink ngay.");

      const resultGsc = extractFirstUsefulAnswer("Case này em ưu tiên kiểm tra GSC trước.");
      expect(resultGsc).toBe("Case này em ưu tiên kiểm tra GSC trước.");
    });

    it("extracts meaningful readable answers from SuggestedAnswer object", () => {
      const result = extractFirstUsefulAnswer({
        openingLine: "Em chưa tăng backlink ngay.",
        bullets: ["Kiểm tra indexing trước", "Audit technical on-page"]
      });
      expect(result).toBe("Em chưa tăng backlink ngay.");

      const fallbackToBullet = extractFirstUsefulAnswer({
        openingLine: "",
        bullets: ["Case này em ưu tiên kiểm tra GSC trước."]
      });
      expect(fallbackToBullet).toBe("Case này em ưu tiên kiểm tra GSC trước.");
    });
  });
});
