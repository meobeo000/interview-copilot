import { describe, expect, it } from "vitest";
import { buildAnswerKnowledgeContext } from "./answerKnowledgeContextBuilder";
import type { CandidateProfile } from "../shared/candidateProfile";
import { validateAndEnforceSafety } from "./types";

describe("AnswerKnowledgeContextBuilder & Anti-Fabrication Safeguards", () => {
  const mockCandidateProfile: CandidateProfile = {
    fullName: "Nguyễn Văn A",
    role: "SEO Specialist",
    background: "Nền tảng Web Development vững chắc, nắm sâu kiến trúc website và technical debugging.",
    skills: ["Web Development", "Performance Optimization"],
    seoSkills: ["Technical SEO", "On-page Optimization", "Search Intent"],
    tools: ["Google Search Console", "Ahrefs"],
    projects: [], // No fake projects!
    markets: ["Việt Nam"],
    strengths: ["Tư duy kỹ thuật web", "Debug lỗi crawl/indexing"],
    experienceNotes: "Học hỏi thực chiến iGaming."
  };

  const mockRetrievedChunks = [
    validateAndEnforceSafety({
      id: "practitioner:budget:20m-workflow",
      sourceType: "practitioner_playbook",
      topic: "BUDGET",
      title: "Case Study UU88 Budget 20 Triệu",
      content: "Ở project UU88 budget đầu khoảng 20 triệu chia Entity và Web 2.0.",
      tags: ["budget", "uu88"]
    }),
    validateAndEnforceSafety({
      id: "candidate:profile:background",
      sourceType: "candidate_profile",
      topic: "TECHNICAL_SEO",
      title: "Nền tảng Web Dev",
      content: "Ứng viên có nền tảng Web Development vững chắc.",
      tags: ["web-dev"]
    })
  ];

  it("builds context clearly separating Candidate Personal Facts from Practitioner Playbook", () => {
    const context = buildAnswerKnowledgeContext({
      question: "Budget 20 triệu chia thế nào cho site mới?",
      intent: "BUDGET_ALLOCATION",
      candidateProfile: mockCandidateProfile,
      retrievedChunks: mockRetrievedChunks
    });

    expect(context).toContain("CANDIDATE PERSONAL FACTS");
    expect(context).toContain("PRACTITIONER PLAYBOOK (Reference Strategy Inspiration - NOT Personal History)");
    expect(context).toContain("STRICT GROUNDING RULES");

    // Candidate facts contain real web dev background
    expect(context).toContain("Nền tảng Web Development");

    // Practitioner playbook contains UU88 note marked as reference only
    expect(context).toContain("[Kinh nghiệm Practitioner - Tham khảo]");
    expect(context).toContain("UU88");
  });

  it("STRICT SAFETY: explicitly instructs Gemini NEVER to claim practitioner projects (e.g. UU88) as candidate history", () => {
    const context = buildAnswerKnowledgeContext({
      question: "Dự án gần nhất em làm là gì?",
      intent: "PROJECT_EXPERIENCE",
      candidateProfile: mockCandidateProfile,
      retrievedChunks: mockRetrievedChunks
    });

    expect(context).toContain("NEVER claim practitioner projects, results, or numbers as candidate's personal history");
    expect(context).toContain('prospective strategy: "Với case này em sẽ..."');
    expect(context).toContain("NEVER invent fake project names");
  });

  it("produces compact context suitable for real-time low-latency LLM inference", () => {
    const context = buildAnswerKnowledgeContext({
      question: "Site mở bot 2 tuần chưa nhận key",
      intent: "NO_KEYWORD_SIGNAL",
      candidateProfile: mockCandidateProfile,
      retrievedChunks: mockRetrievedChunks
    });

    const wordCount = context.split(/\s+/).filter(Boolean).length;
    expect(wordCount).toBeLessThan(350);
  });
});
