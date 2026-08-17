import type { CandidateProfile } from "../shared/candidateProfile";
import type { KnowledgeChunk } from "./types";
import type { QuestionIntent } from "../question-detector/intentClassifier";

export interface ContextBuilderOptions {
  question: string;
  intent?: QuestionIntent | string;
  candidateProfile?: CandidateProfile;
  retrievedChunks: KnowledgeChunk[];
}

export function buildAnswerKnowledgeContext(options: ContextBuilderOptions): string {
  const { candidateProfile, retrievedChunks } = options;

  const candidateFacts: string[] = [];
  const practitionerInsights: string[] = [];
  const generalNotes: string[] = [];

  // 1. Candidate facts from profile
  if (candidateProfile) {
    if (candidateProfile.background) {
      candidateFacts.push(`- Background: ${candidateProfile.background}`);
    }
    if (candidateProfile.strengths && candidateProfile.strengths.length > 0) {
      candidateFacts.push(`- Thế mạnh: ${candidateProfile.strengths.join("; ")}`);
    }
    if (candidateProfile.seoSkills && candidateProfile.seoSkills.length > 0) {
      candidateFacts.push(`- Kỹ năng SEO & Công cụ: ${candidateProfile.seoSkills.join(", ")} (${candidateProfile.tools.join(", ")})`);
    }
    if (candidateProfile.projects && candidateProfile.projects.length > 0) {
      candidateProfile.projects.forEach((p) => {
        if (p.name) {
          candidateFacts.push(`- Dự án thật: ${p.name} (${p.role || ""}) - ${p.description || ""} ${p.metrics ? `[${p.metrics}]` : ""}`);
        }
      });
    }
  }

  // 2. Chunks partitioning
  for (const chunk of retrievedChunks) {
    if (chunk.sourceType === "candidate_profile") {
      const factLine = `- [Cá nhân] ${chunk.title ? `${chunk.title}: ` : ""}${chunk.content}`;
      if (!candidateFacts.some((f) => f.includes(chunk.content.slice(0, 30)))) {
        candidateFacts.push(factLine);
      }
    } else if (chunk.sourceType === "practitioner_playbook") {
      practitionerInsights.push(
        `- [Kinh nghiệm Practitioner - Tham khảo]: ${chunk.title ? `[${chunk.title}] ` : ""}${chunk.content}`
      );
    } else {
      generalNotes.push(`- [Nguyên lý chung]: ${chunk.content}`);
    }
  }

  const sections: string[] = [];

  sections.push("[KNOWLEDGE GROUNDING & SAFETY BOUNDARIES]:");

  if (candidateFacts.length > 0) {
    sections.push("CANDIDATE PERSONAL FACTS (Factual Grounding):\n" + candidateFacts.join("\n"));
  } else {
    sections.push("CANDIDATE PERSONAL FACTS:\n- Ứng viên có nền tảng Web Development vững chắc, tư duy Technical SEO tốt, đang học hỏi & tích lũy thực chiến SEO iGaming.");
  }

  if (practitionerInsights.length > 0) {
    sections.push("PRACTITIONER PLAYBOOK (Reference Strategy Inspiration - NOT Personal History):\n" + practitionerInsights.join("\n"));
  }

  if (generalNotes.length > 0) {
    sections.push("GENERAL SEO PRINCIPLES:\n" + generalNotes.join("\n"));
  }

  sections.push(`
STRICT GROUNDING RULES:
1. Candidate facts may be spoken as personal background ("em", "nền tảng của em...").
2. Practitioner playbook notes are reference strategy inspiration ONLY. NEVER claim practitioner projects, results, or numbers as candidate's personal history ("em đã làm dự án X").
3. Always phrase recommendations as prospective strategy: "Với case này em sẽ...", "Em ưu tiên...", "Em sẽ kiểm tra tín hiệu..." rather than fabricated past history.
4. NEVER invent fake project names, budgets, rankings, or years of experience.
`.trim());

  return sections.join("\n\n");
}
