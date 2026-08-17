import { describe, expect, it } from "vitest";
import {
  buildAnswerContract,
  extractGroundedContractFacts,
  isContractCompatible,
  normalizeNumericFact
} from "./answerContract";
import { buildFastSeoInterviewPrompt } from "./prompts/fastSeoInterviewPrompt";
import type { CandidateProfile } from "../shared/candidateProfile";
import type { KnowledgeChunk } from "../knowledge/types";

describe("Phase 4.1: Grounded Answer Contract Safety Tests", () => {
  describe("Test A: Candidate Project Unrelated (Safety Guard)", () => {
    it("disallows first-person claims for PBN when candidate only has React ecommerce background", () => {
      const ecommerceProfile: CandidateProfile = {
        fullName: "Nguyen Van A",
        role: "Web Developer & SEO Specialist",
        background: "React Web Development",
        skills: ["React", "TypeScript", "HTML/CSS"],
        seoSkills: ["Technical SEO", "On-page"],
        tools: ["GSC", "GA4"],
        markets: ["VN"],
        strengths: ["DOM Debugging"],
        experienceNotes: "Built and optimized React ecommerce platform.",
        projects: [
          {
            name: "React Ecommerce Platform",
            role: "Frontend & Technical SEO",
            description: "Built React ecommerce website, optimized Core Web Vitals and schema."
          }
        ]
      };

      const contract = buildAnswerContract({
        question: "Em đã đi PBN như thế nào?",
        intent: "PBN_TIMING",
        candidateProfile: ecommerceProfile
      });

      expect(contract.candidateExperience.allowed).toBe(false);
      expect(contract.candidateExperienceAllowed).toBe(false);
      expect(contract.candidateExperience.reason).toContain("lacks project evidence");

      const prompt = buildFastSeoInterviewPrompt(ecommerceProfile, undefined, contract);
      expect(prompt).toContain("Do NOT claim personal candidate experience");
      expect(prompt).toContain("Với case này em sẽ");
    });
  });

  describe("Test B: Candidate PBN Experience Supported", () => {
    it("allows personal framing when candidate profile contains verified PBN project experience", () => {
      const pbnProfile: CandidateProfile = {
        fullName: "Nguyen Van B",
        role: "Senior SEO Specialist",
        background: "iGaming Technical SEO",
        skills: ["PBN Management", "Technical SEO"],
        seoSkills: ["PBN", "Guest Post", "On-page"],
        tools: ["Ahrefs", "GSC"],
        markets: ["VN"],
        strengths: ["PBN Deployment"],
        experienceNotes: "Managed PBN network and Guest Post campaigns.",
        projects: [
          {
            name: "iGaming Satellite Network",
            role: "SEO Lead",
            description: "SEO iGaming project, managed PBN rollout and Guest Post."
          }
        ]
      };

      const contract = buildAnswerContract({
        question: "Tại sao em đi PBN ngày thứ 10?",
        intent: "PBN_TIMING",
        candidateProfile: pbnProfile
      });

      expect(contract.candidateExperience.allowed).toBe(true);
      expect(contract.candidateExperienceAllowed).toBe(true);
      expect(contract.candidateExperience.supportedTopics).toContain("PBN");
      expect(contract.candidateExperience.supportingProjectIds).toContain("iGaming Satellite Network");
    });
  });

  describe("Test C: Practitioner Chunk Does Not Become Personal Autobiography", () => {
    it("treats practitioner playbook chunks as industry reference rather than candidate history", () => {
      const candidateProfileWithoutPbn: CandidateProfile = {
        fullName: "Candidate C",
        role: "SEO Specialist",
        background: "Technical SEO",
        skills: ["Technical SEO"],
        seoSkills: ["Technical SEO", "On-page"],
        tools: ["GSC"],
        markets: ["VN"],
        strengths: ["Technical Audit"],
        experienceNotes: "Technical on-page auditing.",
        projects: [
          {
            name: "News Portal Optimization",
            description: "On-page and technical optimization for news site."
          }
        ]
      };

      const retrievedChunks: KnowledgeChunk[] = [
        {
          id: "chunk-uu88-pbn",
          sourceType: "practitioner_playbook",
          topic: "PBN",
          content: "Ở project UU88 used PBN around day 10 sau khi site đã index.",
          title: "UU88 PBN Timing",
          tags: ["uu88", "pbn", "day 10"],
          confidence: "practitioner_experience",
          canClaimAsPersonalExperience: false
        }
      ];

      const contract = buildAnswerContract({
        question: "Ở UU88 em triển khai PBN thế nào?",
        intent: "PBN_TIMING",
        retrievedChunks,
        candidateProfile: candidateProfileWithoutPbn
      });

      expect(contract.candidateExperience.allowed).toBe(false);
      expect(contract.groundedFacts.length).toBeGreaterThan(0);
      expect(contract.groundedFacts[0].sourceType).toBe("practitioner_playbook");

      const prompt = buildFastSeoInterviewPrompt(candidateProfileWithoutPbn, undefined, contract);
      expect(prompt).toContain("PRACTITIONER PLAYBOOK IS REFERENCE, NOT CANDIDATE HISTORY");
      expect(prompt).toContain("Do NOT claim personal candidate experience");
    });
  });

  describe("Test D: Grounded Budget Allocation (Practitioner Example)", () => {
    it("sets allocationGrounding to PRACTITIONER_EXAMPLE when retrieved chunks contain explicit budget breakdown", () => {
      const retrievedChunks: KnowledgeChunk[] = [
        {
          id: "chunk-budget-20m",
          sourceType: "practitioner_playbook",
          topic: "BUDGET",
          content: "20m workflow: Content 6m, Entity 3m, Guest Post 5m, PBN 6m.\nPhân bổ ngân sách 20 triệu cho site mới.",
          title: "20M Budget Allocation",
          tags: ["20 triệu", "content", "entity", "guest post", "pbn"],
          confidence: "practitioner_experience",
          canClaimAsPersonalExperience: false
        }
      ];

      const contract = buildAnswerContract({
        question: "20 triệu chia Content Entity Guest Post PBN thế nào?",
        intent: "BUDGET_ALLOCATION",
        retrievedChunks
      });

      expect(contract.allocationGrounding).toBe("PRACTITIONER_EXAMPLE");
      expect(contract.groundedFacts.some((f) => f.value.includes("Content 6m"))).toBe(true);
      expect(contract.firstSentenceDirective).toContain("grounded in the practitioner playbook reference");
    });
  });

  describe("Test E: Ungrounded Budget Allocation (Proposed)", () => {
    it("sets allocationGrounding to PROPOSED when no retrieved chunk contains exact allocation", () => {
      const contract = buildAnswerContract({
        question: "20 triệu chia Content Entity Guest Post PBN thế nào?",
        intent: "BUDGET_ALLOCATION",
        retrievedChunks: []
      });

      expect(contract.allocationGrounding).toBe("PROPOSED");
      expect(contract.firstSentenceDirective).toContain("reasonable strategy proposal");
      expect(contract.firstSentenceDirective).toContain("not as an ungrounded historical fact");
    });
  });

  describe("Test F: Direct Allocation Strict Entity Expansion Compatibility", () => {
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
  });

  describe("Test G: Normalized Fact Equivalence", () => {
    it("treats equivalent numeric representations ('20 triệu' and '20tr') as compatible", () => {
      expect(normalizeNumericFact("20 triệu")).toBe("20 triệu");
      expect(normalizeNumericFact("20tr")).toBe("20 triệu");
      expect(normalizeNumericFact("20 củ")).toBe("20 triệu");
      expect(normalizeNumericFact("budget: hai mươi triệu")).toBe("20 triệu");

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
  });

  describe("Test H: Material Fact Change", () => {
    it("rejects speculative reuse when numeric budget or DR values change", () => {
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
  });

  describe("Performance Benchmark", () => {
    it("extracts grounded facts and builds full contract in under 5ms", () => {
      const chunks: KnowledgeChunk[] = [
        {
          id: "chunk-1",
          sourceType: "practitioner_playbook",
          topic: "BUDGET",
          content: "Content 6m, Entity 3m, Guest Post 5m, PBN 6m",
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
