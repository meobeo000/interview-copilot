import { describe, it, expect } from "vitest";
import { validateFactSafety, applyAnswerAction } from "./factSafety";
import type { AnswerContract } from "./answerContract";
import type { SuggestedAnswer } from "../shared/types";

describe("Phase 5: Answer Grounding & Fact Safety Suite", () => {
  const baseContract: AnswerContract = {
    intent: "DOMAIN_SELECTION",
    answerType: "DIRECT_DECISION",
    requiredFacts: ["Domain A DR 55", "Domain B DR 25"],
    requiredEntities: ["Domain A", "Domain B"],
    preferredStructure: "Structure",
    firstSentenceDirective: "Directive",
    maxWords: 120,
    forbiddenBehaviors: [],
    candidateExperience: {
      allowed: false,
      supportedTopics: [],
      supportingProjectIds: [],
      evidenceType: "NONE",
      reason: "Candidate profile has no verified projects"
    },
    candidateExperienceAllowed: false,
    groundedFacts: [
      {
        value: "Domain B có traffic tự nhiên 3000 và anchor text sạch",
        sourceType: "practitioner_playbook",
        sourceId: "ref:domain-hunting-evaluation",
        confidence: 0.98
      }
    ],
    contractBuildMs: 1
  };

  const sampleAnswer: SuggestedAnswer = {
    openingLine: "Em ưu tiên chọn Domain B thay vì Domain A.",
    bullets: [
      "Ý 1: Domain B có 3000 traffic thật và anchor text sạch qua Wayback.",
      "Ý 2: Domain A DR 55 nhưng traffic 0 có nguy cơ cao bị penalty hoặc domain ảo.",
      "Ý 3: Phân bổ ngân sách để build thêm link nền an toàn."
    ],
    keywords: ["Domain B", "Traffic", "Wayback"]
  };

  it("validates answer as SAFE when grounded in interviewer facts and playbook without unverified claims", () => {
    const result = validateFactSafety(sampleAnswer, baseContract);
    expect(result.isSafe).toBe(true);
    expect(result.unsupportedClaims).toHaveLength(0);
    expect(result.provenanceBreakdown.some((f) => f.provenance === "INTERVIEWER_FACT")).toBe(true);
    expect(result.provenanceBreakdown.some((f) => f.provenance === "PRACTITIONER_DOCUMENT")).toBe(true);
  });

  it("detects UNSUPPORTED_CANDIDATE_CLAIM when unverified profile asserts personal project claims", () => {
    const unsafeAnswer: SuggestedAnswer = {
      openingLine: "Kinh nghiệm của em ở dự án trước là kéo traffic lên 100k.",
      bullets: ["Em từng xử lý cứu domain bị phạt."],
      keywords: []
    };

    const result = validateFactSafety(unsafeAnswer, baseContract);
    expect(result.isSafe).toBe(false);
    expect(result.unsupportedClaims.length).toBeGreaterThan(0);
    expect(result.unsupportedClaims[0]).toContain("Fabricated candidate personal experience");
    expect(result.recommendation).toContain("Recommend verification");
  });

  it("applies SHORTER action by trimming to top 2 bullets and concise opening", () => {
    const shorter = applyAnswerAction(sampleAnswer, "SHORTER");
    expect(shorter.bullets).toHaveLength(2);
    expect(shorter.openingLine).toBe(sampleAnswer.openingLine);
  });

  it("applies MORE_TECHNICAL action by enriching technical inspection details", () => {
    const technical = applyAnswerAction(sampleAnswer, "MORE_TECHNICAL");
    expect(technical.openingLine).toContain("Về mặt kỹ thuật chuyên sâu");
    expect(technical.bullets[0]).toContain("HTTP Status 200/301");
    expect(technical.keywords).toContain("Technical SEO");
  });

  it("applies EXPLAIN_WHY action by appending causal algorithmic mechanics", () => {
    const explained = applyAnswerAction(sampleAnswer, "EXPLAIN_WHY");
    expect(explained.openingLine).toContain("Lý do và nguyên lý giải thích");
    expect(explained.bullets[0]).toContain("Nguyên nhân cốt lõi do thuật toán");
  });

  it("applies GIVE_EXAMPLE action by adding concrete practitioner scenario", () => {
    const withExample = applyAnswerAction(sampleAnswer, "GIVE_EXAMPLE");
    expect(withExample.bullets.some((b) => b.includes("Ví dụ thực tế"))).toBe(true);
  });

  it("applies DEFEND_ANSWER action by adding proactive interviewer defense point", () => {
    const defended = applyAnswerAction(sampleAnswer, "DEFEND_ANSWER");
    expect(defended.bullets.some((b) => b.includes("Phản biện dự phòng"))).toBe(true);
  });
});
