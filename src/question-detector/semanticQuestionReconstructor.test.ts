import { describe, it, expect } from "vitest";
import { SemanticQuestionReconstructor } from "./semanticQuestionReconstructor";

describe("Phase 3: Semantic Question Reconstruction Engine", () => {
  const reconstructor = new SemanticQuestionReconstructor();

  it("reconstructs 'Romania' to 'Domain A' when active context discusses Domain comparison", () => {
    const raw = "Tại sao em không chọn Romania?";
    const context = {
      priorIntent: "DOMAIN_SELECTION",
      priorEntities: ["Domain A", "Domain B", "DR", "traffic"],
      turnId: "turn-followup-01"
    };

    const result = reconstructor.reconstruct(raw, context);

    expect(result.rawTranscript).toBe("Tại sao em không chọn Romania?");
    expect(result.interpretedQuestion).toBe("Tại sao em không chọn Domain A?");
    expect(result.reconstructionConfidence).toBeGreaterThanOrEqual(0.95);
    expect(result.confidenceLevel).toBe("HIGH");
    expect(result.linkedEntities).toContain("Domain A");
    expect(result.isModified).toBe(true);
  });

  it("preserves raw transcript when Romania is mentioned with NO domain comparison context", () => {
    const raw = "Anh đi du lịch Romania về.";
    const context = {
      priorIntent: "GENERAL_CHAT",
      priorEntities: ["travel"],
      turnId: "turn-random"
    };

    const result = reconstructor.reconstruct(raw, context);

    expect(result.rawTranscript).toBe("Anh đi du lịch Romania về.");
    expect(result.interpretedQuestion).toBe("Anh đi du lịch Romania về.");
    expect(result.isModified).toBe(false);
  });

  it("repairs adversarial SEO phonetic errors (sai vệ tinh, en ti ti, sợt côn son, canonic, di dáp vô, ai gêm minh)", () => {
    const raw = "Dàn sai vệ tinh bắn link về thì Search com son có bị di dáp vô không?";
    const result = reconstructor.reconstruct(raw);

    expect(result.interpretedQuestion).toContain("site vệ tinh");
    expect(result.interpretedQuestion).toContain("Search Console");
    expect(result.interpretedQuestion).toContain("disavow");
    expect(result.confidenceLevel).toBe("HIGH");
  });

  it("converts spoken Vietnamese numbers and currency accurately", () => {
    const raw = "Với ngân sách hai mươi triệu và bốn mươi ba triệu thì chia thế nào?";
    const result = reconstructor.reconstruct(raw);

    expect(result.interpretedQuestion).toContain("20 triệu");
    expect(result.interpretedQuestion).toContain("43 triệu");
  });

  it("stores raw transcript separately from interpreted question for turn isolation", () => {
    const raw = "Em tối ưu ca no ni can cho ai gêm minh thế nào?";
    const result = reconstructor.reconstruct(raw, { turnId: "isolated-turn-1" });

    expect(result.rawTranscript).toBe("Em tối ưu ca no ni can cho ai gêm minh thế nào?");
    expect(result.interpretedQuestion).toBe("Em tối ưu canonical cho iGaming thế nào?");
    expect(result.telemetry.rawTranscript).toBe(raw);
    expect(result.telemetry.interpretedQuestion).toBe("Em tối ưu canonical cho iGaming thế nào?");
  });
});
