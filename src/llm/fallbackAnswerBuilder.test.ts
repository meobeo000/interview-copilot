import { describe, expect, it } from "vitest";
import { buildSafeFallbackAnswer, validateFallbackAnswer } from "./fallbackAnswerBuilder";
import { buildAnswerContract } from "./answerContract";
import { DEFAULT_CANDIDATE_PROFILE } from "../shared/candidateProfile";

describe("buildSafeFallbackAnswer & validateFallbackAnswer", () => {
  it("A. Budget allocation: preserves 27M semantics, distributes across categories, zero experience fabrication", () => {
    const q = "Tháng đầu tiên ngân sách 27 triệu, em phân bổ tiền cho Content, Entity, Guest Post và PBN thế nào?";
    const contract = buildAnswerContract({
      question: q,
      intent: "BUDGET_ALLOCATION",
      candidateProfile: DEFAULT_CANDIDATE_PROFILE
    });

    const fallback = buildSafeFallbackAnswer({ contract, question: q });
    const val = validateFallbackAnswer(fallback, contract);

    expect(val.isValid).toBe(true);
    expect(fallback.openingLine).toContain("27 triệu");
    expect(fallback.streamingText).toContain("content");
    expect(fallback.streamingText).toContain("Entity");
    expect(val.candidateSafetyViolation).toBe(false);
    expect(val.numericContradiction).toBe(false);
  });

  it("B. Ranking drop with ruled-out causes: does NOT recommend ruled-out causes", () => {
    const q = "10 money page tụt top nhưng không có Core Update và không bị manual action, em bóc tách lỗi gì trước?";
    const contract = buildAnswerContract({
      question: q,
      intent: "GSC_RANKING_DROP",
      candidateProfile: DEFAULT_CANDIDATE_PROFILE
    });

    const fallback = buildSafeFallbackAnswer({ contract, question: q });
    const val = validateFallbackAnswer(fallback, contract);

    expect(val.isValid).toBe(true);
    expect(val.scenarioConstraintViolation).toBe(false);
    expect(fallback.streamingText).not.toContain("sửa file robots.txt");
    expect(fallback.streamingText).not.toContain("gỡ manual action");
  });

  it("C. Negative SEO / Disavow: does not blindly disavow immediately", () => {
    const q = "Website nhận 13.700 spam backlink từ 650 referring domain rác trong 3 ngày, em có disavow ngay không?";
    const contract = buildAnswerContract({
      question: q,
      intent: "NEGATIVE_SEO",
      candidateProfile: DEFAULT_CANDIDATE_PROFILE
    });

    const fallback = buildSafeFallbackAnswer({ contract, question: q });
    const val = validateFallbackAnswer(fallback, contract);

    expect(val.isValid).toBe(true);
    expect(fallback.openingLine.toLowerCase()).toContain("chưa disavow ngay");
  });

  it("D. PBN timing: signal-based condition, no arbitrary date invention", () => {
    const q = "Dàn site vệ tinh PBN thì đến giai đoạn nào site chính có traffic em mới triển khai?";
    const contract = buildAnswerContract({
      question: q,
      intent: "PBN_TIMING",
      candidateProfile: DEFAULT_CANDIDATE_PROFILE
    });

    const fallback = buildSafeFallbackAnswer({ contract, question: q });
    const val = validateFallbackAnswer(fallback, contract);

    expect(val.isValid).toBe(true);
    expect(fallback.streamingText?.toLowerCase()).toContain("tín hiệu");
  });

  it("E. Domain comparison: DR vs traffic decision", () => {
    const q = "Domain 1 DR 68 có 0 organic traffic, domain 2 DR 31 có 3.500 traffic. Em chọn domain nào?";
    const contract = buildAnswerContract({
      question: q,
      intent: "DOMAIN_SELECTION",
      candidateProfile: DEFAULT_CANDIDATE_PROFILE
    });

    const fallback = buildSafeFallbackAnswer({ contract, question: q });
    const val = validateFallbackAnswer(fallback, contract);

    expect(val.isValid).toBe(true);
    expect(fallback.openingLine.toLowerCase()).toContain("chọn domain có traffic");
  });

  it("F. Candidate experience trap: directly acknowledges boundary without fabricating history", () => {
    const q = "Em đã trực tiếp vận hành hệ thống 150 PBN private cho nhà cái nào trước đây và đem lại bao nhiêu tỷ doanh thu?";
    const contract = buildAnswerContract({
      question: q,
      intent: "PROJECT_EXPERIENCE",
      candidateProfile: DEFAULT_CANDIDATE_PROFILE
    });

    const fallback = buildSafeFallbackAnswer({ contract, question: q });
    const val = validateFallbackAnswer(fallback, contract);

    expect(val.isValid).toBe(true);
    expect(val.candidateSafetyViolation).toBe(false);
    expect(fallback.openingLine).toContain("em chưa có dự án thực tế trước đây để khẳng định là em đã trực tiếp vận hành");
    expect(fallback.streamingText).not.toContain("em đã vận hành 150");
    expect(fallback.streamingText).not.toContain("doanh thu của em là");
  });

  it("G. Supported candidate experience allows grounded project claims", () => {
    const customProfile = {
      ...DEFAULT_CANDIDATE_PROFILE,
      projects: [
        {
          name: "Project Betting88",
          role: "Technical SEO Lead",
          description: "Hands-on setup of PBN network with 150 domains",
          metrics: "Ranked top 3"
        }
      ]
    };

    const q = "Em đã triển khai dự án PBN nào?";
    const contract = buildAnswerContract({
      question: q,
      intent: "PROJECT_EXPERIENCE",
      candidateProfile: customProfile
    });

    expect(contract.candidateExperienceAllowed).toBe(true);
  });
});
