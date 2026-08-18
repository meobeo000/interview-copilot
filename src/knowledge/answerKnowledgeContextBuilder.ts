import type { CandidateProfile } from "../shared/candidateProfile";
import type { KnowledgeChunk } from "./types";
import type { QuestionIntent, QuestionIntentCategory } from "../question-detector/intentClassifier";
import type { QuestionShape, QuestionShapeResult } from "../question-detector/questionShapeClassifier";
import type { ResolvedFollowUpContext } from "../question-detector/interviewTurnContext";
import type { ScenarioConstraints } from "../question-detector/scenarioConstraints";
import {
  type PractitionerInterviewReference
} from "./practitionerInterviewReference";
import { getPractitionerReferenceRetriever } from "./practitionerReferenceRetriever";

export interface ContextBuilderOptions {
  question: string;
  intent?: QuestionIntent | QuestionIntentCategory | string;
  questionShape?: QuestionShape | QuestionShapeResult;
  candidateProfile?: CandidateProfile;
  retrievedChunks?: KnowledgeChunk[];
  practitionerReferences?: PractitionerInterviewReference[];
  followUpContext?: ResolvedFollowUpContext;
  scenarioConstraints?: ScenarioConstraints;
  entities?: string[];
  numericFacts?: string[];
}

export function buildAnswerKnowledgeContext(options: ContextBuilderOptions): string {
  const { candidateProfile, retrievedChunks = [] } = options;

  const candidateFacts: string[] = [];
  const practitionerLines: string[] = [];
  const generalNotes: string[] = [];

  // 1. Candidate facts from verified profile only (no invented fields)
  if (candidateProfile) {
    if (candidateProfile.background && candidateProfile.background.trim()) {
      candidateFacts.push(`- Background: ${candidateProfile.background.trim()}`);
    }
    if (candidateProfile.strengths && candidateProfile.strengths.length > 0) {
      const filteredStrengths = candidateProfile.strengths.filter(Boolean);
      if (filteredStrengths.length > 0) {
        candidateFacts.push(`- Thế mạnh: ${filteredStrengths.join("; ")}`);
      }
    }
    if (candidateProfile.seoSkills && candidateProfile.seoSkills.length > 0) {
      const filteredSkills = candidateProfile.seoSkills.filter(Boolean);
      const filteredTools = candidateProfile.tools?.filter(Boolean) || [];
      if (filteredSkills.length > 0) {
        const toolsPart = filteredTools.length > 0 ? ` (${filteredTools.join(", ")})` : "";
        candidateFacts.push(`- Kỹ năng SEO & Công cụ: ${filteredSkills.join(", ")}${toolsPart}`);
      }
    }
    if (candidateProfile.projects && candidateProfile.projects.length > 0) {
      candidateProfile.projects.forEach((p) => {
        if (p.name && p.name.trim()) {
          candidateFacts.push(`- Dự án thật: ${p.name.trim()} (${p.role || ""}) - ${p.description || ""} ${p.metrics ? `[${p.metrics}]` : ""}`);
        }
      });
    }
  }

  // 2. Chunks partitioning
  const legacyPractitionerChunks: KnowledgeChunk[] = [];
  for (const chunk of retrievedChunks) {
    if (chunk.sourceType === "candidate_profile") {
      const factLine = `- [Cá nhân] ${chunk.title ? `${chunk.title}: ` : ""}${chunk.content}`;
      if (!candidateFacts.some((f) => f.includes(chunk.content.slice(0, 30)))) {
        candidateFacts.push(factLine);
      }
    } else if (chunk.sourceType === "practitioner_playbook") {
      legacyPractitionerChunks.push(chunk);
    } else if (chunk.sourceType === "general_note") {
      generalNotes.push(`- [Nguyên lý chung]: ${chunk.content}`);
    }
  }

  // 3. Practitioner references (retrieved deterministically if not explicitly passed)
  let practitionerRefs = options.practitionerReferences;
  if (!practitionerRefs && legacyPractitionerChunks.length === 0) {
    const retrieval = getPractitionerReferenceRetriever().retrieve({
      question: options.question,
      intent: options.intent,
      questionShape: options.questionShape,
      entities: options.entities,
      followUpContext: options.followUpContext,
      scenarioConstraints: options.scenarioConstraints,
      numericFacts: options.numericFacts,
      maxReferences: 2
    });
    practitionerRefs = retrieval.references;
  }

  // Build Practitioner Section
  practitionerLines.push("PRACTITIONER PLAYBOOK (Reference Strategy Inspiration - NOT Personal History):");
  practitionerLines.push("- [PRACTITIONER INTERVIEW REFERENCE - GROUNDING INSTRUCTIONS]:");
  practitionerLines.push("  * Guidance is reference pattern only; do NOT copy mechanically or convert examples to universal rules.");
  practitionerLines.push("  * NEVER claim 'Ở dự án UU88 em đã...' unless verified in candidate facts.");

  if (legacyPractitionerChunks.length > 0) {
    for (const chunk of legacyPractitionerChunks) {
      practitionerLines.push(`- [Kinh nghiệm Practitioner - Tham khảo]: ${chunk.title ? `[${chunk.title}] ` : ""}${chunk.content}`);
    }
  }

  if (practitionerRefs && practitionerRefs.length > 0) {
    for (const ref of practitionerRefs) {
      const gSummary = ref.guidance.slice(0, 2).join("; ");
      const exSummary = ref.practitionerExamples?.[0] ? ` [Ví dụ: ${ref.practitionerExamples[0]}]` : "";
      const cautionSummary = ref.cautions?.[0] ? ` [Lưu ý: ${ref.cautions[0]}]` : "";
      practitionerLines.push(`- [Practitioner Reference: ${ref.id}]: ${gSummary}${exSummary}${cautionSummary}`);
    }
  }

  const sections: string[] = [];

  sections.push("[KNOWLEDGE GROUNDING & SAFETY BOUNDARIES]:");

  // SECTION A: VERIFIED CANDIDATE FACTS (Highest Priority)
  sections.push("CANDIDATE PERSONAL FACTS (Factual Grounding - Highest Priority):");
  if (candidateFacts.length > 0) {
    sections.push(candidateFacts.join("\n"));
  } else {
    sections.push("- Không có thông tin cá nhân nào được xác thực (No verified candidate personal facts available).");
  }

  // SECTION B: PRACTITIONER INTERVIEW REFERENCE (Second Priority)
  if (practitionerLines.length > 2) {
    sections.push(practitionerLines.join("\n"));
  }

  // SECTION C: GENERAL SEO PRINCIPLES (Base Priority)
  if (generalNotes.length > 0) {
    sections.push("GENERAL SEO PRINCIPLES:\n" + generalNotes.join("\n"));
  }

  // STRICT GROUNDING RULES
  sections.push(`
STRICT GROUNDING RULES:
1. Candidate facts may be spoken as personal background ("em", "nền tảng của em...").
2. Practitioner playbook notes are reference strategy inspiration ONLY. NEVER claim practitioner projects, results, or numbers as candidate's personal history ("em đã làm dự án X").
3. Always phrase recommendations as prospective strategy: "Với case này em sẽ...", "Em ưu tiên...", "Em sẽ kiểm tra tín hiệu..." rather than fabricated past history.
4. NEVER invent fake project names, budgets, rankings, or years of experience.
`.trim());

  return sections.join("\n\n");
}
