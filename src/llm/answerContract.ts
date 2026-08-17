import type { CandidateProfile } from "../shared/candidateProfile";
import type { QuestionIntent, QuestionIntentCategory } from "../question-detector/intentClassifier";
import type { SemanticEvidenceState } from "../question-detector/semanticEvidence";
import type { KnowledgeChunk } from "../knowledge/types";

export type AnswerContractType =
  | "DIRECT_ALLOCATION"
  | "DIRECT_DECISION"
  | "DIRECT_ACTION_DIAGNOSIS"
  | "DIRECT_TIMING_EXPLANATION"
  | "DIRECT_STRATEGY_WORKFLOW";

export interface AnswerContract {
  intent: QuestionIntentCategory;
  answerType: AnswerContractType;
  requiredFacts: string[];
  requiredEntities: string[];
  preferredStructure: string;
  firstSentenceDirective: string;
  maxWords: number;
  forbiddenBehaviors: string[];
  candidateExperienceAllowed: boolean;
  contractBuildMs: number;
}

export interface BuildAnswerContractOptions {
  question: string;
  intent?: QuestionIntent | QuestionIntentCategory | string;
  semanticEvidence?: SemanticEvidenceState;
  retrievedChunks?: KnowledgeChunk[];
  candidateProfile?: CandidateProfile;
}

const FORBIDDEN_AI_PHRASES = [
  "Dạ với ngân sách...",
  "theo quan điểm của em",
  "nhằm tối ưu hóa",
  "đảm bảo tính bền vững",
  "xây dựng nền tảng vững chắc",
  "tối ưu hiệu quả",
  "yếu tố sống còn",
  "chiến lược toàn diện"
] as const;

/**
 * Builds an explicit question-to-answer contract describing WHAT Gemini must answer.
 * Fast, synchronous, and deterministic (< 5ms).
 */
export function buildAnswerContract(options: BuildAnswerContractOptions): AnswerContract {
  const start = performance.now();
  const { question, intent, semanticEvidence, candidateProfile } = options;

  const intentCategory: QuestionIntentCategory = (
    typeof intent === "string" ? intent : intent?.category || semanticEvidence?.bestIntent || "UNKNOWN"
  ) as QuestionIntentCategory;

  // 1. Extract Required Facts
  const requiredFacts: string[] = [];
  if (semanticEvidence?.moneyAmounts && semanticEvidence.moneyAmounts.length > 0) {
    requiredFacts.push(`budget: ${semanticEvidence.moneyAmounts.join(", ")}`);
  } else if (intentCategory === "BUDGET_ALLOCATION") {
    const moneyMatch = question.match(/(?:^|\s)(\d+(?:\.\d+)?|hai mươi|ba mươi|bốn mươi|năm mươi|mười)\s*(triệu|tr|củ|usd|\$)(?=\s|$|[.,?!])/i);
    if (moneyMatch) {
      requiredFacts.push(`budget: ${moneyMatch[0].trim()}`);
    }
  }

  if (semanticEvidence?.drValues && semanticEvidence.drValues.length > 0) {
    requiredFacts.push(`DR: ${semanticEvidence.drValues.map((d) => `DR ${d}`).join(", ")}`);
  } else {
    const drMatches = question.match(/(?:^|\s)(?:DR|dr)\s*(\d+)/gi);
    if (drMatches) {
      requiredFacts.push(`DR: ${drMatches.map((d) => d.trim()).join(", ")}`);
    }
  }

  if (semanticEvidence?.durations && semanticEvidence.durations.length > 0) {
    requiredFacts.push(`duration: ${semanticEvidence.durations.join(", ")}`);
  }

  if (semanticEvidence?.percentages && semanticEvidence.percentages.length > 0) {
    requiredFacts.push(`metrics: ${semanticEvidence.percentages.map((p) => `${p}%`).join(", ")}`);
  }

  // 2. Extract Required Entities
  const requiredEntities: string[] = [];
  const candidateEntityPool = semanticEvidence?.seoEntities || [];
  for (const ent of candidateEntityPool) {
    if (!requiredEntities.includes(ent)) {
      requiredEntities.push(ent);
    }
  }

  // Fallback entity scan from question text if semanticEvidence wasn't provided
  const qLower = question.toLowerCase();
  const lexiconCheck = [
    { name: "content", matches: ["content", "bài viết", "nội dung"] },
    { name: "Entity", matches: ["entity", "en ti ti", "social trust"] },
    { name: "Guest Post", matches: ["guest post", "guestpost", "gét pót"] },
    { name: "PBN", matches: ["pbn", "vệ tinh", "site vệ tinh"] },
    { name: "backlink", matches: ["backlink", "back link", "link nền"] },
    { name: "internal link", matches: ["internal link", "internal links", "silo"] },
    { name: "anchor text", matches: ["anchor text", "anchor", "an co"] },
    { name: "GSC", matches: ["gsc", "search console"] },
    { name: "GA4", matches: ["ga4", "analytics"] },
    { name: "Ahrefs", matches: ["ahrefs", "a href"] },
    { name: "301", matches: ["301", "redirect"] },
    { name: "expired domain", matches: ["expired domain", "domain cũ", "tên miền cũ"] }
  ];

  for (const item of lexiconCheck) {
    if (!requiredEntities.includes(item.name) && item.matches.some((m) => qLower.includes(m))) {
      requiredEntities.push(item.name);
    }
  }

  // 3. Candidate Experience Safety Check
  const candidateExperienceAllowed = Boolean(
    candidateProfile?.projects && candidateProfile.projects.length > 0
  );

  // 4. Shape-specific Directives
  let answerType: AnswerContractType = "DIRECT_STRATEGY_WORKFLOW";
  let firstSentenceDirective = "Sentence 1 MUST directly state your stance or initial response to the interviewer without fluff.";
  let preferredStructure = "Sentence 1: Direct answer. Sentence 2-3: Practical reasoning with SEO terms. Sentence 4: Signal-based condition.";
  let maxWords = 110;

  switch (intentCategory) {
    case "BUDGET_ALLOCATION":
      answerType = "DIRECT_ALLOCATION";
      firstSentenceDirective = `Sentence 1 MUST state the direct monetary or percentage allocation for the total budget (${requiredFacts.find((f) => f.startsWith("budget")) || "total budget"}) across the requested categories (${requiredEntities.join(", ") || "Content, Entity, Guest Post, PBN"}). Example style: "Với 20 triệu thì em sẽ chia khoảng 5-6 triệu cho Content, 3 triệu Entity và backlink nền, 5 triệu Guest Post, phần còn lại giữ cho PBN."`;
      preferredStructure = "Sentence 1: Direct numerical allocation across requested categories. Sentence 2-3: Practical reasoning for each allocation (e.g. why build on-page/Entity first, why delay PBN). Sentence 4: Signal-based conditional adjustment (e.g. when to increase Guest Post/PBN based on GSC impression/keyword indexing).";
      maxWords = 120;
      break;

    case "DOMAIN_SELECTION":
      answerType = "DIRECT_DECISION";
      firstSentenceDirective = `Sentence 1 MUST state your choice immediately without hesitation (e.g. "Em chọn domain B." or "Em nghiêng về domain B.").`;
      preferredStructure = "Sentence 1: Explicit choice. Sentence 2-3: Strongest practical reasons (clean history, organic traffic signal > vanity DR). Sentence 4: Required verification steps before buying (Wayback, anchor text, referring domains).";
      maxWords = 100;
      break;

    case "NO_KEYWORD_SIGNAL":
      answerType = "DIRECT_ACTION_DIAGNOSIS";
      firstSentenceDirective = `Sentence 1 MUST state the immediate diagnostic action and caution (e.g. "Em chưa đi thêm link ngay, em check lại indexing, on-page và internal link trước.").`;
      preferredStructure = "Sentence 1: Immediate action/caution. Sentence 2: First check (GSC URL inspection, crawl/index status). Sentence 3: Second check (Search intent, title, sapo, internal link cluster). Sentence 4: Signal to trigger off-page links.";
      maxWords = 110;
      break;

    case "PBN_TIMING":
      answerType = "DIRECT_TIMING_EXPLANATION";
      firstSentenceDirective = `Sentence 1 MUST clarify that timing is signal-dependent, not an arbitrary fixed calendar rule (e.g. "Ngày 10 không phải mốc cố định, em chờ site có tín hiệu index và impression trước khi đi PBN.").`;
      preferredStructure = "Sentence 1: Signal-based principle. Sentence 2-3: Why wait for index/impression signal before PBN (isolates site vs link issues). Sentence 4: What to do if no signal.";
      maxWords = 100;
      break;

    case "NEGATIVE_SEO":
      answerType = "DIRECT_DECISION";
      firstSentenceDirective = `Sentence 1 MUST state whether to disavow immediately or observe (e.g. "Em chưa disavow ngay, em kiểm tra xem link spam đã index và ảnh hưởng ranking chưa.").`;
      preferredStructure = "Sentence 1: Direct decision (don't panic disavow). Sentence 2-3: Immediate checks (Ahrefs spike, GSC manual action, ranking drop). Sentence 4: Disavow and link cleanup condition.";
      maxWords = 100;
      break;

    case "GSC_RANKING_DROP":
    case "ONPAGE_DIAGNOSIS":
      answerType = "DIRECT_ACTION_DIAGNOSIS";
      firstSentenceDirective = "Sentence 1 MUST state the first technical checkpoint in GSC/Ahrefs.";
      preferredStructure = "Sentence 1: First check. Sentence 2-3: Technical diagnostic steps. Sentence 4: Remediation plan.";
      maxWords = 110;
      break;

    default:
      answerType = "DIRECT_STRATEGY_WORKFLOW";
      firstSentenceDirective = "Sentence 1 MUST give a direct spoken response addressing the interview question.";
      preferredStructure = "Sentence 1: Direct stance. Sentence 2-3: Hands-on workflow steps. Sentence 4: Signal-based condition.";
      maxWords = 110;
      break;
  }

  const forbiddenBehaviors = [
    `Do NOT use generic filler phrases: ${FORBIDDEN_AI_PHRASES.map((p) => `"${p}"`).join(", ")}`,
    "Do NOT write an article, essay, or academic definition. Generate natural spoken Vietnamese for an interview.",
    "Do NOT invent candidate personal experience. If candidate profile does not claim personal history for a project/technique, use 'Với case này em sẽ...' instead of 'Em đã từng làm ở project...'.",
    requiredEntities.length > 0
      ? `Do NOT ignore or replace requested entities. You MUST cover: ${requiredEntities.join(", ")}.`
      : "Do NOT drift into unrelated SEO topics."
  ];

  const contractBuildMs = Math.round((performance.now() - start) * 100) / 100;

  return {
    intent: intentCategory,
    answerType,
    requiredFacts,
    requiredEntities,
    preferredStructure,
    firstSentenceDirective,
    maxWords,
    forbiddenBehaviors,
    candidateExperienceAllowed,
    contractBuildMs
  };
}

/**
 * Checks whether a provisional AnswerContract (from speculative prewarm)
 * remains compatible with the final committed AnswerContract.
 */
export function isContractCompatible(
  provisional: AnswerContract | undefined,
  finalContract: AnswerContract
): { compatible: boolean; reason: string } {
  if (!provisional) {
    return { compatible: false, reason: "No provisional contract exists." };
  }

  // 1. Intent Compatibility
  if (provisional.intent !== finalContract.intent) {
    return {
      compatible: false,
      reason: `Intent shifted from ${provisional.intent} to ${finalContract.intent}.`
    };
  }

  // 2. Required Facts Compatibility
  const provFacts = provisional.requiredFacts.join(" | ");
  const finalFacts = finalContract.requiredFacts.join(" | ");
  if (provFacts && finalFacts && provFacts !== finalFacts) {
    return {
      compatible: false,
      reason: `Required facts changed from "${provFacts}" to "${finalFacts}".`
    };
  }

  // 3. Entity Coverage Compatibility
  // If final question added >= 3 new required entities that were not in provisional prewarm, replace stream
  const missingInProvisional = finalContract.requiredEntities.filter(
    (e) => !provisional.requiredEntities.includes(e)
  );

  if (missingInProvisional.length >= 3) {
    return {
      compatible: false,
      reason: `Final question materially expanded with new entities: ${missingInProvisional.join(", ")}.`
    };
  }

  return {
    compatible: true,
    reason: "Provisional contract is compatible with final committed contract."
  };
}

/**
 * Formats the AnswerContract into prompt context directives for Gemini.
 */
export function formatContractForPrompt(contract: AnswerContract): string {
  const lines: string[] = [
    "[INTERVIEW QUESTION CONTRACT & DIRECT RESPONSE DIRECTIVES]:",
    `- Answer Type: ${contract.answerType}`,
    `- First Sentence Directive: ${contract.firstSentenceDirective}`,
    `- Preferred Structure: ${contract.preferredStructure}`,
    `- Max Length: ~${contract.maxWords} Vietnamese words (STRICTLY concise, speakable in 15-20 seconds).`
  ];

  if (contract.requiredFacts.length > 0) {
    lines.push(`- Required Numeric Facts: ${contract.requiredFacts.join("; ")}`);
  }

  if (contract.requiredEntities.length > 0) {
    lines.push(`- Required SEO Entities to Cover: ${contract.requiredEntities.join(", ")}`);
  }

  lines.push("- Forbidden Behaviors:");
  for (const fb of contract.forbiddenBehaviors) {
    lines.push(`  * ${fb}`);
  }

  return lines.join("\n");
}
