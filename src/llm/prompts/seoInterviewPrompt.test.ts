import { describe, expect, it } from "vitest";
import { SEO_INTERVIEW_SYSTEM_PROMPT } from "./seoInterviewPrompt";

describe("SEO Interview System Prompt Behavioral Requirements & Constraints", () => {
  it("maintains strict line count budget (50-80 target, under 80 lines)", () => {
    const lines = SEO_INTERVIEW_SYSTEM_PROMPT.split("\n").length;
    expect(lines).toBeGreaterThanOrEqual(25);
    expect(lines).toBeLessThanOrEqual(80);
  });

  it("defines copilot role and natural spoken candidate tone ('em', 'anh')", () => {
    expect(SEO_INTERVIEW_SYSTEM_PROMPT).toContain("live interview copilot");
    expect(SEO_INTERVIEW_SYSTEM_PROMPT).toContain("SAY OUT LOUD");
    expect(SEO_INTERVIEW_SYSTEM_PROMPT).toContain('"em"');
    expect(SEO_INTERVIEW_SYSTEM_PROMPT).toContain('"anh"');
  });

  it("whitelists standard English SEO industry terms", () => {
    const requiredTerms = [
      "GSC", "GA4", "Ahrefs", "keyword", "ranking", "traffic", "indexing",
      "canonical", "crawl", "bot", "on-page", "internal link", "backlink",
      "referring domain", "anchor text", "Entity", "Guest Post", "PBN",
      "expired domain", "DR", "UR", "Core Update", "301", "money site", "search intent"
    ];
    for (const term of requiredTerms) {
      expect(SEO_INTERVIEW_SYSTEM_PROMPT).toContain(term);
    }
  });

  it("enforces output constraints: 80-140 words, max 4 bullets, max 5 keywords", () => {
    expect(SEO_INTERVIEW_SYSTEM_PROMPT).toContain("80-140 Vietnamese words");
    expect(SEO_INTERVIEW_SYSTEM_PROMPT).toContain("max 4 concise");
    expect(SEO_INTERVIEW_SYSTEM_PROMPT).toContain("maximum 5");
  });

  it("contains all 5 core question mode behaviors", () => {
    expect(SEO_INTERVIEW_SYSTEM_PROMPT).toContain("PERSONAL_EXPERIENCE");
    expect(SEO_INTERVIEW_SYSTEM_PROMPT).toContain("STRATEGY");
    expect(SEO_INTERVIEW_SYSTEM_PROMPT).toContain("DIAGNOSTIC");
    expect(SEO_INTERVIEW_SYSTEM_PROMPT).toContain("DECISION");
    expect(SEO_INTERVIEW_SYSTEM_PROMPT).toContain("FOLLOW_UP");
  });

  describe("Behavioral Rules Enforcement", () => {
    it("enforces Personal Experience no-fabrication rule & short placeholders for unknown personal facts", () => {
      expect(SEO_INTERVIEW_SYSTEM_PROMPT).toContain("Never fabricate candidate facts");
      expect(SEO_INTERVIEW_SYSTEM_PROMPT).toContain("[TÊN SITE]");
    });

    it("enforces Strategy concrete numbers rule without placeholders when budget is given", () => {
      expect(SEO_INTERVIEW_SYSTEM_PROMPT).toContain("STRATEGY");
      expect(SEO_INTERVIEW_SYSTEM_PROMPT).toContain("numerical allocations");
      expect(SEO_INTERVIEW_SYSTEM_PROMPT).toContain("do NOT output placeholders like [BUDGET]");
    });

    it("enforces Diagnostic evidence-based reasoning rule", () => {
      expect(SEO_INTERVIEW_SYSTEM_PROMPT).toContain("DIAGNOSTIC");
      expect(SEO_INTERVIEW_SYSTEM_PROMPT).toContain("Reason directly from evidence");
    });

    it("enforces Decision position-first rule", () => {
      expect(SEO_INTERVIEW_SYSTEM_PROMPT).toContain("DECISION");
      expect(SEO_INTERVIEW_SYSTEM_PROMPT).toContain("Take a clear position first");
    });

    it("enforces Follow-up concise prior-context answer rule", () => {
      expect(SEO_INTERVIEW_SYSTEM_PROMPT).toContain("FOLLOW_UP");
      expect(SEO_INTERVIEW_SYSTEM_PROMPT).toContain("1-2 sentence");
    });

    it("enforces preservation of interviewer-supplied data", () => {
      expect(SEO_INTERVIEW_SYSTEM_PROMPT).toContain("Interviewer Data");
      expect(SEO_INTERVIEW_SYSTEM_PROMPT).toContain("Never replace supplied data with placeholders");
    });
  });
});
