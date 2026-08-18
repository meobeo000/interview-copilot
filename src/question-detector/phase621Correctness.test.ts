import { describe, it, expect } from "vitest";
import {
  detectFollowUp,
  resolveFollowUpContext,
  extractDecisionFromCompletedTurn
} from "./followUpDetector";
import { evaluateCandidateExperience } from "../llm/answerContract";
import type { CandidateProfile } from "../shared/candidateProfile";
import type { SuggestedAnswer } from "../shared/types";
import type { InterviewTurnContext } from "./interviewTurnContext";

describe("Phase 6.2.1 Correctness & Adversarial Tests", () => {
  describe("1. Grounded Domain Decision Extraction", () => {
    const question = "Domain A DR 70, domain B DR 30, em chọn domain nào?";

    it("extracts choice 'domain A' when answer clearly chooses domain A", () => {
      const answer: SuggestedAnswer = {
        openingLine: "Em chọn domain A vì history sạch hơn.",
        bullets: ["Check Wayback history", "Redirect clean URLs"],
        keywords: ["domain A", "history"]
      };

      const decision = extractDecisionFromCompletedTurn(question, "DOMAIN_SELECTION", answer);
      expect(decision).toBeDefined();
      expect(decision?.choice).toBe("domain A");
      expect(decision?.action).toBe("Em chọn domain A vì history sạch hơn.");
    });

    it("extracts choice 'domain B' when answer clearly chooses domain B", () => {
      const answer: SuggestedAnswer = {
        openingLine: "Em chọn domain B vì có organic traffic thật.",
        bullets: ["Monitor GSC keywords", "Scale internal links"],
        keywords: ["domain B", "traffic"]
      };

      const decision = extractDecisionFromCompletedTurn(question, "DOMAIN_SELECTION", answer);
      expect(decision).toBeDefined();
      expect(decision?.choice).toBe("domain B");
      expect(decision?.action).toBe("Em chọn domain B vì có organic traffic thật.");
    });

    it("does NOT hallucinate domain A or B when answer does not make a selection", () => {
      const answer: SuggestedAnswer = {
        openingLine: "Em sẽ kiểm tra thêm Wayback và backlink profile trước khi quyết định.",
        bullets: ["Check anchor text spam", "Verify clean indexing history"],
        keywords: ["Wayback", "audit"]
      };

      const decision = extractDecisionFromCompletedTurn(question, "DOMAIN_SELECTION", answer);
      expect(decision).toBeDefined();
      expect(decision?.choice).toBeUndefined();
      expect(decision?.action).toBe("Em sẽ kiểm tra thêm Wayback và backlink profile trước khi quyết định.");
    });

    it("does NOT provide a fake previous decision to 'Tại sao?' after ambiguous decision", () => {
      const prevContext: InterviewTurnContext = {
        turnId: "turn-domain-1",
        question: "Domain A DR 68 nhưng traffic gần như bằng 0. Domain B DR 31 nhưng có organic traffic thật. Em chọn domain nào?",
        intent: "DOMAIN_SELECTION",
        entities: ["DR", "traffic", "domain"],
        numericFacts: ["DR 68", "DR 31"],
        decision: {
          action: "Em cần kiểm tra thêm Wayback và anchor profile trước khi quyết định."
        },
        committedAt: Date.now() - 5000
      };

      const resolved = resolveFollowUpContext("Tại sao?", prevContext, "turn-domain-followup");
      expect(resolved.contextResolved).toBe(true);
      expect(resolved.followUpType).toBe("WHY");
      expect(resolved.previousDecision?.choice).toBeUndefined();
      expect(resolved.resolvedMeaning).toContain("Explain why the previous decision");
      expect(resolved.resolvedMeaning).not.toContain("domain B");
    });
  });

  describe("2. Generalization & Safety of ENTITY_CONTINUATION", () => {
    it("detects known SEO vocabulary as ENTITY_CONTINUATION", () => {
      expect(detectFollowUp("Còn PBN?")).toMatchObject({ detected: true, type: "ENTITY_CONTINUATION", targetEntity: "PBN" });
      expect(detectFollowUp("Còn canonical?")).toMatchObject({ detected: true, type: "ENTITY_CONTINUATION", targetEntity: "canonical" });
      expect(detectFollowUp("Còn crawl budget?")).toMatchObject({ detected: true, type: "ENTITY_CONTINUATION", targetEntity: "crawl budget" });
      expect(detectFollowUp("Thế còn Core Update?")).toMatchObject({ detected: true, type: "ENTITY_CONTINUATION", targetEntity: "Core Update" });
      expect(detectFollowUp("Vậy còn 301?")).toMatchObject({ detected: true, type: "ENTITY_CONTINUATION", targetEntity: "301" });
      expect(detectFollowUp("Còn money page thì sao?")).toMatchObject({ detected: true, type: "ENTITY_CONTINUATION", targetEntity: "money page" });
      expect(detectFollowUp("Còn Search Intent?")).toMatchObject({ detected: true, type: "ENTITY_CONTINUATION", targetEntity: "Search Intent" });
      expect(detectFollowUp("Còn referring domain?")).toMatchObject({ detected: true, type: "ENTITY_CONTINUATION", targetEntity: "referring domain" });
    });

    it("resolves contextual entities present in previous turn", () => {
      const prevContext: InterviewTurnContext = {
        turnId: "turn-prev-technical",
        question: "Site bị tụt traffic nhưng indexing vẫn bình thường. Em check technical SEO như thế nào?",
        intent: "ONPAGE_DIAGNOSIS",
        entities: ["traffic", "indexing", "technical SEO", "canonical", "sitemap"],
        numericFacts: [],
        committedAt: Date.now() - 5000
      };

      const resolved = resolveFollowUpContext("Còn canonical?", prevContext, "turn-followup-canonical");
      expect(resolved.contextResolved).toBe(true);
      expect(resolved.followUpType).toBe("ENTITY_CONTINUATION");
      expect(resolved.targetEntity).toBe("canonical");
    });

    it("rejects non-SEO conversational phrases and numbers from ENTITY_CONTINUATION", () => {
      expect(detectFollowUp("Còn cà phê?").detected).toBe(false);
      expect(detectFollowUp("Còn ngày mai?").detected).toBe(false);
      expect(detectFollowUp("Còn anh?").detected).toBe(false);
      expect(detectFollowUp("Còn 20 triệu?").detected).toBe(false);
      expect(detectFollowUp("Còn 50k?").detected).toBe(false);
      expect(detectFollowUp("Còn 10%?").detected).toBe(false);
    });
  });

  describe("3. Unicode-Safe Candidate Experience Authorization", () => {
    it("authorizes first-person claims only when verified project evidence exists", () => {
      const profileWithPbn: CandidateProfile = {
        fullName: "Test Candidate",
        role: "Senior SEO",
        background: "5 years SEO experience",
        skills: ["SEO"],
        tools: ["Ahrefs", "GSC"],
        markets: ["VN"],
        strengths: ["Technical"],
        experienceNotes: "",
        seoSkills: ["PBN", "Entity", "Technical SEO"],
        projects: [
          {
            name: "iGaming PBN Network",
            role: "Lead SEO",
            description: "Xây dựng và vận hành hệ thống vệ tinh PBN 50 domains ngách casino",
            metrics: "Top 3 từ khóa chính"
          }
        ]
      };

      const result = evaluateCandidateExperience("Em đã triển khai PBN thực tế như thế nào?", profileWithPbn);
      expect(result.allowed).toBe(true);
      expect(result.evidenceType).toBe("PROJECT");
      expect(result.supportedTopics).toContain("PBN");
      expect(result.supportingProjectIds).toContain("iGaming PBN Network");
    });

    it("prohibits first-person claims when technique is only in seoSkills", () => {
      const profileSkillOnly: CandidateProfile = {
        fullName: "Test Candidate",
        role: "Middle SEO",
        background: "2 years SEO experience",
        skills: ["SEO"],
        tools: ["GSC"],
        markets: ["VN"],
        strengths: ["Onpage"],
        experienceNotes: "",
        seoSkills: ["PBN", "Guest Post", "301 Redirect"],
        projects: [
          {
            name: "E-commerce Onpage",
            role: "SEO Specialist",
            description: "Tối ưu on-page và content audit cho website thương mại điện tử",
            metrics: "Tăng 30% organic traffic"
          }
        ]
      };

      const result = evaluateCandidateExperience("Em đã triển khai PBN thực tế như thế nào?", profileSkillOnly);
      expect(result.allowed).toBe(false);
      expect(result.evidenceType).toBe("NONE");
    });

    it("prohibits first-person claims when technique is only in experienceNotes", () => {
      const profileNoteOnly: CandidateProfile = {
        fullName: "Test Candidate",
        role: "Junior SEO",
        background: "Junior",
        skills: ["SEO"],
        tools: ["GSC"],
        markets: ["VN"],
        strengths: ["Learning"],
        seoSkills: ["General SEO"],
        experienceNotes: "Đang học hỏi và nghiên cứu mô hình PBN cũng như redirect 301",
        projects: []
      };

      const result = evaluateCandidateExperience("Kinh nghiệm triển khai PBN của em ra sao?", profileNoteOnly);
      expect(result.allowed).toBe(false);
      expect(result.evidenceType).toBe("NONE");
    });

    it("does NOT trigger on substring collisions (token-boundary safety)", () => {
      const profileCollision: CandidateProfile = {
        fullName: "Test Candidate",
        role: "Middle SEO",
        background: "2 years SEO experience",
        skills: ["SEO"],
        tools: ["GSC"],
        markets: ["VN"],
        strengths: ["Content"],
        seoSkills: ["Content SEO"],
        experienceNotes: "",
        projects: [
          {
            name: "Fashion Brand",
            role: "Content Writer",
            description: "Viết bài chuẩn SEO và quản trị website apbnetwork thời trang",
            metrics: "100 bài viết"
          }
        ]
      };

      // "apbnetwork" contains substring "pbn", but is not the token/phrase "PBN"
      const result = evaluateCandidateExperience("Em đã triển khai PBN thế nào?", profileCollision);
      expect(result.allowed).toBe(false);
    });

    it("safely matches Vietnamese diacritics and phrases", () => {
      const profileDiacritics: CandidateProfile = {
        fullName: "Test Candidate",
        role: "SEO Manager",
        background: "4 years SEO experience",
        skills: ["SEO"],
        tools: ["Ahrefs", "GSC"],
        markets: ["VN"],
        strengths: ["Off-page"],
        seoSkills: ["Off-page SEO"],
        experienceNotes: "",
        projects: [
          {
            name: "Hệ thống vệ tinh",
            role: "SEO Manager",
            description: "Triển khai hệ thống site vệ tinh và tối ưu cấu trúc link cho mảng cá cược",
            metrics: "Đạt top 1"
          }
        ]
      };

      const result = evaluateCandidateExperience("Em xây dựng hệ thống site vệ tinh như thế nào?", profileDiacritics);
      expect(result.allowed).toBe(true);
      expect(result.supportedTopics).toContain("PBN");
    });
  });
});
