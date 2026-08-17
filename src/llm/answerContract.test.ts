import { describe, expect, it } from "vitest";
import { buildAnswerContract, formatContractForPrompt, isContractCompatible } from "./answerContract";
import { SemanticEvidenceAccumulator } from "../question-detector/semanticEvidence";
import { buildFastSeoInterviewPrompt } from "./prompts/fastSeoInterviewPrompt";
import type { CandidateProfile } from "../shared/candidateProfile";

describe("Phase 4: Question-to-Answer Contract & Practitioner Style Tests", () => {
  describe("Test A: Budget Allocation Contract", () => {
    it("builds DIRECT_ALLOCATION contract with all requested entities and numeric facts", () => {
      const accumulator = new SemanticEvidenceAccumulator();
      accumulator.appendFinal("Budget ban đầu khoảng 20 triệu thì em phân bổ Content, Entity, backlink, Guest Post và PBN thế nào?");

      const contract = buildAnswerContract({
        question: "Budget ban đầu khoảng 20 triệu thì em phân bổ Content, Entity, backlink, Guest Post và PBN thế nào?",
        intent: "BUDGET_ALLOCATION",
        semanticEvidence: accumulator.getState()
      });

      expect(contract.answerType).toBe("DIRECT_ALLOCATION");
      expect(contract.requiredFacts.some((f) => f.includes("20 triệu"))).toBe(true);
      expect(contract.requiredEntities).toContain("content");
      expect(contract.requiredEntities).toContain("Entity");
      expect(contract.requiredEntities).toContain("Guest Post");
      expect(contract.requiredEntities).toContain("PBN");
      expect(contract.firstSentenceDirective).toContain("MUST state the direct monetary or percentage allocation");
      expect(contract.maxWords).toBeLessThanOrEqual(130);
    });
  });

  describe("Test B: Domain Decision Contract", () => {
    it("builds DIRECT_DECISION contract requiring immediate choice in sentence 1", () => {
      const accumulator = new SemanticEvidenceAccumulator();
      accumulator.appendFinal("Domain A DR55 traffic bằng 0, domain B DR20 nhưng có traffic thật và backlink đúng niche, em chọn con nào?");

      const contract = buildAnswerContract({
        question: "Domain A DR55 traffic bằng 0, domain B DR20 nhưng có traffic thật và backlink đúng niche, em chọn con nào?",
        intent: "DOMAIN_SELECTION",
        semanticEvidence: accumulator.getState()
      });

      expect(contract.answerType).toBe("DIRECT_DECISION");
      expect(contract.firstSentenceDirective).toContain("MUST state your choice immediately");
      expect(contract.requiredFacts.some((f) => f.includes("DR 55"))).toBe(true);
      expect(contract.requiredFacts.some((f) => f.includes("DR 20"))).toBe(true);
    });
  });

  describe("Test C: Disavow Decision Contract", () => {
    it("builds DIRECT_DECISION contract for negative SEO / disavow questions", () => {
      const contract = buildAnswerContract({
        question: "Site bị bắn link bẩn 100k backlink casino spam thì có disavow ngay không?",
        intent: "NEGATIVE_SEO"
      });

      expect(contract.answerType).toBe("DIRECT_DECISION");
      expect(contract.firstSentenceDirective).toContain("disavow");
      expect(contract.preferredStructure).toContain("Sentence 1: Direct decision");
    });
  });

  describe("Test D: No-Keyword Signal Diagnosis Contract", () => {
    it("builds DIRECT_ACTION_DIAGNOSIS contract stating first checkpoint immediately", () => {
      const accumulator = new SemanticEvidenceAccumulator();
      accumulator.appendFinal("Site mở bot hai tuần vẫn chưa nhận keyword thì em xử lý thế nào?");

      const contract = buildAnswerContract({
        question: "Site mở bot hai tuần vẫn chưa nhận keyword thì em xử lý thế nào?",
        intent: "NO_KEYWORD_SIGNAL",
        semanticEvidence: accumulator.getState()
      });

      expect(contract.answerType).toBe("DIRECT_ACTION_DIAGNOSIS");
      expect(contract.firstSentenceDirective).toContain("MUST state the immediate diagnostic action");
      expect(contract.preferredStructure).toContain("GSC URL inspection");
    });
  });

  describe("Test E: Practitioner Timing Contract", () => {
    it("builds DIRECT_TIMING_EXPLANATION emphasizing signal over arbitrary calendar dates", () => {
      const contract = buildAnswerContract({
        question: "Tại sao ngày thứ 10 em mới bắt đầu đi PBN cho site mới?",
        intent: "PBN_TIMING"
      });

      expect(contract.answerType).toBe("DIRECT_TIMING_EXPLANATION");
      expect(contract.firstSentenceDirective).toContain("timing is signal-dependent, not an arbitrary fixed calendar rule");
    });
  });

  describe("Test F: Candidate Experience Safety", () => {
    it("prevents model from claiming practitioner experience when profile lacks personal projects", () => {
      const emptyProfile: CandidateProfile = {
        fullName: "Test Candidate",
        role: "Fresher SEO",
        background: "Fresher SEO",
        skills: ["Web Development"],
        seoSkills: ["On-page", "Technical SEO"],
        tools: ["GSC", "GA4"],
        markets: ["VN"],
        strengths: ["Technical Debugging"],
        experienceNotes: "No personal projects yet",
        projects: [] // No personal projects
      };

      const contract = buildAnswerContract({
        question: "Ở UU88 em triển khai PBN thế nào?",
        intent: "STRATEGY_PLAN",
        candidateProfile: emptyProfile
      });

      expect(contract.candidateExperienceAllowed).toBe(false);
      expect(contract.forbiddenBehaviors.some((b) => b.includes("Do NOT invent candidate personal experience"))).toBe(true);

      const prompt = buildFastSeoInterviewPrompt(emptyProfile, undefined, contract);
      expect(prompt).toContain("NEVER invent candidate personal history");
      expect(prompt).toContain("Với case này em sẽ");
    });
  });

  describe("Test G: Malformed STT Resilience", () => {
    it("contract uses structured semantic evidence instead of malformed phonetic tokens", () => {
      const accumulator = new SemanticEvidenceAccumulator();
      // STT malformed text but evidence successfully extracted 20 triệu and entities
      accumulator.appendFinal("bớt chết ban đầu khoảng hai mươi triệu phân bố content entity guest post");

      const contract = buildAnswerContract({
        question: "bớt chết ban đầu khoảng hai mươi triệu phân bố content entity guest post",
        intent: "BUDGET_ALLOCATION",
        semanticEvidence: accumulator.getState()
      });

      expect(contract.requiredFacts.some((f) => f.includes("20 triệu"))).toBe(true);
      expect(contract.requiredEntities).toContain("content");
      expect(contract.requiredEntities).toContain("Entity");
      expect(contract.requiredEntities).toContain("Guest Post");
    });
  });

  describe("Test H: Contract Compatibility", () => {
    it("determines contract compatibility accurately for speculative prewarm reuse vs replacement", () => {
      const provContract = buildAnswerContract({
        question: "20 triệu chia content",
        intent: "BUDGET_ALLOCATION"
      });

      // Final question adds Content + Entity -> Compatible (only 1 new entity)
      const minorFinalContract = buildAnswerContract({
        question: "20 triệu chia Content và Entity thế nào?",
        intent: "BUDGET_ALLOCATION"
      });
      const check1 = isContractCompatible(provContract, minorFinalContract);
      expect(check1.compatible).toBe(true);

      // Final question materially expands with 3 new entities -> Incompatible (triggers fresh generation)
      const expandedFinalContract = buildAnswerContract({
        question: "20 triệu chia Content Entity Guest Post PBN 301 thế nào?",
        intent: "BUDGET_ALLOCATION"
      });
      const check2 = isContractCompatible(provContract, expandedFinalContract);
      expect(check2.compatible).toBe(false);
      expect(check2.reason).toContain("materially expanded");

      // Intent shifted -> Incompatible
      const shiftedFinalContract = buildAnswerContract({
        question: "Tại sao ngày 10 đi PBN?",
        intent: "PBN_TIMING"
      });
      const check3 = isContractCompatible(provContract, shiftedFinalContract);
      expect(check3.compatible).toBe(false);
    });
  });

  describe("Prompt Formatting & Word Budget", () => {
    it("formats contract for prompt in under 5ms with strict word budget", () => {
      const contract = buildAnswerContract({
        question: "Budget ban đầu 20 triệu chia Content Entity Guest Post PBN thế nào?",
        intent: "BUDGET_ALLOCATION"
      });

      const formatted = formatContractForPrompt(contract);
      expect(formatted).toContain("[INTERVIEW QUESTION CONTRACT & DIRECT RESPONSE DIRECTIVES]");
      expect(formatted).toContain("DIRECT_ALLOCATION");
      expect(contract.contractBuildMs).toBeLessThan(10);
    });
  });
});
