import type { CandidateProfile } from "../shared/candidateProfile";
import type { QuestionIntent, QuestionIntentCategory } from "../question-detector/intentClassifier";
import type { SemanticEvidenceState } from "../question-detector/semanticEvidence";
import type { KnowledgeChunk, KnowledgeSourceType } from "../knowledge/types";

export type AnswerContractType =
  | "DIRECT_ALLOCATION"
  | "DIRECT_DECISION"
  | "DIRECT_ACTION_DIAGNOSIS"
  | "DIRECT_TIMING_EXPLANATION"
  | "DIRECT_STRATEGY_WORKFLOW";

export type AllocationGrounding = "EXACT_SOURCE" | "PRACTITIONER_EXAMPLE" | "PROPOSED";

export interface CandidateExperienceEvidence {
  allowed: boolean;
  supportedTopics: string[];
  supportingProjectIds: string[];
  reason: string;
}

export interface GroundedContractFact {
  value: string;
  sourceType: KnowledgeSourceType;
  sourceId: string;
  topic?: string;
  confidence: number;
}

export interface AnswerContract {
  intent: QuestionIntentCategory;
  answerType: AnswerContractType;
  requiredFacts: string[];
  requiredEntities: string[];
  preferredStructure: string;
  firstSentenceDirective: string;
  maxWords: number;
  forbiddenBehaviors: string[];
  candidateExperience: CandidateExperienceEvidence;
  candidateExperienceAllowed: boolean; // Preserved for backward compatibility
  groundedFacts: GroundedContractFact[];
  allocationGrounding?: AllocationGrounding;
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
 * Normalizes monetary and numeric expressions to canonical comparable tokens.
 * E.g. "20 triệu", "20tr", "20 củ", "20m", "hai mươi triệu" -> "20 triệu"
 */
export function normalizeNumericFact(fact: string): string {
  const lower = fact.toLowerCase().trim();
  const moneyMatch = lower.match(/(?:budget:\s*)?(\d+(?:\.\d+)?|hai mươi|ba mươi|bốn mươi|năm mươi|mười)\s*(triệu|tr|củ|m|usd|\$)?/i);
  if (moneyMatch) {
    let num = moneyMatch[1];
    if (num === "hai mươi") num = "20";
    else if (num === "ba mươi") num = "30";
    else if (num === "bốn mươi") num = "40";
    else if (num === "năm mươi") num = "50";
    else if (num === "mười") num = "10";
    return `${num} triệu`;
  }
  return lower;
}

/**
 * Evaluates candidate profile to determine whether first-person claims
 * are permitted for the specific techniques/topics in the question.
 */
export function evaluateCandidateExperience(
  question: string,
  intentCategory: QuestionIntentCategory,
  profile?: CandidateProfile
): CandidateExperienceEvidence {
  if (!profile || !profile.projects || profile.projects.length === 0) {
    return {
      allowed: false,
      supportedTopics: [],
      supportingProjectIds: [],
      reason: "No candidate projects found in profile."
    };
  }

  const qLower = question.toLowerCase();

  // Define technique/topic keywords that require strict project backing
  const techniqueKeywords: Record<string, string[]> = {
    PBN: ["pbn", "vệ tinh", "site vệ tinh", "satellite site"],
    "Guest Post": ["guest post", "guestpost", "gét pót"],
    "expired domain": ["expired domain", "domain cũ", "tên miền cũ", "301 redirect"],
    "301 migration": ["301", "redirect 301", "chuyển hướng domain"],
    "iGaming SEO": ["igaming", "casino", "sports betting", "cá cược", "nhà cái", "uu88"],
    "budget allocation": ["ngân sách", "budget", "20 triệu", "50 triệu", "phân bổ vốn"],
    "negative SEO": ["negative seo", "link bẩn", "disavow", "bắn link spam"],
    "Core Update recovery": ["core update", "tụt traffic", "recovery", "thuật toán"]
  };

  // Identify which topics the question is asking about
  const targetedTopics: string[] = [];
  for (const [topic, triggers] of Object.entries(techniqueKeywords)) {
    if (triggers.some((tr) => qLower.includes(tr))) {
      targetedTopics.push(topic);
    }
  }

  // If question is a generic SEO question without special high-risk technique claims
  if (targetedTopics.length === 0) {
    return {
      allowed: true,
      supportedTopics: ["General SEO"],
      supportingProjectIds: profile.projects.map((p) => p.name),
      reason: "General SEO background supported by candidate profile."
    };
  }

  // Check candidate projects & experience notes for explicit coverage of targeted topics
  const supportedTopics: string[] = [];
  const supportingProjectIds: string[] = [];

  const combinedCandidateCorpus = [
    ...profile.projects.map((p) => `${p.name} ${p.role || ""} ${p.description || ""} ${p.metrics || ""}`),
    profile.experienceNotes || "",
    ...(profile.seoSkills || [])
  ]
    .join(" ")
    .toLowerCase();

  for (const topic of targetedTopics) {
    const triggers = techniqueKeywords[topic];
    const isSupported = triggers.some((tr) => combinedCandidateCorpus.includes(tr));
    if (isSupported) {
      supportedTopics.push(topic);
      for (const p of profile.projects) {
        const pText = `${p.name} ${p.description || ""}`.toLowerCase();
        if (triggers.some((tr) => pText.includes(tr))) {
          supportingProjectIds.push(p.name);
        }
      }
    }
  }

  // All targeted topics must be supported for first-person experience claims
  const allSupported = targetedTopics.every((t) => supportedTopics.includes(t));

  return {
    allowed: allSupported && supportedTopics.length > 0,
    supportedTopics,
    supportingProjectIds: Array.from(new Set(supportingProjectIds)),
    reason: allSupported
      ? `Candidate profile explicitly supports: ${supportedTopics.join(", ")}`
      : `Candidate profile lacks project evidence for: ${targetedTopics.filter((t) => !supportedTopics.includes(t)).join(", ")}`
  };
}

/**
 * Extracts compact grounded facts from retrieved knowledge chunks.
 * Fast, synchronous, in-memory (< 2ms).
 */
export function extractGroundedContractFacts(
  retrievedChunks: KnowledgeChunk[] = [],
  question: string
): GroundedContractFact[] {
  const facts: GroundedContractFact[] = [];
  const qLower = question.toLowerCase();

  for (const chunk of retrievedChunks) {
    const content = chunk.content;
    const contentLower = content.toLowerCase();

    // 1. Budget breakdown facts (e.g. 6m Content, 20 triệu, 50 củ)
    if (
      contentLower.includes("triệu") ||
      contentLower.includes("budget") ||
      contentLower.includes("ngân sách") ||
      contentLower.includes(" 6m") ||
      contentLower.includes(" 5m") ||
      contentLower.includes(" 3m") ||
      contentLower.includes(" 4m")
    ) {
      const budgetLines = content.split("\n").filter((l) => l.trim().length > 0);
      if (budgetLines.length > 0) {
        facts.push({
          value: budgetLines.slice(0, 3).join("; "),
          sourceType: chunk.sourceType,
          sourceId: chunk.id,
          topic: chunk.topic,
          confidence: 0.95
        });
        continue;
      }
    }

    // 2. Timing facts (e.g. Day 10-14 PBN, ngày 10, tuần 2)
    if (
      qLower.includes("ngày") ||
      qLower.includes("tuần") ||
      qLower.includes("day") ||
      contentLower.includes("ngày") ||
      contentLower.includes("tuần") ||
      contentLower.includes("day") ||
      contentLower.includes("pbn") ||
      contentLower.includes("uu88")
    ) {
      const timingMatches = content.match(/(?:ngày|tuần|khoảng|day)\s*\d+[\s\w,.-]{0,50}(?:pbn|index|bot|link|site)?/gi);
      if (timingMatches && timingMatches.length > 0) {
        for (const tm of timingMatches.slice(0, 2)) {
          facts.push({
            value: tm.trim(),
            sourceType: chunk.sourceType,
            sourceId: chunk.id,
            topic: chunk.topic,
            confidence: 0.9
          });
        }
        continue;
      }
    }

    // 3. Domain selection / General SEO facts
    const firstLine = content.split("\n").find((l) => l.trim().length > 0) || content.slice(0, 100);
    facts.push({
      value: firstLine.trim(),
      sourceType: chunk.sourceType,
      sourceId: chunk.id,
      topic: chunk.topic,
      confidence: 0.9
    });
  }

  return facts;
}

/**
 * Builds an explicit question-to-answer contract describing WHAT Gemini must answer.
 * Fast, synchronous, and deterministic (< 5ms).
 */
export function buildAnswerContract(options: BuildAnswerContractOptions): AnswerContract {
  const start = performance.now();
  const { question, intent, semanticEvidence, retrievedChunks = [], candidateProfile } = options;

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

  // Fallback entity scan from question text
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

  // 3. Candidate Experience Safety & Grounded Fact Extraction
  const candidateExperience = evaluateCandidateExperience(question, intentCategory, candidateProfile);
  const groundedFacts = extractGroundedContractFacts(retrievedChunks, question);

  // Determine Allocation Grounding Mode
  let allocationGrounding: AllocationGrounding | undefined;
  if (intentCategory === "BUDGET_ALLOCATION") {
    const hasCandidateBudgetExp = candidateExperience.allowed && candidateExperience.supportedTopics.includes("budget allocation");
    const hasPractitionerBudgetChunk = groundedFacts.some(
      (f) => f.sourceType === "practitioner_playbook" && (f.value.includes("triệu") || f.value.includes("Content"))
    );

    if (hasCandidateBudgetExp) {
      allocationGrounding = "EXACT_SOURCE";
    } else if (hasPractitionerBudgetChunk) {
      allocationGrounding = "PRACTITIONER_EXAMPLE";
    } else {
      allocationGrounding = "PROPOSED";
    }
  }

  // 4. Shape-specific Directives (Clean of global hard-coded numbers)
  let answerType: AnswerContractType = "DIRECT_STRATEGY_WORKFLOW";
  let firstSentenceDirective = "Sentence 1 MUST directly state your stance or initial response to the interviewer without fluff.";
  let preferredStructure = "Sentence 1: Direct answer. Sentence 2-3: Practical reasoning with SEO terms. Sentence 4: Signal-based condition.";
  let maxWords = 110;

  switch (intentCategory) {
    case "BUDGET_ALLOCATION":
      answerType = "DIRECT_ALLOCATION";
      if (allocationGrounding === "PRACTITIONER_EXAMPLE") {
        firstSentenceDirective = `Sentence 1 MUST give a concrete allocation across the requested categories (${requiredEntities.join(", ") || "Content, Entity, Guest Post, PBN"}) for the total budget (${requiredFacts.find((f) => f.startsWith("budget")) || "total budget"}), grounded in the practitioner playbook reference.`;
      } else if (allocationGrounding === "EXACT_SOURCE") {
        firstSentenceDirective = `Sentence 1 MUST state the exact allocation from candidate experience across the requested categories (${requiredEntities.join(", ") || "Content, Entity, Guest Post, PBN"}).`;
      } else {
        firstSentenceDirective = `Sentence 1 MUST give a concrete proposed allocation across the requested categories (${requiredEntities.join(", ") || "Content, Entity, Guest Post, PBN"}). Present numbers as a reasonable strategy proposal (e.g. "Với 20 triệu thì em có thể chia khoảng..."), not as an ungrounded historical fact.`;
      }
      preferredStructure = "Sentence 1: Concrete numerical breakdown across requested categories. Sentence 2-3: Strategy reason for each allocation (foundation/on-page first, link timing). Sentence 4: Signal-based conditional adjustment based on GSC indexing/impressions.";
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
    candidateExperience.allowed
      ? `Candidate has verified project experience in: ${candidateExperience.supportedTopics.join(", ")}. First-person framing is permitted for these topics.`
      : `Do NOT claim personal candidate experience (Do NOT say 'Em đã từng...', 'Ở project trước em...'). Candidate profile lacks project evidence. Use hypothetical practitioner framing ('Với case này em sẽ...', 'Hướng xử lý của em là...').`,
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
    candidateExperience,
    candidateExperienceAllowed: candidateExperience.allowed,
    groundedFacts,
    allocationGrounding,
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

  // 2. Normalized Required Facts Compatibility
  const provNormalizedFacts = provisional.requiredFacts.map(normalizeNumericFact).sort().join(" | ");
  const finalNormalizedFacts = finalContract.requiredFacts.map(normalizeNumericFact).sort().join(" | ");
  if (provNormalizedFacts && finalNormalizedFacts && provNormalizedFacts !== finalNormalizedFacts) {
    return {
      compatible: false,
      reason: `Material numeric fact change from "${provNormalizedFacts}" to "${finalNormalizedFacts}".`
    };
  }

  // 3. Strict Allocation Compatibility Rule
  // For DIRECT_ALLOCATION, adding ANY new spend entity invalidates the provisional monetary split
  if (finalContract.answerType === "DIRECT_ALLOCATION") {
    const missingSpendEntities = finalContract.requiredEntities.filter(
      (e) => !provisional.requiredEntities.includes(e)
    );
    if (missingSpendEntities.length > 0) {
      return {
        compatible: false,
        reason: `DIRECT_ALLOCATION requires fresh stream when spend categories expand: missing [${missingSpendEntities.join(", ")}].`
      };
    }
  }

  // 4. Non-allocation Entity Coverage Compatibility
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

  if (contract.allocationGrounding) {
    lines.push(`- Allocation Grounding Mode: ${contract.allocationGrounding}`);
  }

  if (contract.requiredFacts.length > 0) {
    lines.push(`- Required Numeric Facts: ${contract.requiredFacts.join("; ")}`);
  }

  if (contract.requiredEntities.length > 0) {
    lines.push(`- Required SEO Entities to Cover: ${contract.requiredEntities.join(", ")}`);
  }

  if (contract.groundedFacts.length > 0) {
    lines.push("- Compact Grounded Evidence Facts:");
    for (const gf of contract.groundedFacts) {
      lines.push(`  * [${gf.sourceType}]: "${gf.value}"`);
    }
  }

  lines.push("- Candidate Experience Rules:");
  lines.push(`  * Personal Claims Allowed: ${contract.candidateExperience.allowed ? "YES" : "NO"}`);
  lines.push(`  * Rationale: ${contract.candidateExperience.reason}`);

  lines.push("- Forbidden Behaviors:");
  for (const fb of contract.forbiddenBehaviors) {
    lines.push(`  * ${fb}`);
  }

  return lines.join("\n");
}
