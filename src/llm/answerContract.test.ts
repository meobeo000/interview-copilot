import { describe, expect, it } from "vitest";
import {
  buildAnswerContract,
  extractGroundedContractFacts,
  isContractCompatible,
  normalizeDrFact,
  normalizeDurationFact,
  normalizeMoneyFact,
  normalizeNumericFact,
  normalizePercentageFact,
  normalizePositionFact,
  normalizeRequiredFact
} from "./answerContract";
import { buildFastSeoInterviewPrompt } from "./prompts/fastSeoInterviewPrompt";
import type { CandidateProfile } from "../shared/candidateProfile";
import type { KnowledgeChunk } from "../knowledge/types";

describe("Phase 4.1.1: Grounding Correctness Patch Tests", () => {
  // -------------------------------------------------------------------------
  // FIX 1: Typed Numeric Fact Normalization
  // -------------------------------------------------------------------------
  describe("Fix 1: Typed Fact Normalization", () => {
    it("Test 1A: normalizes DR facts without money conversion", () => {
      const fact = "DR: DR 55, DR 20";
      const normalized = normalizeRequiredFact(fact);
      expect(normalized).toBe("dr:20,55");
      expect(normalized).not.toContain("triệu");
      expect(normalized).not.toContain("vnd");

      const singleDr = normalizeDrFact("DR 55");
      expect(singleDr).toBe("dr:55");
      expect(singleDr).not.toContain("triệu");
    });

    it("Test 1B: normalizes position facts without money conversion", () => {
      const fact = "average position: 6.8";
      const normalized = normalizeRequiredFact(fact);
      expect(normalized).toBe("position:6.8");
      expect(normalized).not.toContain("triệu");
      expect(normalized).not.toContain("vnd");

      const pos = normalizePositionFact("position 3.2");
      expect(pos).toBe("position:3.2");
    });

    it("Test 1C: normalizes percentage facts without money conversion", () => {
      const fact = "ranking drop: 40%";
      const normalized = normalizeRequiredFact(fact);
      expect(normalized).toBe("percent:40");
      expect(normalized).not.toContain("triệu");

      const pct = normalizePercentageFact("giảm 40 phần trăm");
      expect(pct).toBe("percent:40");
    });

    it("Test 1D: normalizes money facts to canonical representation and preserves currency", () => {
      const fact1 = "budget: 20tr";
      const fact2 = "budget: 20 triệu";
      const fact3 = "20 củ";
      const fact4 = "ngân sách hai mươi triệu";
      const factUsd1 = "20 USD";
      const factUsd2 = "budget: $50";

      expect(normalizeMoneyFact(fact1)).toBe("budget:20000000:vnd");
      expect(normalizeMoneyFact(fact2)).toBe("budget:20000000:vnd");
      expect(normalizeMoneyFact(fact3)).toBe("budget:20000000:vnd");
      expect(normalizeMoneyFact(fact4)).toBe("budget:20000000:vnd");
      expect(normalizeMoneyFact("20 triệu")).toBe("budget:20000000:vnd");

      expect(normalizeMoneyFact(factUsd1)).toBe("budget:20:usd");
      expect(normalizeMoneyFact(factUsd2)).toBe("budget:50:usd");

      expect(normalizeRequiredFact(fact1)).toBe(normalizeRequiredFact(fact2));
    });

    it("normalizes durations without money conversion", () => {
      const d1 = normalizeDurationFact("10 ngày");
      expect(d1).toBe("duration:10_ngày");
      expect(d1).not.toContain("triệu");

      const d2 = normalizeDurationFact("hai tuần");
      expect(d2).toBe("duration:2_tuần");
      expect(d2).not.toContain("triệu");
    });

    it("compatibility wrapper normalizeNumericFact delegates to normalizeRequiredFact", () => {
      expect(normalizeNumericFact("DR 55")).toBe("dr:55");
      expect(normalizeNumericFact("20 triệu")).toBe("budget:20000000:vnd");
    });
  });

  // -------------------------------------------------------------------------
  // FIX 2: Candidate Hands-on Evidence Requirement
  // -------------------------------------------------------------------------
  describe("Fix 2: Candidate Hands-on Evidence Requirement", () => {
    it("Test 2A: disallows personal PBN claims when candidate only has seoSkills: ['PBN'] without project backing", () => {
      const profileWithSkillOnly: CandidateProfile = {
        fullName: "Nguyen Van A",
        role: "Frontend Developer",
        background: "React Web Development",
        skills: ["React", "TypeScript"],
        seoSkills: ["PBN", "Technical SEO"],
        tools: ["GSC"],
        markets: ["VN"],
        strengths: ["Web Speed"],
        experienceNotes: "Built React web application.",
        projects: [
          {
            name: "React Ecommerce Store",
            role: "Developer",
            description: "Built React ecommerce frontend and optimized schema markup."
          }
        ]
      };

      const contract = buildAnswerContract({
        question: "Em đã triển khai PBN như thế nào?",
        intent: "PBN_TIMING",
        candidateProfile: profileWithSkillOnly
      });

      expect(contract.candidateExperience.allowed).toBe(false);
      expect(contract.candidateExperience.evidenceType).toBe("NONE");
      expect(contract.candidateExperience.reason).toContain("lacks hands-on project evidence for: PBN");

      const prompt = buildFastSeoInterviewPrompt(profileWithSkillOnly, undefined, contract);
      expect(prompt).toContain("Do NOT claim personal candidate experience");
      expect(prompt).toContain("Với case này em sẽ");
    });

    it("Test 2B: allows personal framing when project description contains hands-on PBN management", () => {
      const pbnProfile: CandidateProfile = {
        fullName: "Nguyen Van B",
        role: "Senior SEO Specialist",
        background: "iGaming Technical SEO",
        skills: ["PBN Management"],
        seoSkills: ["PBN", "Guest Post"],
        tools: ["Ahrefs", "GSC"],
        markets: ["VN"],
        strengths: ["Satellite Deployment"],
        experienceNotes: "Managed satellite sites for betting projects.",
        projects: [
          {
            name: "iGaming Satellite Network",
            role: "SEO Lead",
            description: "SEO iGaming project. Managed PBN rollout and Guest Post placements."
          }
        ]
      };

      const contract = buildAnswerContract({
        question: "Tại sao em đi PBN ngày thứ 10?",
        intent: "PBN_TIMING",
        candidateProfile: pbnProfile
      });

      expect(contract.candidateExperience.allowed).toBe(true);
      expect(contract.candidateExperience.evidenceType).toBe("PROJECT");
      expect(contract.candidateExperience.supportedTopics).toContain("PBN");
      expect(contract.candidateExperience.supportingProjectIds).toContain("iGaming Satellite Network");
    });

    it("Test 2C: disallows personal claims when candidate only has seoSkills: ['expired domain', '301']", () => {
      const skillOnlyProfile: CandidateProfile = {
        fullName: "Nguyen Van C",
        role: "SEO Junior",
        background: "Content Writing",
        skills: ["Content"],
        seoSkills: ["expired domain", "301 redirect"],
        tools: ["GSC"],
        markets: ["VN"],
        strengths: ["Copywriting"],
        experienceNotes: "Wrote SEO content articles.",
        projects: []
      };

      const contract = buildAnswerContract({
        question: "Em đã dùng expired domain và 301 thế nào?",
        intent: "EXPIRED_DOMAIN",
        candidateProfile: skillOnlyProfile
      });

      expect(contract.candidateExperience.allowed).toBe(false);
      expect(contract.candidateExperience.evidenceType).toBe("NONE");
    });
  });

  // -------------------------------------------------------------------------
  // FIX 3: Budget Grounding Allocation Evidence
  // -------------------------------------------------------------------------
  describe("Fix 3: Budget Allocation Grounding Qualification", () => {
    it("Test 3A: qualifies as PRACTITIONER_EXAMPLE when chunk contains money and >= 2 requested spend categories", () => {
      const validChunk: KnowledgeChunk = {
        id: "chunk-budget-20m-valid",
        sourceType: "practitioner_playbook",
        topic: "BUDGET",
        content: "Budget 20 triệu: 6 triệu Content, 3 triệu Entity, 5 triệu Guest Post, 6 triệu PBN.",
        title: "20M Budget SEO Allocation",
        tags: ["20 triệu", "content", "entity", "guest post", "pbn"],
        confidence: "practitioner_experience",
        canClaimAsPersonalExperience: false
      };

      const contract = buildAnswerContract({
        question: "20 triệu chia Content, Entity, Guest Post, PBN thế nào?",
        intent: "BUDGET_ALLOCATION",
        retrievedChunks: [validChunk]
      });

      expect(contract.allocationGrounding).toBe("PRACTITIONER_EXAMPLE");
      expect(contract.groundedFacts.length).toBeGreaterThan(0);
      expect(contract.firstSentenceDirective).toContain("grounded in the practitioner playbook reference");
    });

    it("Test 3B: sets allocationGrounding to PROPOSED when chunk only mentions non-SEO spend (hosting, dev, tracking)", () => {
      const nonSeoChunk: KnowledgeChunk = {
        id: "chunk-budget-non-seo",
        sourceType: "practitioner_playbook",
        topic: "BUDGET",
        content: "Budget 20 triệu: 12 triệu hosting, 5 triệu development, 3 triệu tracking.",
        title: "Server & Dev Budget",
        tags: ["hosting", "dev", "tracking"],
        confidence: "practitioner_experience",
        canClaimAsPersonalExperience: false
      };

      const contract = buildAnswerContract({
        question: "20 triệu chia Content, Entity, Guest Post và PBN thế nào?",
        intent: "BUDGET_ALLOCATION",
        retrievedChunks: [nonSeoChunk]
      });

      expect(contract.allocationGrounding).toBe("PROPOSED");
      expect(contract.firstSentenceDirective).toContain("proposal/approximation language");
    });

    it("Test 3C: sets allocationGrounding to PROPOSED when chunk only matches ONE requested spend category", () => {
      const singleCategoryChunk: KnowledgeChunk = {
        id: "chunk-budget-single-cat",
        sourceType: "practitioner_playbook",
        topic: "BUDGET",
        content: "Budget 20 triệu: 10 triệu Content, 10 triệu hosting.",
        title: "Content & Hosting",
        tags: ["content", "hosting"],
        confidence: "practitioner_experience",
        canClaimAsPersonalExperience: false
      };

      const contract = buildAnswerContract({
        question: "20 triệu chia Content, Entity, Guest Post và PBN thế nào?",
        intent: "BUDGET_ALLOCATION",
        retrievedChunks: [singleCategoryChunk]
      });

      expect(contract.allocationGrounding).toBe("PROPOSED");
    });

    it("Regression: does NOT qualify when chunk spend categories (PBN + backlink) do not match question categories (Content + Entity)", () => {
      const pbnBacklinkChunk: KnowledgeChunk = {
        id: "chunk-pbn-backlink",
        sourceType: "practitioner_playbook",
        topic: "BUDGET",
        content: "Budget 20 triệu: 12 triệu PBN, 8 triệu backlink.",
        title: "PBN and Backlink Budget",
        tags: ["pbn", "backlink"],
        confidence: "practitioner_experience",
        canClaimAsPersonalExperience: false
      };

      const contract = buildAnswerContract({
        question: "20 triệu phân bổ Content và Entity thế nào?",
        intent: "BUDGET_ALLOCATION",
        retrievedChunks: [pbnBacklinkChunk]
      });

      expect(contract.allocationGrounding).toBe("PROPOSED");
      expect(contract.groundedFacts.length).toBe(0);
    });

    it("Test 3D: handles percentage-based practitioner chunk without creating false 20m VND claims", () => {
      const percentageChunk: KnowledgeChunk = {
        id: "chunk-budget-pct",
        sourceType: "practitioner_playbook",
        topic: "BUDGET",
        content: "Budget 100 triệu: 40% Content, 20% Entity, 20% Guest Post, 20% PBN.",
        title: "Percentage SEO Allocation",
        tags: ["content", "entity", "guest post", "pbn"],
        confidence: "practitioner_experience",
        canClaimAsPersonalExperience: false
      };

      const contract = buildAnswerContract({
        question: "20 triệu chia Content, Entity, Guest Post và PBN thế nào?",
        intent: "BUDGET_ALLOCATION",
        retrievedChunks: [percentageChunk]
      });

      expect(contract.allocationGrounding).toBe("PRACTITIONER_EXAMPLE");
      expect(contract.groundedFacts[0].isPercentageBased).toBe(true);
      expect(contract.groundedFacts[0].value).toContain("40% Content");
    });
  });

  // -------------------------------------------------------------------------
  // FIX 4: Proposed Mode Wording Enforcement
  // -------------------------------------------------------------------------
  describe("Fix 4: Proposed Mode Wording Enforcement", () => {
    it("Test 4A: requires proposal / approximation language in Sentence 1 directive when PROPOSED", () => {
      const contract = buildAnswerContract({
        question: "20 triệu chia Content, Entity, Guest Post và PBN thế nào?",
        intent: "BUDGET_ALLOCATION",
        retrievedChunks: []
      });

      expect(contract.allocationGrounding).toBe("PROPOSED");
      expect(contract.firstSentenceDirective).toContain("proposal/approximation language");
      expect(contract.firstSentenceDirective).toContain("Với 20 triệu thì em có thể chia khoảng...");
    });

    it("Test 4B: generated prompt forbids treating PROPOSED numbers as candidate history or known facts", () => {
      const contract = buildAnswerContract({
        question: "20 triệu chia Content, Entity, Guest Post và PBN thế nào?",
        intent: "BUDGET_ALLOCATION",
        retrievedChunks: []
      });

      const prompt = buildFastSeoInterviewPrompt(undefined, undefined, contract);
      expect(prompt).toContain("In PROPOSED mode, do NOT present proposed numbers as known historical facts");
      expect(prompt).toContain("Sentence 1 MUST use proposal/approximation wording");
    });
  });

  // -------------------------------------------------------------------------
  // REGRESSION TESTS: Fact Compatibility & Lifecycle
  // -------------------------------------------------------------------------
  describe("Regression: Fact & Contract Compatibility", () => {
    it("rejects speculative reuse when DIRECT_ALLOCATION expands with even a single new spend category", () => {
      const provisional = buildAnswerContract({
        question: "20 triệu chia Content",
        intent: "BUDGET_ALLOCATION"
      });

      const finalContract = buildAnswerContract({
        question: "20 triệu chia Content và Entity thế nào?",
        intent: "BUDGET_ALLOCATION"
      });

      const check = isContractCompatible(provisional, finalContract);
      expect(check.compatible).toBe(false);
      expect(check.reason).toContain("DIRECT_ALLOCATION requires fresh stream when spend categories expand");
    });

    it("treats equivalent numeric representations ('20 triệu' and '20tr') as compatible", () => {
      const provisional = buildAnswerContract({
        question: "Budget 20 triệu chia content thế nào?",
        intent: "BUDGET_ALLOCATION"
      });

      const finalContract = buildAnswerContract({
        question: "Budget 20tr chia content thế nào?",
        intent: "BUDGET_ALLOCATION"
      });

      const check = isContractCompatible(provisional, finalContract);
      expect(check.compatible).toBe(true);
    });

    it("rejects speculative reuse when material budget numbers change ('20 triệu' vs '30 triệu')", () => {
      const provisional = buildAnswerContract({
        question: "20 triệu chia content thế nào?",
        intent: "BUDGET_ALLOCATION"
      });

      const finalContract = buildAnswerContract({
        question: "30 triệu chia content thế nào?",
        intent: "BUDGET_ALLOCATION"
      });

      const check = isContractCompatible(provisional, finalContract);
      expect(check.compatible).toBe(false);
      expect(check.reason).toContain("Material numeric fact change");
    });

    it("treats equivalent DR representations ('DR 55' and 'DR55') as compatible and different DRs as incompatible", () => {
      const prov1 = buildAnswerContract({
        question: "Domain DR 55",
        intent: "DOMAIN_SELECTION"
      });

      const final1 = buildAnswerContract({
        question: "Domain DR55",
        intent: "DOMAIN_SELECTION"
      });

      expect(isContractCompatible(prov1, final1).compatible).toBe(true);

      const finalDiffDr = buildAnswerContract({
        question: "Domain DR 70",
        intent: "DOMAIN_SELECTION"
      });

      expect(isContractCompatible(prov1, finalDiffDr).compatible).toBe(false);
    });
  });

  describe("Performance Benchmark", () => {
    it("extracts grounded facts and builds full contract in under 5ms", () => {
      const chunks: KnowledgeChunk[] = [
        {
          id: "chunk-1",
          sourceType: "practitioner_playbook",
          topic: "BUDGET",
          content: "Budget 20 triệu: Content 6m, Entity 3m, Guest Post 5m, PBN 6m",
          title: "Budget",
          tags: ["budget"],
          confidence: "practitioner_experience",
          canClaimAsPersonalExperience: false
        }
      ];

      const start = performance.now();
      const facts = extractGroundedContractFacts(chunks, "20 triệu chia Content Entity PBN");
      const contract = buildAnswerContract({
        question: "20 triệu chia Content Entity PBN",
        intent: "BUDGET_ALLOCATION",
        retrievedChunks: chunks
      });
      const elapsed = performance.now() - start;

      expect(facts.length).toBeGreaterThan(0);
      expect(contract.contractBuildMs).toBeLessThan(5);
      expect(elapsed).toBeLessThan(5);
    });
  });
});
