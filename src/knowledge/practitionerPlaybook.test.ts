import { describe, expect, it } from "vitest";
import { getPractitionerReferenceRetriever } from "./practitionerReferenceRetriever";
import { buildAnswerKnowledgeContext } from "./answerKnowledgeContextBuilder";
import { buildAnswerContract } from "../llm/answerContract";
import { buildFastSeoInterviewPrompt } from "../llm/prompts/fastSeoInterviewPrompt";
import { validateSpokenAnswerStyle, ACRONYM_DEFINITIONS } from "../llm/spokenAnswerStyle";
import type { CandidateProfile } from "../shared/candidateProfile";

describe("Phase 6.6 — Practitioner Playbook & Spoken Answer Style Test Suite", () => {
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

  const retriever = getPractitionerReferenceRetriever();

  // 1. Acronym First-Mention Expansion Tests
  describe("1. Acronym First-Mention Expansion Policy", () => {
    it("Test 1A: expands GSC on first mention in prompt guidelines", () => {
      const prompt = buildFastSeoInterviewPrompt(emptyCandidateProfile);
      expect(prompt).toContain('GSC -> "Google Search Console (GSC)"');
      expect(ACRONYM_DEFINITIONS.GSC.expandedFirstMention).toBe("Google Search Console (GSC)");
    });

    it("Test 1B: expands CTR on first mention in prompt guidelines", () => {
      const prompt = buildFastSeoInterviewPrompt(emptyCandidateProfile);
      expect(prompt).toContain('CTR -> "Click Through Rate (CTR)"');
      expect(ACRONYM_DEFINITIONS.CTR.expandedFirstMention).toBe("Click Through Rate (CTR)");
    });

    it("Test 1C: expands DR on first mention in prompt guidelines", () => {
      const prompt = buildFastSeoInterviewPrompt(emptyCandidateProfile);
      expect(prompt).toContain('DR  -> "Domain Rating (DR)"');
      expect(ACRONYM_DEFINITIONS.DR.expandedFirstMention).toBe("Domain Rating (DR)");
    });

    it("Test 1D: expands PBN on first mention in prompt guidelines", () => {
      const prompt = buildFastSeoInterviewPrompt(emptyCandidateProfile);
      expect(prompt).toContain('PBN -> "Private Blog Network (PBN)"');
      expect(ACRONYM_DEFINITIONS.PBN.expandedFirstMention).toBe("Private Blog Network (PBN)");
    });

    it("Test 1E: validator accepts correct first expansion and subsequent short acronym", () => {
      const sampleText =
        "Em kiểm tra Google Search Console (GSC) trước. Sau khi GSC có impression thì em mới tăng link.";
      const validation = validateSpokenAnswerStyle(sampleText);
      expect(validation.valid).toBe(true);
      expect(validation.expandedAcronyms).toContain("GSC");
      expect(validation.unexpandedFirstMentions.length).toBe(0);
    });

    it("Test 1F: validator flags unexpanded first acronym occurrence", () => {
      const unexpandedSample = "Em vào GSC check impression và CTR.";
      const validation = validateSpokenAnswerStyle(unexpandedSample);
      expect(validation.valid).toBe(false);
      expect(validation.unexpandedFirstMentions).toContain("GSC");
      expect(validation.unexpandedFirstMentions).toContain("CTR");
    });

    it("Test 1G: non-expandable brands (Ahrefs, WordPress, Cloudflare) are untouched", () => {
      const brandSample = "Em dùng Ahrefs để kiểm tra backlink profile và Cloudflare để quản lý DNS.";
      const validation = validateSpokenAnswerStyle(brandSample);
      expect(validation.valid).toBe(true);
    });
  });

  // 2. Practitioner Safety Tests
  describe("2. Practitioner Safety & Candidate Boundary Isolation", () => {
    it("Test 2A: empty candidate profile MUST NOT claim 'UU88' as candidate personal history", () => {
      const query = "Dự án gần nhất em làm là con nào?";
      const contract = buildAnswerContract({
        question: query,
        intent: "PROJECT_EXPERIENCE",
        candidateProfile: emptyCandidateProfile
      });

      expect(contract.candidateExperience.allowed).toBe(false);

      const context = buildAnswerKnowledgeContext({
        question: query,
        intent: "PROJECT_EXPERIENCE",
        candidateProfile: emptyCandidateProfile
      });

      expect(context).toContain("Không có thông tin cá nhân nào được xác thực");
      expect(context).not.toContain("Dự án thật: UU88");
      expect(context).toContain("NEVER claim 'Ở dự án UU88");
    });

    it("Test 2B: empty candidate profile MUST NOT claim '20 triệu' or '25 triệu' as candidate spent amount", () => {
      const query = "Em đã từng làm ngân sách bao nhiêu ở dự án trước?";
      const contract = buildAnswerContract({
        question: query,
        intent: "BUDGET_ALLOCATION",
        candidateProfile: emptyCandidateProfile
      });

      expect(contract.candidateExperience.allowed).toBe(false);

      const context = buildAnswerKnowledgeContext({
        question: query,
        intent: "BUDGET_ALLOCATION",
        candidateProfile: emptyCandidateProfile
      });

      expect(context).toContain("Không có thông tin cá nhân nào được xác thực");
      expect(context).toContain("NEVER invent fake project names, budgets");
    });

    it("Test 2C: PBN timing inquiry uses prospective phrasing without fabricating past experience", () => {
      const query = "Em thường đi PBN ngày thứ mấy?";
      const contract = buildAnswerContract({
        question: query,
        intent: "PBN_TIMING",
        candidateProfile: emptyCandidateProfile
      });

      expect(contract.candidateExperience.allowed).toBe(false);
      expect(contract.firstSentenceDirective).toContain("Ngày 10 không phải mốc cố định");
    });
  });

  // 3. Source Heuristic vs General Technical Reasoning
  describe("3. Source Heuristic vs Signal-Based Reasoning", () => {
    it("Test 3A: day 10 heuristic remains non-universal and signal-dependent", () => {
      const query = "Mở bot 10 ngày chưa index có đi PBN không?";
      const result = retriever.retrieve({
        question: query,
        intent: "NO_KEYWORD_SIGNAL"
      });

      expect(result.references[0].id).toBe("ref:no-keyword-signal-troubleshooting");
      const pbnRef = result.references.find((r) => r.id === "ref:new-site-pbn-timing");
      if (pbnRef) {
        expect(pbnRef.sourceConfidence).toBe("HEURISTIC");
        expect(pbnRef.cautions?.join(" ")).toContain("KHÔNG PHẢI quy tắc SEO phổ quát");
      }
    });

    it("Test 3B: TLD testing is treated as signal experimentation rather than Google algorithm preference", () => {
      const query = "Em test .in và .me như thế nào?";
      const result = retriever.retrieve({
        question: query,
        intent: "DOMAIN_SELECTION"
      });

      const tldRef = result.references.find((r) => r.id === "ref:tld-testing-experimentation" || r.id === "ref:domain-hunting-evaluation");
      expect(tldRef).toBeDefined();
      expect(tldRef?.cautions?.join(" ")).toContain("KHÔNG BAO GIỜ khẳng định");
    });
  });

  // 4. Retrieval Precision & Negative Bounds
  describe("4. Retrieval Precision & Boundary Isolation", () => {
    it("Test 4A: 'Canonical tag đặt thế nào?' returns ZERO domain hunting references", () => {
      const result = retriever.retrieve({
        question: "Canonical tag đặt thế nào?",
        intent: "ONPAGE_DIAGNOSIS"
      });
      expect(result.references.length).toBe(0);
    });

    it("Test 4B: 'CTR giảm nhưng position giữ nguyên' returns ZERO TLD/domain references", () => {
      const result = retriever.retrieve({
        question: "CTR giảm nhưng position giữ nguyên.",
        intent: "GSC_RANKING_DROP"
      });
      expect(result.references.some((r) => r.id.includes("domain") || r.id.includes("tld"))).toBe(false);
      expect(result.references.length).toBe(0);
    });

    it("Test 4C: 'Core Update làm traffic giảm 40%' returns ZERO initial-budget playbook", () => {
      const result = retriever.retrieve({
        question: "Core Update làm traffic giảm 40%, em check gì?",
        intent: "CORE_UPDATE_RECOVERY"
      });
      expect(result.references.some((r) => r.id === "ref:initial-budget-allocation" || r.id === "ref:project-initial-execution")).toBe(false);
    });

    it("Test 4D: 'Domain authority metric giảm' does NOT trigger Domain A selection", () => {
      const result = retriever.retrieve({
        question: "Domain authority metric của site giảm thì có đáng lo không?",
        intent: "GSC_RANKING_DROP"
      });
      expect(result.references.some((r) => r.id === "ref:domain-hunting-evaluation")).toBe(false);
      expect(result.references.length).toBe(0);
    });
  });

  // 5. Follow-Up Continuity
  describe("5. Follow-Up Continuity Grounding", () => {
    it("Test 5A: Turn 1 '.in, .me' -> Turn 2 'Tín hiệu nào?' retrieves TLD/domain signal reference", () => {
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

      expect(result.references.some((r) => r.id === "ref:tld-testing-experimentation" || r.id === "ref:domain-hunting-evaluation")).toBe(true);
    });

    it("Test 5B: Turn 1 'PBN ngày 10' -> Turn 2 'Tại sao ngày 10?' retrieves PBN timing explanation", () => {
      const result = retriever.retrieve({
        question: "Tại sao ngày 10?",
        intent: "PBN_TIMING",
        followUpContext: {
          followUpType: "WHY",
          contextResolved: true,
          currentUtterance: "Tại sao ngày 10?",
          previousQuestion: "Em thường cân nhắc PBN khoảng ngày thứ 10.",
          targetEntity: "ngày thứ 10",
          inheritedIntent: "PBN_TIMING",
          inheritedEntities: ["PBN", "ngày thứ 10"],
          inheritedNumericFacts: [],
          resolutionMs: 0.1,
          resolvedMeaning: "Tại sao lại chọn mốc thời gian khoảng ngày thứ 10 để đi PBN?"
        }
      });

      expect(result.references.some((r) => r.id === "ref:new-site-pbn-timing")).toBe(true);
    });
  });
});
