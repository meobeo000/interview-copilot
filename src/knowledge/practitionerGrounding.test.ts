import { describe, expect, it } from "vitest";
import { getPractitionerReferenceRetriever } from "./practitionerReferenceRetriever";
import { buildAnswerKnowledgeContext } from "./answerKnowledgeContextBuilder";
import { buildAnswerContract } from "../llm/answerContract";
import { buildFastSeoInterviewPrompt } from "../llm/prompts/fastSeoInterviewPrompt";
import type { CandidateProfile } from "../shared/candidateProfile";

describe("Phase 6.5 — Practitioner Interview Grounding Test Suite", () => {
  const emptyCandidateProfile: CandidateProfile = {
    fullName: "Ứng viên A",
    role: "SEO Specialist",
    background: "Nền tảng Web Development vững chắc, tư duy Technical SEO tốt.",
    skills: ["Web Development", "HTML/CSS/JS"],
    seoSkills: ["Technical SEO", "On-page", "Search Console"],
    tools: ["Google Search Console", "Ahrefs"],
    projects: [], // No projects!
    markets: ["Việt Nam"],
    strengths: ["Debug Technical SEO"],
    experienceNotes: "Đang học hỏi và tích lũy thực chiến iGaming."
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

  // Test A: Domain Hunting Retrieval
  it("Test A: retrieves DOMAIN_HUNTING references for domain hunting question", () => {
    const query = "Tiêu chí săn domain của em là gì?";
    const result = retriever.retrieve({
      question: query,
      intent: "DOMAIN_SELECTION"
    });

    expect(result.references.length).toBeGreaterThan(0);
    const hasDomainRef = result.references.some((r) => r.id === "ref:domain-hunting-evaluation");
    expect(hasDomainRef).toBe(true);

    const domainRef = result.references.find((r) => r.id === "ref:domain-hunting-evaluation");
    expect(domainRef?.guidance.join(" ")).toMatch(/wayback|referring domain|organic traffic|dr/i);
    expect(domainRef?.cautions?.join(" ")).toMatch(/tld.*bằng chứng|dr.*ảo/i);
  });

  // Test B: Domain Follow-up Context Grounding
  it("Test B: inherits domain context and retrieves domain testing signals in multi-turn follow-up", () => {
    // Turn 1: "Em test .in, .me và .my."
    // Turn 2: "Tín hiệu nào?"
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

    expect(result.references.length).toBeGreaterThan(0);
    const hasDomainRef = result.references.some((r) => r.id === "ref:domain-hunting-evaluation");
    expect(hasDomainRef).toBe(true);

    const ref = result.references.find((r) => r.id === "ref:domain-hunting-evaluation");
    expect(ref?.practitionerExamples?.join(" ")).toMatch(/tld.*\.in.*\.me.*\.my/i);
    expect(ref?.practitionerExamples?.join(" ")).toMatch(/impression.*gsc.*(nhận từ khóa|nhận keyword|tín hiệu)/i);
  });

  // Test C: PBN Timing
  it("Test C: explains signal-based PBN reasoning and enforces day 10 is NOT a universal rule", () => {
    const query = "Khoảng ngày thứ 10 em bắt đầu PBN, tại sao?";
    const result = retriever.retrieve({
      question: query,
      intent: "PBN_TIMING"
    });

    const hasPbnRef = result.references.some((r) => r.id === "ref:new-site-pbn-timing");
    expect(hasPbnRef).toBe(true);

    const pbnRef = result.references.find((r) => r.id === "ref:new-site-pbn-timing");
    expect(pbnRef?.practitionerExamples?.join(" ")).toContain("ngày thứ 10");
    expect(pbnRef?.cautions?.join(" ")).toContain("KHÔNG PHẢI quy tắc SEO phổ quát");

    const contract = buildAnswerContract({
      question: query,
      intent: "PBN_TIMING",
      candidateProfile: emptyCandidateProfile
    });

    expect(contract.firstSentenceDirective).toContain("Ngày 10 không phải mốc cố định");
  });

  // Test D: No Keyword Troubleshooting
  it("Test D: prioritizes on-page & index diagnosis and cautions against immediate domain swap", () => {
    const query = "Site index rồi nhưng hai tuần vẫn không nhận key, em làm gì?";
    const result = retriever.retrieve({
      question: query,
      intent: "NO_KEYWORD_SIGNAL"
    });

    const hasNoKeyRef = result.references.some((r) => r.id === "ref:no-keyword-signal-troubleshooting");
    expect(hasNoKeyRef).toBe(true);

    const noKeyRef = result.references.find((r) => r.id === "ref:no-keyword-signal-troubleshooting");
    expect(noKeyRef?.guidance.join(" ")).toMatch(/sapo|title|meta|internal link|canonical/i);
    expect(noKeyRef?.cautions?.join(" ")).toContain("TUYỆT ĐỐI KHÔNG khuyến nghị đổi domain");

    const contract = buildAnswerContract({
      question: query,
      intent: "NO_KEYWORD_SIGNAL",
      candidateProfile: emptyCandidateProfile
    });

    expect(contract.firstSentenceDirective).toContain("Em chưa đi thêm link ngay");
  });

  // Test E: 301 Contingency & Top Maintenance
  it("Test E: explains 301 contingency planning and conditional trigger without recommending immediate redirect", () => {
    const query = "Site đang top tại sao em chuẩn bị domain 301?";
    const result = retriever.retrieve({
      question: query,
      intent: "REDIRECT_301"
    });

    const has301Ref = result.references.some((r) => r.id === "ref:ranking-maintenance-301");
    expect(has301Ref).toBe(true);

    const ref301 = result.references.find((r) => r.id === "ref:ranking-maintenance-301");
    expect(ref301?.guidance.join(" ")).toMatch(/backup domain|domain dự phòng|nuôi.*warm-up/i);
    expect(ref301?.cautions?.join(" ")).toContain("TUYỆT ĐỐI KHÔNG");

    const contract = buildAnswerContract({
      question: query,
      intent: "REDIRECT_301",
      candidateProfile: emptyCandidateProfile
    });

    expect(contract.answerType).toBe("DIRECT_DECISION");
  });

  // Test F: Candidate Hallucination Safety
  it("Test F: candidate safety isolation guarantees empty candidate profile cannot claim practitioner projects (e.g. UU88)", () => {
    const query = "Ở dự án UU88 em đã chi 20 triệu chia thế nào?";
    const contract = buildAnswerContract({
      question: query,
      intent: "BUDGET_ALLOCATION",
      candidateProfile: emptyCandidateProfile
    });

    // Contract MUST NOT allow personal claims
    expect(contract.candidateExperience.allowed).toBe(false);
    expect(contract.forbiddenBehaviors.some((fb) => fb.includes("Do NOT claim personal candidate experience"))).toBe(true);

    const context = buildAnswerKnowledgeContext({
      question: query,
      intent: "BUDGET_ALLOCATION",
      candidateProfile: emptyCandidateProfile
    });

    const prompt = buildFastSeoInterviewPrompt(emptyCandidateProfile, context, contract);

    // Prompt MUST explicitly forbid claiming UU88 as personal experience
    expect(prompt).toContain("NEVER claim practitioner projects");
    expect(prompt).toContain("NEVER claim 'Ở dự án UU88");
  });

  // Test G: Verified Candidate Case
  it("Test G: authorizes first-person claims strictly within verified candidate profile projects", () => {
    const query = "Em từng triển khai PBN và xử lý Core Update thế nào?";
    const contract = buildAnswerContract({
      question: query,
      intent: "PROJECT_EXPERIENCE",
      candidateProfile: verifiedCandidateProfile
    });

    expect(contract.candidateExperience.allowed).toBe(true);
    expect(contract.candidateExperience.supportingProjectIds).toContain("Dự án Alpha iGaming");
  });

  // Test H: Anti-Template Diversity
  it("Test H: ensures distinct and non-templated directives across 10 diverse SEO interview questions", () => {
    const testQuestions = [
      { q: "Tiêu chí săn domain của em là gì?", intent: "DOMAIN_SELECTION" as const, expectedTerm: "domain" },
      { q: "Site bị dính link bẩn anchor cờ bạc đen thì disavow thế nào?", intent: "NEGATIVE_SEO" as const, expectedTerm: "disavow" },
      { q: "Tối ưu đoạn Sapo và Title như thế nào để chuẩn search intent?", intent: "ONPAGE_DIAGNOSIS" as const, expectedTerm: "check" },
      { q: "Sau đợt Core Update site tụt 50% traffic thì bóc tách lỗi gì trước?", intent: "CORE_UPDATE_RECOVERY" as const, expectedTerm: "GSC" },
      { q: "Site đang top tại sao em chuẩn bị domain 301?", intent: "REDIRECT_301" as const, expectedTerm: "301" },
      { q: "Cách đi internal link điều hướng sức mạnh về money page?", intent: "STRATEGY_PLAN" as const, expectedTerm: "đáp" },
      { q: "Site mở bot 2 tuần chưa nhận key thì xử lý sao?", intent: "NO_KEYWORD_SIGNAL" as const, expectedTerm: "check" },
      { q: "Ngân sách 20 triệu khởi điểm chia cho site mới thế nào?", intent: "BUDGET_ALLOCATION" as const, expectedTerm: "chia" },
      { q: "Khoảng ngày thứ 10 em bắt đầu PBN, tại sao?", intent: "PBN_TIMING" as const, expectedTerm: "tín hiệu" },
      { q: "Domain DR 60 traffic 0 vs DR 25 traffic 5k chọn con nào?", intent: "DOMAIN_SELECTION" as const, expectedTerm: "domain" }
    ];

    const firstSentenceDirectives = testQuestions.map(({ q, intent }) => {
      const contract = buildAnswerContract({
        question: q,
        intent,
        candidateProfile: emptyCandidateProfile
      });
      return contract.firstSentenceDirective;
    });

    // Check that we have rich, diverse, specialized first-sentence directives rather than a single repeating string
    const uniqueDirectives = new Set(firstSentenceDirectives);
    expect(uniqueDirectives.size).toBeGreaterThanOrEqual(8);
  });
});
