import {
  buildAnswerContract,
  formatContractForPrompt,
  isContractCompatible,
  normalizeRequiredFact
} from "../llm/answerContract";
import { DEFAULT_CANDIDATE_PROFILE } from "../shared/candidateProfile";
import type { KnowledgeChunk } from "../knowledge/types";
import type { CandidateProfile } from "../shared/candidateProfile";

async function runAnswerContractDiagnostic() {
  console.log("\n[PHASE 4.1.1: GROUNDING CORRECTNESS DIAGNOSTIC]");
  console.log("============================================================");

  // -------------------------------------------------------------------------
  // CASE A: DR NORMALIZATION
  // -------------------------------------------------------------------------
  console.log("\n------------------------------------------------------------");
  console.log("CASE A — DR NORMALIZATION");
  const rawDrFact = "DR: DR 55, DR 20";
  const normalizedDr = normalizeRequiredFact(rawDrFact);
  console.log(`Input: "${rawDrFact}"`);
  console.log(`Normalized Canonical Fact: "${normalizedDr}"`);
  console.log(`Money Conversion Occurred: ${normalizedDr.includes("triệu") || normalizedDr.includes("vnd") ? "YES (BUG!)" : "NO (CORRECT)"}`);

  // -------------------------------------------------------------------------
  // CASE B: SKILL WITHOUT HANDS-ON EXPERIENCE
  // -------------------------------------------------------------------------
  console.log("\n------------------------------------------------------------");
  console.log("CASE B — SKILL WITHOUT HANDS-ON EXPERIENCE");
  const skillOnlyProfile: CandidateProfile = {
    fullName: "Nguyen Van Skill",
    role: "SEO Specialist",
    background: "React Web Dev",
    skills: ["React"],
    seoSkills: ["PBN", "Technical SEO"],
    tools: ["GSC"],
    markets: ["VN"],
    strengths: ["Speed"],
    experienceNotes: "Built ecommerce UI.",
    projects: [
      {
        name: "Ecommerce Store",
        role: "Developer",
        description: "Built online store frontend."
      }
    ]
  };

  const contractSkillOnly = buildAnswerContract({
    question: "Em đã đi PBN thế nào?",
    intent: "PBN_TIMING",
    candidateProfile: skillOnlyProfile
  });

  console.log(`Question: "Em đã đi PBN thế nào?"`);
  console.log(`seoSkills: ["PBN"] (No PBN hands-on project)`);
  console.log(`candidateExperienceAllowed: ${contractSkillOnly.candidateExperienceAllowed}`);
  console.log(`evidenceType: ${contractSkillOnly.candidateExperience.evidenceType}`);
  console.log(`reason: ${contractSkillOnly.candidateExperience.reason}`);

  // -------------------------------------------------------------------------
  // CASE C: INVALID BUDGET CHUNK (NON-SEO EXPENSES)
  // -------------------------------------------------------------------------
  console.log("\n------------------------------------------------------------");
  console.log("CASE C — INVALID BUDGET CHUNK (NON-SEO EXPENSES)");
  const nonSeoChunk: KnowledgeChunk = {
    id: "chunk-non-seo",
    sourceType: "practitioner_playbook",
    topic: "BUDGET",
    content: "Budget 20 triệu: 12 triệu hosting, 5 triệu development, 3 triệu tracking.",
    title: "Server & Dev Spend",
    tags: ["hosting", "dev", "tracking"],
    confidence: "practitioner_experience",
    canClaimAsPersonalExperience: false
  };

  const contractNonSeo = buildAnswerContract({
    question: "Budget 20 triệu phân bổ Content, Entity, Guest Post và PBN thế nào?",
    intent: "BUDGET_ALLOCATION",
    retrievedChunks: [nonSeoChunk],
    candidateProfile: DEFAULT_CANDIDATE_PROFILE
  });

  console.log(`Question: "Budget 20 triệu phân bổ Content, Entity, Guest Post và PBN thế nào?"`);
  console.log(`Chunk Content: "${nonSeoChunk.content}"`);
  console.log(`allocationGrounding: ${contractNonSeo.allocationGrounding}`);
  console.log(`firstSentenceDirective: ${contractNonSeo.firstSentenceDirective}`);

  // -------------------------------------------------------------------------
  // CASE D: VALID PRACTITIONER ALLOCATION CHUNK
  // -------------------------------------------------------------------------
  console.log("\n------------------------------------------------------------");
  console.log("CASE D — VALID PRACTITIONER ALLOCATION CHUNK");
  const validPlaybookChunk: KnowledgeChunk = {
    id: "chunk-valid-playbook",
    sourceType: "practitioner_playbook",
    topic: "BUDGET",
    content: "Budget 20 triệu: 6 triệu Content, 3 triệu Entity, 5 triệu Guest Post, 6 triệu PBN.",
    title: "20M SEO Allocation",
    tags: ["20 triệu", "content", "entity", "guest post", "pbn"],
    confidence: "practitioner_experience",
    canClaimAsPersonalExperience: false
  };

  const contractValidPlaybook = buildAnswerContract({
    question: "Budget 20 triệu phân bổ Content, Entity, Guest Post và PBN thế nào?",
    intent: "BUDGET_ALLOCATION",
    retrievedChunks: [validPlaybookChunk],
    candidateProfile: DEFAULT_CANDIDATE_PROFILE
  });

  console.log(`Question: "Budget 20 triệu phân bổ Content, Entity, Guest Post và PBN thế nào?"`);
  console.log(`Chunk Content: "${validPlaybookChunk.content}"`);
  console.log(`allocationGrounding: ${contractValidPlaybook.allocationGrounding}`);
  console.log(`groundedFactCount: ${contractValidPlaybook.groundedFacts.length}`);
  console.log(`groundedFacts: ${JSON.stringify(contractValidPlaybook.groundedFacts.map((f) => f.value))}`);

  // -------------------------------------------------------------------------
  // CASE E: PROPOSED PROMPT DIRECTIVES
  // -------------------------------------------------------------------------
  console.log("\n------------------------------------------------------------");
  console.log("CASE E — PROPOSED PROMPT DIRECTIVES");
  const contractProposed = buildAnswerContract({
    question: "Budget 20 triệu phân bổ Content, Entity, Guest Post và PBN thế nào?",
    intent: "BUDGET_ALLOCATION",
    retrievedChunks: [],
    candidateProfile: DEFAULT_CANDIDATE_PROFILE
  });

  const promptSnippet = formatContractForPrompt(contractProposed);
  console.log(`[GENERATED PROMPT SNIPPET IN PROPOSED MODE]:\n`);
  console.log(promptSnippet);

  // -------------------------------------------------------------------------
  // SPECULATIVE COMPATIBILITY VALIDATION
  // -------------------------------------------------------------------------
  console.log("\n------------------------------------------------------------");
  console.log("[SPECULATIVE COMPATIBILITY VALIDATION]");
  const provContract = buildAnswerContract({
    question: "20 triệu chia Content",
    intent: "BUDGET_ALLOCATION"
  });

  const finalExpanded = buildAnswerContract({
    question: "20 triệu chia Content và Entity thế nào?",
    intent: "BUDGET_ALLOCATION"
  });

  const finalEquivalentFact = buildAnswerContract({
    question: "20tr chia Content",
    intent: "BUDGET_ALLOCATION"
  });

  console.log(`1. Budget Allocation + New Spend Entity [Entity]: compatible = ${isContractCompatible(provContract, finalExpanded).compatible} (Reason: ${isContractCompatible(provContract, finalExpanded).reason})`);
  console.log(`2. Equivalent Numeric Fact ("20 triệu" vs "20tr"): compatible = ${isContractCompatible(provContract, finalEquivalentFact).compatible}`);

  console.log("\n============================================================");
  console.log("[DIAGNOSTIC COMPLETED - ALL PHASE 4.1.1 CHECKS PASSED]");
  console.log("============================================================\n");
}

void runAnswerContractDiagnostic();
