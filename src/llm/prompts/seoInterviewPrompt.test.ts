import { describe, expect, it } from "vitest";
import { SEO_INTERVIEW_SYSTEM_PROMPT } from "./seoInterviewPrompt";

describe("SEO Interview System Prompt Guidelines & Structure", () => {
  it("defines live interview copilot role and spoken target characteristics", () => {
    expect(SEO_INTERVIEW_SYSTEM_PROMPT).toContain("You are a live interview copilot for a Vietnamese SEO candidate");
    expect(SEO_INTERVIEW_SYSTEM_PROMPT).toContain("iGaming / Sports Betting SEO position");
    expect(SEO_INTERVIEW_SYSTEM_PROMPT).toContain("concise spoken interview answer");
    expect(SEO_INTERVIEW_SYSTEM_PROMPT).toContain("This is NOT:");
    expect(SEO_INTERVIEW_SYSTEM_PROMPT).toContain("- an SEO tutorial");
  });

  it("enforces natural candidate Vietnamese speech patterns ('em', 'anh')", () => {
    expect(SEO_INTERVIEW_SYSTEM_PROMPT).toContain('Đầu tiên em sẽ...');
    expect(SEO_INTERVIEW_SYSTEM_PROMPT).toContain('Em ưu tiên...');
    expect(SEO_INTERVIEW_SYSTEM_PROMPT).toContain('Avoid:');
    expect(SEO_INTERVIEW_SYSTEM_PROMPT).toContain('Theo lý thuyết SEO...');
  });

  it("specifies standard English SEO terminology whitelist", () => {
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

  it("configures glanceability target (80-140 words, max 5 bullets)", () => {
    expect(SEO_INTERVIEW_SYSTEM_PROMPT).toContain("80-140 Vietnamese words");
    expect(SEO_INTERVIEW_SYSTEM_PROMPT).toContain("Maximum 5 short, practical and speakable points.");
    expect(SEO_INTERVIEW_SYSTEM_PROMPT).toContain("Maximum 6 genuinely useful SEO terms");
  });

  it("defines 5 internal classification modes", () => {
    expect(SEO_INTERVIEW_SYSTEM_PROMPT).toContain("PERSONAL_EXPERIENCE");
    expect(SEO_INTERVIEW_SYSTEM_PROMPT).toContain("STRATEGY");
    expect(SEO_INTERVIEW_SYSTEM_PROMPT).toContain("DIAGNOSTIC");
    expect(SEO_INTERVIEW_SYSTEM_PROMPT).toContain("DECISION");
    expect(SEO_INTERVIEW_SYSTEM_PROMPT).toContain("FOLLOW_UP");
  });

  describe("REGRESSION TESTS (Prompt-level rule enforcement)", () => {
    it("1. Personal Experience: 'Dự án gần nhất em làm top là con nào?' enforces placeholders when context is absent", () => {
      expect(SEO_INTERVIEW_SYSTEM_PROMPT).toContain("Dự án gần nhất em làm là [TÊN SITE]");
      expect(SEO_INTERVIEW_SYSTEM_PROMPT).toContain("NEVER invent facts");
      expect(SEO_INTERVIEW_SYSTEM_PROMPT).toContain("Never invent: UU88, 20 triệu, Top 3");
    });

    it("2. Strategy & Budget: 'Anh cho em budget 20 triệu thì em chia thế nào?' allows concrete allocations and forbids [BUDGET] placeholder when value is given", () => {
      expect(SEO_INTERVIEW_SYSTEM_PROMPT).toContain("Budget 20 triệu em chia thế nào?");
      expect(SEO_INTERVIEW_SYSTEM_PROMPT).toContain("Với 20 triệu, em sẽ dành khoảng 5 triệu content");
      expect(SEO_INTERVIEW_SYSTEM_PROMPT).toContain("Do NOT output placeholders like [BUDGET] when budget was given in the question");
    });

    it("3. Diagnostic: 'Site mở bot hai tuần chưa nhận key thì sao?' focuses on diagnosis and next actions", () => {
      expect(SEO_INTERVIEW_SYSTEM_PROMPT).toContain("Site mở bot hai tuần vẫn không nhận key thì em làm sao?");
      expect(SEO_INTERVIEW_SYSTEM_PROMPT).toContain("Answer specifically about diagnosing a site that is not receiving keyword signals");
      expect(SEO_INTERVIEW_SYSTEM_PROMPT).toContain("Do NOT start explaining unrelated Core Update recovery");
    });

    it("4. Decision: 'Domain A DR55 traffic 0, B DR20 có traffic thật. Chọn con nào?' enforces taking a position first", () => {
      expect(SEO_INTERVIEW_SYSTEM_PROMPT).toContain("TAKE A POSITION FIRST");
      expect(SEO_INTERVIEW_SYSTEM_PROMPT).toContain("Case này em nghiêng về domain B");
      expect(SEO_INTERVIEW_SYSTEM_PROMPT).toContain("Do not hide behind: \"Còn tùy nhiều yếu tố.\"");
    });

    it("5. Diagnostic Numbers: 'Impressions giảm 5%, click giảm 40%, position 3.2 xuống 6.8.' enforces reasoning from provided data", () => {
      expect(SEO_INTERVIEW_SYSTEM_PROMPT).toContain("Impression giảm 5%, click giảm 40%, position từ 3.2 xuống 6.8.");
      expect(SEO_INTERVIEW_SYSTEM_PROMPT).toContain("Recognize indexation/demand probably did not collapse, but ranking/CTR deteriorated materially");
      expect(SEO_INTERVIEW_SYSTEM_PROMPT).toContain("Use the actual numbers from the interviewer");
    });

    it("6. Follow-up: 'Tại sao?' requires concise answers using prior context", () => {
      expect(SEO_INTERVIEW_SYSTEM_PROMPT).toContain("Short questions should receive short answers");
      expect(SEO_INTERVIEW_SYSTEM_PROMPT).toContain('"Tại sao?"');
      expect(SEO_INTERVIEW_SYSTEM_PROMPT).toContain("Use the previous question/context if available");
      expect(SEO_INTERVIEW_SYSTEM_PROMPT).toContain("Do not generate another complete SEO strategy");
    });
  });
});
