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

export type CandidateEvidenceType = "PROJECT" | "EXPLICIT_EXPERIENCE_NOTE" | "NONE";

export interface CandidateExperienceEvidence {
  allowed: boolean;
  supportedTopics: string[];
  supportingProjectIds: string[];
  evidenceType: CandidateEvidenceType;
  reason: string;
}

export interface GroundedContractFact {
  value: string;
  sourceType: KnowledgeSourceType;
  sourceId: string;
  topic?: string;
  isPercentageBased?: boolean;
  confidence: number;
}

import type { ScenarioConstraints } from "../question-detector/scenarioConstraints";

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
  scenarioConstraints?: ScenarioConstraints;
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

const SPOKEN_NUMBER_MAP: Record<string, number> = {
  "một": 1,
  "hai": 2,
  "ba": 3,
  "bốn": 4,
  "năm": 5,
  "sáu": 6,
  "bảy": 7,
  "tám": 8,
  "chín": 9,
  "mười": 10,
  "hai mươi": 20,
  "ba mươi": 30,
  "bốn mươi": 40,
  "năm mươi": 50,
  "sáu mươi": 60,
  "bảy mươi": 70,
  "tám mươi": 80,
  "chín mươi": 90,
  "trăm": 100
};

// ---------------------------------------------------------------------------
// 1. Typed Fact Normalizers
// ---------------------------------------------------------------------------

export function normalizeMoneyFact(fact: string): string | null {
  const lower = fact.toLowerCase().trim();

  // Match prefix currency symbol like $50 or USD 100
  const prefixMatch = lower.match(/(?:budget|ngân\s*sách|chi|tiền|giá)?[:\s]*(\$|usd|vnd|vnđ)\s*(\d+(?:\.\d+)?)/i);
  if (prefixMatch) {
    const symbol = prefixMatch[1].toLowerCase();
    const numVal = parseFloat(prefixMatch[2]);
    if (!isNaN(numVal)) {
      const currency = symbol === "$" || symbol === "usd" ? "usd" : "vnd";
      return `budget:${Math.round(numVal)}:${currency}`;
    }
  }

  // Match suffix currency like 20 USD, 20 triệu, 20tr, 20 củ
  const suffixMatch = lower.match(
    /(?:budget|ngân\s*sách|chi|tiền|giá)?[:\s]*(\d+(?:\.\d+)?|hai mươi|ba mươi|bốn mươi|năm mươi|sáu mươi|bảy mươi|tám mươi|chín mươi|mười)\s*(triệu|tr|củ|m|k|vnd|vnđ|usd|\$)/i
  );
  if (!suffixMatch) {
    return null;
  }

  let numStr = suffixMatch[1].toLowerCase();
  for (const [spoken, n] of Object.entries(SPOKEN_NUMBER_MAP)) {
    if (numStr === spoken) {
      numStr = String(n);
      break;
    }
  }

  const numVal = parseFloat(numStr);
  if (isNaN(numVal)) return null;

  const unit = suffixMatch[2].toLowerCase();
  let amount = numVal;
  let currency = "vnd";
  if (unit === "triệu" || unit === "tr" || unit === "củ" || unit === "m") {
    amount = numVal * 1_000_000;
    currency = "vnd";
  } else if (unit === "k") {
    amount = numVal * 1_000;
    currency = "vnd";
  } else if (unit === "usd" || unit === "$") {
    amount = numVal;
    currency = "usd";
  } else if (unit === "vnd" || unit === "vnđ") {
    amount = numVal;
    currency = "vnd";
  }

  return `budget:${Math.round(amount)}:${currency}`;
}

export function normalizeDrFact(fact: string): string | null {
  const lower = fact.toLowerCase().trim();
  if (!lower.includes("dr")) {
    return null;
  }

  const matches = Array.from(lower.matchAll(/(?:dr)\s*(\d+)/gi));
  if (matches.length === 0) {
    return null;
  }

  const drValues = matches
    .map((m) => parseInt(m[1], 10))
    .filter((n) => !isNaN(n))
    .sort((a, b) => a - b);

  return `dr:${drValues.join(",")}`;
}

export function normalizePercentageFact(fact: string): string | null {
  const lower = fact.toLowerCase().trim();
  const match = lower.match(/(\d+(?:\.\d+)?)\s*(?:%|phần\s*trăm|percent)/i);
  if (!match) {
    return null;
  }
  const val = parseFloat(match[1]);
  return isNaN(val) ? null : `percent:${val}`;
}

export function normalizePositionFact(fact: string): string | null {
  const lower = fact.toLowerCase().trim();
  if (!lower.includes("position") && !lower.includes("vị trí") && !lower.includes("top")) {
    return null;
  }
  const match = lower.match(/(?:position|vị trí|top)[:\s]*(\d+(?:\.\d+)?)/i);
  if (!match) {
    return null;
  }
  const val = parseFloat(match[1]);
  return isNaN(val) ? null : `position:${val}`;
}

export function normalizeDurationFact(fact: string): string | null {
  const lower = fact.toLowerCase().trim();
  if (!lower.includes("ngày") && !lower.includes("tuần") && !lower.includes("tháng") && !lower.includes("day") && !lower.includes("week")) {
    return null;
  }
  const match = lower.match(/(\d+|một|hai|ba|bốn|năm|mười)\s*(ngày|tuần|tháng|day|week|month)/i);
  if (!match) {
    return null;
  }
  let count = match[1];
  if (count === "hai") count = "2";
  else if (count === "ba") count = "3";
  else if (count === "mười") count = "10";
  return `duration:${count}_${match[2]}`;
}

/**
 * Normalizes any required fact safely using typed normalizers.
 * Crucial guarantee: "DR 55" will NEVER normalize to "55 triệu".
 */
export function normalizeRequiredFact(fact: string): string {
  const trimmed = fact.trim();
  const money = normalizeMoneyFact(trimmed);
  if (money) return money;

  const dr = normalizeDrFact(trimmed);
  if (dr) return dr;

  const pct = normalizePercentageFact(trimmed);
  if (pct) return pct;

  const pos = normalizePositionFact(trimmed);
  if (pos) return pos;

  const dur = normalizeDurationFact(trimmed);
  if (dur) return dur;

  return trimmed.toLowerCase();
}

/**
 * Compatibility wrapper for normalizeRequiredFact.
 */
export function normalizeNumericFact(fact: string): string {
  return normalizeRequiredFact(fact);
}

// ---------------------------------------------------------------------------
// 2. Candidate Experience Verification
// ---------------------------------------------------------------------------

/**
 * Evaluates candidate profile to determine whether first-person claims
 * are permitted for the specific techniques/topics in the question.
 *
 * Strict Rule: seoSkills alone CANNOT enable autobiographical claims.
 * Verified hands-on project descriptions or explicit experience notes are REQUIRED.
 */
export function evaluateCandidateExperience(
  question: string,
  _intentCategory: QuestionIntentCategory,
  profile?: CandidateProfile
): CandidateExperienceEvidence {
  if (!profile) {
    return {
      allowed: false,
      supportedTopics: [],
      supportingProjectIds: [],
      evidenceType: "NONE",
      reason: "No candidate profile provided."
    };
  }

  const qLower = question.toLowerCase();

  // High-risk technique triggers that require explicit hands-on execution evidence
  const techniqueKeywords: Record<string, string[]> = {
    PBN: ["pbn", "vệ tinh", "site vệ tinh", "satellite site"],
    "Guest Post": ["guest post", "guestpost", "gét pót"],
    "expired domain": ["expired domain", "domain cũ", "tên miền cũ", "301 redirect"],
    "301 migration": ["301", "redirect 301", "chuyển hướng domain"],
    "iGaming SEO": ["igaming", "casino", "sports betting", "cá cược", "nhà cái", "uu88"],
    "budget allocation": ["ngân sách", "budget", "20 triệu", "50 triệu", "phân bổ vốn", "chia ngân sách"],
    "negative SEO": ["negative seo", "link bẩn", "disavow", "bắn link spam"],
    "Core Update recovery": ["core update", "tụt traffic", "recovery", "thuật toán"]
  };

  // Identify targeted topics
  const targetedTopics: string[] = [];
  for (const [topic, triggers] of Object.entries(techniqueKeywords)) {
    if (triggers.some((tr) => qLower.includes(tr))) {
      targetedTopics.push(topic);
    }
  }

  // If question is general SEO without specialized technique claims
  if (targetedTopics.length === 0) {
    const hasProjects = Boolean(profile.projects && profile.projects.length > 0);
    return {
      allowed: hasProjects,
      supportedTopics: ["General SEO"],
      supportingProjectIds: (profile.projects || []).map((p) => p.name),
      evidenceType: hasProjects ? "PROJECT" : "NONE",
      reason: hasProjects
        ? "General SEO background supported by candidate projects."
        : "No candidate projects found in profile."
    };
  }

  // Hands-on execution check: inspect candidate projects and experienceNotes only
  // seoSkills alone CANNOT enable autobiographical claims
  const supportedTopics: string[] = [];
  const supportingProjectIds: string[] = [];
  let evidenceType: CandidateEvidenceType = "NONE";

  const projectCorpus = (profile.projects || [])
    .map((p) => ({
      name: p.name,
      text: `${p.name} ${p.role || ""} ${p.description || ""} ${p.metrics || ""}`.toLowerCase()
    }));

  const noteCorpus = (profile.experienceNotes || "").toLowerCase();

  for (const topic of targetedTopics) {
    const triggers = techniqueKeywords[topic];
    let topicSupported = false;

    // Check project descriptions
    for (const p of projectCorpus) {
      if (triggers.some((tr) => p.text.includes(tr))) {
        supportedTopics.push(topic);
        supportingProjectIds.push(p.name);
        evidenceType = "PROJECT";
        topicSupported = true;
        break;
      }
    }

    // Check explicit experience notes
    if (!topicSupported && triggers.some((tr) => noteCorpus.includes(tr))) {
      supportedTopics.push(topic);
      if (evidenceType === "NONE") {
        evidenceType = "EXPLICIT_EXPERIENCE_NOTE";
      }
    }
  }

  const allSupported = targetedTopics.length > 0 && targetedTopics.every((t) => supportedTopics.includes(t));

  return {
    allowed: allSupported && supportedTopics.length > 0,
    supportedTopics: Array.from(new Set(supportedTopics)),
    supportingProjectIds: Array.from(new Set(supportingProjectIds)),
    evidenceType: allSupported ? evidenceType : "NONE",
    reason: allSupported
      ? `Candidate profile has verified hands-on evidence for: ${supportedTopics.join(", ")}`
      : `Candidate profile lacks hands-on project evidence for: ${targetedTopics.filter((t) => !supportedTopics.includes(t)).join(", ")}`
  };
}

// ---------------------------------------------------------------------------
// 3. Grounded Fact Extraction & Allocation Qualification
// ---------------------------------------------------------------------------

const RECOGNIZED_SPEND_CATEGORIES = [
  "content",
  "entity",
  "guest post",
  "pbn",
  "backlink",
  "link nền",
  "textlink"
] as const;

/**
 * Extracts compact grounded facts from retrieved knowledge chunks.
 * Strict Rule: A chunk qualifies as budget allocation evidence ONLY if:
 * 1. Contains a recognizable money/budget amount.
 * 2. Contains allocation language (chia, phân bổ, budget, ngân sách, X triệu cho, X% cho).
 * 3. Contains at least TWO requested spend categories from the question.
 */
export function extractGroundedContractFacts(
  retrievedChunks: KnowledgeChunk[] = [],
  question: string
): GroundedContractFact[] {
  const facts: GroundedContractFact[] = [];
  const qLower = question.toLowerCase();

  // Find spend categories present in the question
  const questionSpendCategories = RECOGNIZED_SPEND_CATEGORIES.filter((cat) => qLower.includes(cat));

  for (const chunk of retrievedChunks) {
    const content = chunk.content;
    const contentLower = content.toLowerCase();

    // 1. Budget breakdown facts
    const hasMoneyAmount =
      contentLower.includes("triệu") ||
      contentLower.includes("tr ") ||
      contentLower.includes("budget") ||
      contentLower.includes("ngân sách") ||
      contentLower.includes("%");

    const hasAllocationLanguage =
      contentLower.includes("phân bổ") ||
      contentLower.includes("chia") ||
      contentLower.includes("ngân sách") ||
      contentLower.includes("budget") ||
      /(\d+)\s*(?:triệu|%|m)\s*(?:cho|dành cho)/i.test(contentLower);

    if (hasMoneyAmount && hasAllocationLanguage) {
      // Check matching spend categories
      const matchingCategories = RECOGNIZED_SPEND_CATEGORIES.filter((cat) => contentLower.includes(cat));
      const relevantMatches = matchingCategories.filter(
        (cat) => questionSpendCategories.length === 0 || questionSpendCategories.includes(cat)
      );

      // Must have at least TWO qualifying spend categories that match the question categories (if supplied)
      const qualifiesSpendCategories =
        questionSpendCategories.length > 0
          ? relevantMatches.length >= Math.min(2, questionSpendCategories.length)
          : matchingCategories.length >= 2;

      if (qualifiesSpendCategories) {
        const isPercentage = contentLower.includes("%");
        const budgetLines = content.split("\n").filter((l) => l.trim().length > 0);
        facts.push({
          value: budgetLines.slice(0, 3).join("; "),
          sourceType: chunk.sourceType,
          sourceId: chunk.id,
          topic: chunk.topic,
          isPercentageBased: isPercentage,
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
    if (qLower.includes("domain") || chunk.topic === "DOMAIN_SELECTION" || chunk.topic === "EXPIRED_DOMAIN") {
      const firstLine = content.split("\n").find((l) => l.trim().length > 0) || content.slice(0, 100);
      facts.push({
        value: firstLine.trim(),
        sourceType: chunk.sourceType,
        sourceId: chunk.id,
        topic: chunk.topic,
        confidence: 0.9
      });
    }
  }

  return facts;
}

// ---------------------------------------------------------------------------
// 4. Contract Builder
// ---------------------------------------------------------------------------

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
    const hasCandidateBudgetExp =
      candidateExperience.allowed && candidateExperience.supportedTopics.includes("budget allocation");
    const hasPractitionerBudgetChunk = groundedFacts.some(
      (f) =>
        f.sourceType === "practitioner_playbook" &&
        (f.value.toLowerCase().includes("content") ||
          f.value.toLowerCase().includes("entity") ||
          f.value.toLowerCase().includes("pbn") ||
          f.value.toLowerCase().includes("guest post"))
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
        firstSentenceDirective = `Sentence 1 MUST use clear proposal/approximation language across the requested categories (${requiredEntities.join(", ") || "Content, Entity, Guest Post, PBN"}). Acceptable opening patterns: "Với 20 triệu thì em có thể chia khoảng...", "Với case này em sẽ đề xuất khoảng...", "Nếu chưa có dữ liệu lịch sử thì em tạm chia khoảng...". Do NOT present numbers as ungrounded historical fact.`;
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

    case "CORE_UPDATE_RECOVERY":
    case "GSC_RANKING_DROP":
    case "ONPAGE_DIAGNOSIS":
      answerType = "DIRECT_ACTION_DIAGNOSIS";
      firstSentenceDirective = "Sentence 1 MUST state the first technical checkpoint in GSC/Ahrefs or immediate 24h diagnosis.";
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
      ? `Candidate has verified hands-on project evidence in: ${candidateExperience.supportedTopics.join(", ")}. First-person framing is permitted for these topics.`
      : `Do NOT claim personal candidate experience (Do NOT say 'Em đã từng...', 'Ở project trước em...'). Candidate profile lacks hands-on project evidence. Use hypothetical practitioner framing ('Với case này em sẽ...', 'Hướng xử lý của em là...').`,
    requiredEntities.length > 0
      ? `Do NOT ignore or replace requested entities. You MUST cover: ${requiredEntities.join(", ")}.`
      : "Do NOT drift into unrelated SEO topics."
  ];

  if (allocationGrounding === "PROPOSED") {
    forbiddenBehaviors.push("In PROPOSED mode, do NOT present proposed numbers as known historical facts or candidate personal history. Sentence 1 MUST use proposal/approximation wording.");
  }

  const scenarioConstraints = options.semanticEvidence?.scenarioConstraints;

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
    scenarioConstraints,
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

  // 2. Typed Normalized Required Facts Compatibility
  const provNormalizedFacts = provisional.requiredFacts.map(normalizeRequiredFact).sort().join(" | ");
  const finalNormalizedFacts = finalContract.requiredFacts.map(normalizeRequiredFact).sort().join(" | ");
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

  if (contract.scenarioConstraints) {
    const ruledOut: string[] = [];
    const sc = contract.scenarioConstraints;
    if (sc.indexingIssue === false) ruledOut.push("indexingIssue = false (indexing confirmed normal / no crawl errors)");
    if (sc.crawlIssue === false) ruledOut.push("crawlIssue = false (crawl confirmed normal / no bot block)");
    if (sc.canonicalIssue === false) ruledOut.push("canonicalIssue = false (canonical confirmed normal)");
    if (sc.manualAction === false) ruledOut.push("manualAction = false (no manual action penalty)");
    if (sc.referringDomainLoss === false) ruledOut.push("referringDomainLoss = false (backlinks/referring domains intact, no link loss)");
    if (sc.coreUpdateOccurred === false) ruledOut.push("coreUpdateOccurred = false (NO Core Update occurred)");
    if (sc.negativeSeo === false) ruledOut.push("negativeSeo = false (ruled out negative SEO attack)");

    if (ruledOut.length > 0) {
      lines.push("- Confirmed Ruled-Out Conditions (DO NOT recommend these as primary root cause or first troubleshooting action):");
      for (const ro of ruledOut) {
        lines.push(`  * ${ro}`);
      }
      lines.push("  * DIRECTIVE: Focus immediately on surviving plausible causes (search intent shift, competitor optimization, internal link structure, commercial page UX/intent mismatch).");
    }
  }

  if (contract.groundedFacts.length > 0) {
    lines.push("- Compact Grounded Evidence Facts:");
    for (const gf of contract.groundedFacts) {
      lines.push(`  * [${gf.sourceType}]: "${gf.value}"`);
    }
  }

  lines.push("- Candidate Experience Rules:");
  lines.push(`  * Personal Claims Allowed: ${contract.candidateExperience.allowed ? "YES" : "NO"}`);
  lines.push(`  * Evidence Type: ${contract.candidateExperience.evidenceType}`);
  lines.push(`  * Rationale: ${contract.candidateExperience.reason}`);

  lines.push("- Forbidden Behaviors:");
  for (const fb of contract.forbiddenBehaviors) {
    lines.push(`  * ${fb}`);
  }

  return lines.join("\n");
}

/**
 * Diagnostic validator to detect CONSTRAINT_IGNORED violations in generated answers.
 */
export function validateAnswerConstraints(
  answerText: string,
  contract: AnswerContract
): { isValid: boolean; violation?: string } {
  if (!contract.scenarioConstraints) {
    return { isValid: true };
  }
  const lower = answerText.toLowerCase();
  const sc = contract.scenarioConstraints;

  // If indexing or crawl is confirmed normal (not an issue)
  if (sc.indexingIssue === false || sc.crawlIssue === false) {
    const forbiddenFirstSteps = [
      "check indexing",
      "kiểm tra indexing",
      "kiểm tra crawl",
      "check crawl",
      "robots.txt",
      "sitemap",
      "lỗi index",
      "lỗi crawl",
      "đợi index",
      "chặn crawl"
    ];
    for (const f of forbiddenFirstSteps) {
      if (lower.includes(f)) {
        return {
          isValid: false,
          violation: `CONSTRAINT_IGNORED: Answer recommended "${f}" even though indexing/crawl was explicitly ruled out.`
        };
      }
    }
  }

  // If Core Update is explicitly ruled out
  if (sc.coreUpdateOccurred === false) {
    if (lower.includes("do core update") || lower.includes("sau core update") || lower.includes("ảnh hưởng của core update")) {
      return {
        isValid: false,
        violation: "CONSTRAINT_IGNORED: Answer attributed drop to Core Update even though Core Update was explicitly ruled out."
      };
    }
  }

  // If negative SEO is explicitly ruled out
  if (sc.negativeSeo === false) {
    if (lower.includes("bị bắn link bẩn") || lower.includes("do negative seo") || lower.includes("disavow ngay")) {
      return {
        isValid: false,
        violation: "CONSTRAINT_IGNORED: Answer attributed drop to negative SEO even though negative SEO was explicitly ruled out."
      };
    }
  }

  return { isValid: true };
}
