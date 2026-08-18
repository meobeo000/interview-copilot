import { describe, expect, it } from "vitest";
import { getPractitionerReferenceRetriever } from "./practitionerReferenceRetriever";
import { buildAnswerKnowledgeContext } from "./answerKnowledgeContextBuilder";
import { buildAnswerContract } from "../llm/answerContract";
import { buildFastSeoInterviewPrompt } from "../llm/prompts/fastSeoInterviewPrompt";
import type { CandidateProfile } from "../shared/candidateProfile";

describe("Phase 6.5.1 — Practitioner Grounding Hardening & Safety Suite", () => {
  const emptyCandidateProfile: CandidateProfile = {
    fullName: "Ứng viên A",
    role: "SEO Specialist",
    background: "",
    skills: [],
    seoSkills: [],
    tools: [],
    projects: [],
    markets: [],
    strengths: [],
    experienceNotes: ""
  };

  const candidateWithTechnicalOnly: CandidateProfile = {
    fullName: "Ứng viên C",
    role: "Technical SEO",
    background: "Chuyên sâu Technical SEO và Core Web Vitals.",
    skills: ["Technical SEO", "Performance"],
    seoSkills: ["Crawl Budget", "Schema"],
    tools: ["GSC", "Screaming Frog"],
    projects: [
      {
        name: "Dự án Audit Kỹ thuật E-commerce",
        role: "Technical SEO Specialist",
        description: "Audit cấu trúc index, canonical và tối ưu crawl budget.",
        metrics: "Tăng 30% index efficiency"
      }
    ],
    markets: ["Việt Nam"],
    strengths: ["Crawl analysis"],
    experienceNotes: "2 năm làm technical."
  };

  const verifiedCandidateProfile: CandidateProfile = {
    fullName: "Ứng viên B",
    role: "Senior SEO Specialist",
    background: "3 năm kinh nghiệm SEO tổng thể.",
    skills: ["SEO Strategy", "Technical SEO"],
    seoSkills: ["PBN", "Expired Domain", "Core Update Recovery"],
    tools: ["Ahrefs", "GSC", "Screaming Frog"],
    projects: [
      {
        name: "Dự án Alpha iGaming",
        role: "SEO Lead",
        description: "Xây dựng hệ thống PBN và phục hồi site sau Core Update.",
        metrics: "Traffic 50k/tháng, top 3 từ khóa chính"
      }
    ],
    markets: ["Việt Nam"],
    strengths: ["PBN building", "Domain hunting"],
    experienceNotes: "Thực chiến 3 năm."
  };

  const retriever = getPractitionerReferenceRetriever();

  // Test A: Generic "domain" mention does NOT trigger domain hunting
  it("Test A: generic 'domain' mention does NOT trigger domain hunting", () => {
    const query = "Domain đang top 5 nhưng traffic giảm 40%, em check gì trước?";
    const result = retriever.retrieve({
      question: query,
      intent: "GSC_RANKING_DROP"
    });

    const hasDomainRef = result.references.some((r) => r.id === "ref:domain-hunting-evaluation");
    expect(hasDomainRef).toBe(false);
    expect(result.references.length).toBe(0);
  });

  // Test B: Expired-domain selection DOES trigger domain hunting
  it("Test B: expired-domain selection DOES trigger domain hunting", () => {
    const query = "Tiêu chí săn expired domain của em là gì?";
    const result = retriever.retrieve({
      question: query,
      intent: "DOMAIN_SELECTION"
    });

    expect(result.references.some((r) => r.id === "ref:domain-hunting-evaluation")).toBe(true);
  });

  // Test C: Wayback DOES trigger domain evaluation
  it("Test C: Wayback Machine evaluation DOES trigger domain evaluation", () => {
    const query = "Wayback sạch nhưng anchor profile từng spam thì em có mua domain này không?";
    const result = retriever.retrieve({
      question: query,
      intent: "DOMAIN_SELECTION"
    });

    expect(result.references.some((r) => r.id === "ref:domain-hunting-evaluation")).toBe(true);
  });

  // Test D: TLD comparison DOES trigger domain evaluation
  it("Test D: TLD comparison DOES trigger domain evaluation", () => {
    const query = "Em test .in, .me và .my thì dựa vào tín hiệu nào để chọn?";
    const result = retriever.retrieve({
      question: query,
      intent: "DOMAIN_SELECTION"
    });

    expect(result.references.some((r) => r.id === "ref:domain-hunting-evaluation")).toBe(true);
  });

  // Test E: Ranking drop + domain mention stays ranking diagnosis
  it("Test E: ranking drop + domain mention stays ranking diagnosis and does not leak domain hunting", () => {
    const query = "Domain money site bị tụt ranking do Core Update thì xử lý sao?";
    const result = retriever.retrieve({
      question: query,
      intent: "CORE_UPDATE_RECOVERY"
    });

    expect(result.references.some((r) => r.id === "ref:domain-hunting-evaluation")).toBe(false);
  });

  // Test F: CTR drop + domain mention does not retrieve domain hunting
  it("Test F: CTR drop + domain mention does not retrieve domain hunting", () => {
    const query = "Money site trên domain hiện tại bị giảm CTR nhưng position giữ nguyên.";
    const result = retriever.retrieve({
      question: query,
      intent: "GSC_RANKING_DROP"
    });

    expect(result.references.some((r) => r.id === "ref:domain-hunting-evaluation")).toBe(false);
    expect(result.references.length).toBe(0);
  });

  // Test G: Empty candidate facts produce neutral fallback
  it("Test G: empty candidate facts produce neutral fallback without fabricating background", () => {
    const context = buildAnswerKnowledgeContext({
      question: "Dự án gần nhất em làm là gì?",
      candidateProfile: emptyCandidateProfile
    });

    expect(context).toContain("CANDIDATE PERSONAL FACTS (Factual Grounding - Highest Priority):");
    expect(context).toContain("Không có thông tin cá nhân nào được xác thực (No verified candidate personal facts available).");
    expect(context).not.toContain("Nền tảng Web Development vững chắc");
  });

  // Test H: No fabricated Web Development background when profile background is empty
  it("Test H: does not fabricate Web Development background when profile is empty", () => {
    const context = buildAnswerKnowledgeContext({
      question: "Background của em là gì?",
      candidateProfile: emptyCandidateProfile
    });

    expect(context).not.toContain("Web Development");
  });

  // Test I: No fabricated iGaming experience when profile projects are empty
  it("Test I: does not fabricate iGaming experience when profile projects are empty", () => {
    const context = buildAnswerKnowledgeContext({
      question: "Em có kinh nghiệm SEO iGaming bao lâu rồi?",
      candidateProfile: emptyCandidateProfile
    });

    expect(context).not.toContain("Dự án thật:");
  });

  // Test J: No fabricated UU88 history
  it("Test J: candidate safety guarantees UU88 is never authorized as personal experience", () => {
    const query = "Ở dự án UU88 em đã chi 20 triệu chia thế nào?";
    const contract = buildAnswerContract({
      question: query,
      intent: "BUDGET_ALLOCATION",
      candidateProfile: emptyCandidateProfile
    });

    expect(contract.candidateExperience.allowed).toBe(false);
    expect(contract.forbiddenBehaviors.some((fb) => fb.includes("Do NOT claim personal candidate experience"))).toBe(true);

    const context = buildAnswerKnowledgeContext({
      question: query,
      intent: "BUDGET_ALLOCATION",
      candidateProfile: emptyCandidateProfile
    });

    const prompt = buildFastSeoInterviewPrompt(emptyCandidateProfile, context, contract);
    expect(prompt).toContain("NEVER claim 'Ở dự án UU88");
  });

  // Test K: Verified candidate project remains usable
  it("Test K: verified candidate project remains usable and authorizes first-person within verified scope", () => {
    const query = "Em từng triển khai PBN và xử lý Core Update thế nào?";
    const contract = buildAnswerContract({
      question: query,
      intent: "PROJECT_EXPERIENCE",
      candidateProfile: verifiedCandidateProfile
    });

    expect(contract.candidateExperience.allowed).toBe(true);
    expect(contract.candidateExperience.supportingProjectIds).toContain("Dự án Alpha iGaming");
  });

  // Test L: Verified project scope does not authorize unrelated PBN claims
  it("Test L: technical SEO project does NOT authorize unrelated PBN claims", () => {
    const query = "Em từng tự tay xây dựng hệ thống 50 PBN vệ tinh chưa?";
    const contract = buildAnswerContract({
      question: query,
      intent: "PROJECT_EXPERIENCE",
      candidateProfile: candidateWithTechnicalOnly // Only has technical e-commerce project!
    });

    // Technical project cannot authorize PBN execution claims
    expect(contract.candidateExperience.allowed).toBe(false);
  });

  // Test M: PBN day-10 reference remains conditional
  it("Test M: PBN day-10 reference remains conditional and non-universal", () => {
    const query = "Khoảng ngày thứ 10 em bắt đầu PBN, tại sao?";
    const result = retriever.retrieve({
      question: query,
      intent: "PBN_TIMING"
    });

    const hasPbnRef = result.references.some((r) => r.id === "ref:new-site-pbn-timing");
    expect(hasPbnRef).toBe(true);

    const pbnRef = result.references.find((r) => r.id === "ref:new-site-pbn-timing");
    expect(pbnRef?.cautions?.join(" ")).toContain("KHÔNG PHẢI quy tắc SEO phổ quát");

    const contract = buildAnswerContract({
      question: query,
      intent: "PBN_TIMING",
      candidateProfile: emptyCandidateProfile
    });

    expect(contract.firstSentenceDirective).toContain("Ngày 10 không phải mốc cố định");
  });

  // Test N: No-keyword + PBN prioritizes diagnosis before link escalation
  it("Test N: multi-concept (no-keyword + PBN) prioritizes indexing diagnosis before link building", () => {
    const query = "Site mới mở bot được 10 ngày, chưa có impression, em có đi PBN chưa?";
    const result = retriever.retrieve({
      question: query,
      intent: "NO_KEYWORD_SIGNAL"
    });

    expect(result.references.length).toBeGreaterThanOrEqual(1);
    // Primary reference MUST be no-keyword diagnosis
    expect(result.references[0].id).toBe("ref:no-keyword-signal-troubleshooting");
    // If PBN is also present, it must be secondary
    if (result.references.length > 1) {
      expect(result.references[1].id).toBe("ref:new-site-pbn-timing");
    }
  });

  // Test O: Internal-link question does not accidentally retrieve no-keyword reference
  it("Test O: standard internal-link question does not accidentally retrieve no-keyword reference", () => {
    const query = "Em tối ưu internal link như thế nào?";
    const result = retriever.retrieve({
      question: query,
      intent: "STRATEGY_PLAN"
    });

    expect(result.references.some((r) => r.id === "ref:no-keyword-signal-troubleshooting")).toBe(false);
    expect(result.references.length).toBe(0);
  });

  // Test P: Top-maintenance question does not automatically recommend 301
  it("Test P: top-maintenance question retrieves ranking-maintenance and does not treat 301 as immediate action", () => {
    const query = "Site đang top thì em giữ top thế nào?";
    const result = retriever.retrieve({
      question: query,
      intent: "REDIRECT_301"
    });

    expect(result.references.some((r) => r.id === "ref:ranking-maintenance-301")).toBe(true);
    const ref = result.references.find((r) => r.id === "ref:ranking-maintenance-301");
    expect(ref?.cautions?.join(" ")).toContain("TUYỆT ĐỐI KHÔNG");
  });

  // Test Q: Negative SEO reference does not force immediate Disavow
  it("Test Q: Negative SEO reference emphasizes verification before disavow", () => {
    const query = "20.000 backlink spam xuất hiện nhưng ranking ổn thì xử lý sao?";
    const result = retriever.retrieve({
      question: query,
      intent: "NEGATIVE_SEO"
    });

    expect(result.references.some((r) => r.id === "ref:negative-seo-defense")).toBe(true);
    const ref = result.references.find((r) => r.id === "ref:negative-seo-defense");
    expect(ref?.guidance.join(" ")).toMatch(/không disavow hoảng loạn|chẩn đoán/i);
  });

  // Test R: Follow-up 'Tín hiệu nào?' inherits domain/TLD context
  it("Test R: follow-up 'Tín hiệu nào?' inherits domain/TLD context", () => {
    const result = retriever.retrieve({
      question: "Tín hiệu nào?",
      intent: "DOMAIN_SELECTION",
      followUpContext: {
        followUpType: "SIGNAL",
        contextResolved: true,
        currentUtterance: "Tín hiệu nào?",
        previousQuestion: "Em test .in, .me và .my.",
        targetEntity: ".in, .me, .my",
        inheritedIntent: "DOMAIN_SELECTION",
        inheritedEntities: [".in", ".me", ".my"],
        inheritedNumericFacts: [],
        resolutionMs: 0.1,
        resolvedMeaning: "Tín hiệu nào để đánh giá hiệu quả khi test các TLD .in, .me, .my?"
      }
    });

    expect(result.references.some((r) => r.id === "ref:domain-hunting-evaluation")).toBe(true);
  });

  // Test S: Follow-up ranking diagnosis does not leak domain hunting
  it("Test S: follow-up ranking diagnosis does not leak domain hunting", () => {
    const result = retriever.retrieve({
      question: "Em check gì trước?",
      intent: "GSC_RANKING_DROP",
      followUpContext: {
        followUpType: "FAILURE_NEXT_STEP",
        contextResolved: true,
        currentUtterance: "Em check gì trước?",
        previousQuestion: "Site giảm traffic nhưng indexing vẫn bình thường.",
        targetEntity: "traffic drop",
        inheritedIntent: "GSC_RANKING_DROP",
        inheritedEntities: ["traffic", "indexing"],
        inheritedNumericFacts: [],
        resolutionMs: 0.1,
        resolvedMeaning: "Khi traffic giảm nhưng indexing bình thường thì check gì trước?"
      }
    });

    expect(result.references.some((r) => r.id === "ref:domain-hunting-evaluation")).toBe(false);
    expect(result.references.length).toBe(0);
  });

  // Test T: Ambiguous weak-match question returns zero practitioner references
  it("Test T: ambiguous weak-match question returns zero practitioner references", () => {
    const query = "Canonical tag nên đặt thế nào để chuẩn technical SEO?";
    const result = retriever.retrieve({
      question: query,
      intent: "ONPAGE_DIAGNOSIS"
    });

    expect(result.references.length).toBe(0);
  });
});
