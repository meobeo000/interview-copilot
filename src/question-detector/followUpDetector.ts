import { normalizeSemanticText } from "../shared/semanticTextMatcher";
import type {
  FollowUpDetectionResult,
  InterviewTurnContext,
  InterviewTurnDecision,
  ResolvedFollowUpContext
} from "./interviewTurnContext";
import type { SuggestedAnswer } from "../shared/types";
import type { AnswerContract } from "../llm/answerContract";
import type { QuestionIntentCategory } from "./intentClassifier";

const KNOWN_SEO_ENTITIES: Record<string, string> = {
  pbn: "PBN",
  "site vệ tinh": "PBN",
  "vệ tinh": "PBN",
  "guest post": "Guest Post",
  guestpost: "Guest Post",
  entity: "Entity",
  "internal link": "internal link",
  "internal links": "internal link",
  silo: "internal link",
  "topic cluster": "internal link",
  content: "content",
  "bài viết": "content",
  backlink: "backlink",
  "link nền": "backlink",
  textlink: "backlink",
  "link bẩn": "negative SEO",
  "link spam": "negative SEO",
  "spam backlink": "negative SEO",
  "negative seo": "negative SEO",
  disavow: "negative SEO",
  gsc: "GSC",
  "google search console": "GSC",
  "search console": "GSC",
  ga4: "GA4",
  "google analytics": "GA4",
  analytics: "GA4",
  ahrefs: "Ahrefs",
  "core update": "Core Update",
  canonical: "canonical",
  "crawl budget": "crawl budget",
  crawl: "crawl budget",
  crawling: "crawl budget",
  "search intent": "Search Intent",
  "user intent": "Search Intent",
  intent: "Search Intent",
  "referring domain": "referring domain",
  "referring domains": "referring domain",
  indexing: "indexing",
  index: "indexing",
  "301": "301",
  "redirect 301": "301",
  redirect: "301",
  "money page": "money page",
  "money site": "money site",
  "expired domain": "expired domain",
  "domain cũ": "expired domain",
  "tên miền cũ": "expired domain",
  "anchor text": "anchor text",
  anchor: "anchor text",
  sitemap: "sitemap",
  "robots.txt": "robots.txt",
  schema: "schema",
  "on-page": "on-page",
  onpage: "on-page",
  "off-page": "off-page",
  offpage: "off-page",
  "technical seo": "technical SEO"
};

/**
 * Deterministically detects if an interviewer utterance is a short follow-up question.
 */
export function detectFollowUp(
  utterance: string,
  previousContext?: InterviewTurnContext | null
): FollowUpDetectionResult {
  const text = normalizeSemanticText(utterance).trim();
  const lower = text.toLowerCase().replace(/[?!.,]+$/, "").trim();

  if (!lower) {
    return { detected: false };
  }

  // 1. DECISION_REASON (e.g. "Vì sao em chọn domain B?", "Tại sao chọn con B?", "Vì sao chọn B?")
  const decisionReasonMatch = lower.match(
    /(?:vì sao|tại sao|sao|lý do gì)\s*(?:em\s*)?(?:lại\s*)?(?:chọn|lấy|mua|ưu tiên)\s*(?:domain [ab]|con [ab]|site [ab]|\b[ab]\b)/i
  );
  if (decisionReasonMatch) {
    const choiceMatch = lower.match(/(?:domain|con|site)\s*([ab])|\b([ab])\b/i);
    const targetEntity = choiceMatch ? `domain ${(choiceMatch[1] || choiceMatch[2]).toUpperCase()}` : undefined;
    return {
      detected: true,
      type: "DECISION_REASON",
      targetEntity,
      rawPattern: decisionReasonMatch[0]
    };
  }

  // 2. WHY (e.g. "Tại sao?", "Vì sao?", "Sao?", "Tại sao lại như vậy?", "Vì sao em chọn cách đó?")
  const whyPatterns = [
    "tại sao",
    "vì sao",
    "sao",
    "là sao",
    "tại sao lại như vậy",
    "vì sao lại như vậy",
    "vì sao vậy",
    "tại sao vậy",
    "vì sao lại thế",
    "tại sao lại thế",
    "tại sao thế",
    "vì sao thế",
    "vì sao em chọn cách đó",
    "tại sao em chọn cách đó",
    "tại sao em lại làm vậy",
    "sao lại như vậy"
  ];
  if (whyPatterns.includes(lower) || whyPatterns.some((wp) => lower === wp || lower === `sao ${wp}`)) {
    return {
      detected: true,
      type: "WHY",
      rawPattern: lower
    };
  }

  // 3. SIGNAL (e.g. "Tín hiệu nào?", "Dựa vào tín hiệu nào?", "Em dựa vào đâu?", "Dựa vào đâu?")
  const signalPatterns = [
    "tín hiệu nào",
    "dựa vào tín hiệu nào",
    "dựa trên tín hiệu nào",
    "dựa vào đâu",
    "em dựa vào đâu",
    "dựa trên cơ sở nào",
    "tín hiệu gì",
    "nhìn vào tín hiệu nào",
    "nhìn vào chỉ số nào",
    "dựa vào metric nào",
    "nhìn vào đâu"
  ];
  if (signalPatterns.includes(lower) || signalPatterns.some((sp) => lower.includes(sp))) {
    return {
      detected: true,
      type: "SIGNAL",
      rawPattern: lower
    };
  }

  // 4. WHEN (e.g. "Khi nào?", "Khi nào em dừng?", "Khi nào thì dừng?", "Khi nào bắt đầu?")
  const whenPatterns = [
    "khi nào",
    "khi nào em dừng",
    "khi nào thì dừng",
    "khi nào dừng",
    "bao giờ dừng",
    "khi nào bắt đầu",
    "khi nào em bắt đầu",
    "khi nào đi link",
    "khi nào tăng link",
    "bao lâu thì dừng"
  ];
  if (whenPatterns.includes(lower) || whenPatterns.some((wp) => lower === wp || lower.startsWith(wp))) {
    return {
      detected: true,
      type: "WHEN",
      rawPattern: lower
    };
  }

  // 5. FAILURE_NEXT_STEP (e.g. "Nếu vẫn không lên thì sao?", "Nếu vẫn tụt thì sao?", "Vậy bước tiếp theo là gì?")
  const failurePatterns = [
    "nếu vẫn không lên thì sao",
    "nếu không lên thì sao",
    "nếu vẫn không nhận key thì sao",
    "nếu vẫn không nhận keyword thì sao",
    "nếu vẫn tụt thì sao",
    "nếu tụt tiếp thì sao",
    "nếu không có tín hiệu thì sao",
    "nếu không hiệu quả thì sao",
    "nếu vẫn không hiệu quả thì sao",
    "vậy bước tiếp theo là gì",
    "bước tiếp theo là gì",
    "vậy bước tiếp theo làm gì",
    "vậy em check gì tiếp",
    "em check gì tiếp",
    "vậy làm gì tiếp",
    "vậy làm gì tiếp theo",
    "tiếp theo em làm gì",
    "bước tiếp theo làm gì",
    "tiếp theo là gì"
  ];
  if (failurePatterns.includes(lower) || failurePatterns.some((fp) => lower.includes(fp) || lower === fp)) {
    return {
      detected: true,
      type: "FAILURE_NEXT_STEP",
      rawPattern: lower
    };
  }

  // 6. ENTITY_CONTINUATION (e.g. "Còn PBN?", "Còn canonical?", "Thế còn Core Update?", "Vậy còn 301?", "Còn money page thì sao?")
  const entityMatch = lower.match(
    /^(?:còn|thế còn|vậy còn)\s+(.+?)(?:\s+thì sao|\s+như thế nào|\s+sao)?$/i
  );
  if (entityMatch) {
    const rawCandidate = entityMatch[1].trim().toLowerCase();

    // Condition 1: Recognized SEO vocabulary (e.g. "301", "pbn", "canonical", "internal link")
    if (KNOWN_SEO_ENTITIES[rawCandidate]) {
      return {
        detected: true,
        type: "ENTITY_CONTINUATION",
        targetEntity: KNOWN_SEO_ENTITIES[rawCandidate],
        rawPattern: entityMatch[0]
      };
    }

    // Reject numbers / budgets / units (e.g. "20 triệu", "50k", "5%")
    const isNumberOrMoney = Boolean(
      rawCandidate.match(/^\d+/) ||
      rawCandidate.includes("triệu") ||
      rawCandidate.includes("nghìn") ||
      rawCandidate.includes("tỷ") ||
      rawCandidate.match(/\b\d+\s*k\b/i) ||
      rawCandidate.includes("%")
    );

    // Reject non-SEO conversational pronouns and temporal words unless in previousContext
    const conversationalStops = ["anh", "em", "ngày mai", "bây giờ", "hôm nay", "cà phê", "cơm", "đó", "nó", "đây", "ai", "sao", "thế"];
    const isStopWord = conversationalStops.includes(rawCandidate);

    // Condition 2: Appeared as an entity/concept in previous completed turn
    if (!isNumberOrMoney && !isStopWord && previousContext) {
      const prevEntities = previousContext.entities || [];
      const matchedPrevEntity = prevEntities.find(
        (e) => e.toLowerCase() === rawCandidate || e.toLowerCase().includes(rawCandidate)
      );
      if (matchedPrevEntity) {
        return {
          detected: true,
          type: "ENTITY_CONTINUATION",
          targetEntity: matchedPrevEntity,
          rawPattern: entityMatch[0]
        };
      }
      if (previousContext.question && previousContext.question.toLowerCase().includes(rawCandidate)) {
        return {
          detected: true,
          type: "ENTITY_CONTINUATION",
          targetEntity: rawCandidate,
          rawPattern: entityMatch[0]
        };
      }
    }
  }

  // 7. GENERAL_CONTINUATION (e.g. "Rồi sao nữa?", "Sau đó thì sao?", "Rồi làm gì?")
  const generalPatterns = [
    "rồi sao nữa",
    "rồi sao",
    "sau đó thì sao",
    "sau đó làm gì",
    "rồi làm gì",
    "rồi thế nào nữa",
    "xong rồi sao"
  ];
  if (generalPatterns.includes(lower) || generalPatterns.some((gp) => lower === gp)) {
    return {
      detected: true,
      type: "GENERAL_CONTINUATION",
      rawPattern: lower
    };
  }

  return { detected: false };
}

/**
 * Resolves minimal contextual meaning for a follow-up utterance
 * using the immediately previous completed turn context.
 */
export function resolveFollowUpContext(
  currentUtterance: string,
  previousContext: InterviewTurnContext | null | undefined,
  currentTurnId?: string
): ResolvedFollowUpContext {
  const start = performance.now();
  const detection = detectFollowUp(currentUtterance, previousContext);

  if (!detection.detected || !detection.type) {
    const resolutionMs = Math.round((performance.now() - start) * 100) / 100;
    return {
      followUpType: "GENERAL_CONTINUATION",
      contextResolved: false,
      currentUtterance,
      inheritedEntities: [],
      inheritedNumericFacts: [],
      resolutionMs
    };
  }

  // Rule 4: Utterance is contextual ONLY when valid previousContext exists
  if (!previousContext || !previousContext.question?.trim()) {
    const resolutionMs = Math.round((performance.now() - start) * 100) / 100;
    const result: ResolvedFollowUpContext = {
      followUpType: detection.type,
      contextResolved: false,
      currentUtterance,
      targetEntity: detection.targetEntity,
      inheritedEntities: [],
      inheritedNumericFacts: [],
      resolutionMs
    };
    logFollowUpTelemetry(result, currentTurnId);
    return result;
  }

  // Resolve inherited context
  const inheritedIntent = previousContext.intent;
  const inheritedEntities = [...previousContext.entities];
  if (detection.targetEntity && !inheritedEntities.includes(detection.targetEntity)) {
    inheritedEntities.push(detection.targetEntity);
  }

  const inheritedNumericFacts = [...previousContext.numericFacts];
  const inheritedConstraints = previousContext.scenarioConstraints
    ? { ...previousContext.scenarioConstraints }
    : undefined;
  const previousDecision = previousContext.decision;
  const previousAnswerSummary = previousContext.answerSummary;

  let resolvedMeaning = "";
  switch (detection.type) {
    case "WHY":
      if (previousDecision?.action || previousDecision?.choice) {
        resolvedMeaning = `Explain why the previous decision ("${previousDecision.action || previousDecision.choice}") was made for "${previousContext.question}".`;
      } else {
        resolvedMeaning = `Explain the technical rationale behind the previous answer for "${previousContext.question}".`;
      }
      break;

    case "DECISION_REASON":
      resolvedMeaning = `Explain the detailed rationale for choosing ${detection.targetEntity || previousDecision?.choice || "the selected domain/option"} in "${previousContext.question}".`;
      break;

    case "SIGNAL":
      resolvedMeaning = `Identify the specific verifiable metrics and signals (e.g. GSC indexing, impressions, rankings) relevant to "${previousContext.question}".`;
      break;

    case "WHEN":
      resolvedMeaning = `Explain the exact timing and signal conditions for when to proceed or stop in "${previousContext.question}".`;
      break;

    case "FAILURE_NEXT_STEP":
      resolvedMeaning = `Provide the next-level diagnostic and action steps assuming initial measures ("${previousDecision?.action || previousAnswerSummary || "initial checklist"}") did not resolve the issue in "${previousContext.question}".`;
      break;

    case "ENTITY_CONTINUATION":
      resolvedMeaning = `Explain the specific allocation, implementation, and role of ${detection.targetEntity || "this entity"} within the context of "${previousContext.question}".`;
      break;

    case "GENERAL_CONTINUATION":
      resolvedMeaning = `Provide the subsequent workflow phase following "${previousContext.question}".`;
      break;
  }

  const resolutionMs = Math.round((performance.now() - start) * 100) / 100;

  const result: ResolvedFollowUpContext = {
    followUpType: detection.type,
    contextResolved: true,
    currentUtterance,
    previousTurnId: previousContext.turnId,
    previousQuestion: previousContext.question,
    inheritedIntent,
    inheritedEntities,
    inheritedNumericFacts,
    inheritedConstraints,
    previousDecision,
    previousAnswerSummary,
    resolvedMeaning,
    targetEntity: detection.targetEntity,
    resolutionMs
  };

  logFollowUpTelemetry(result, currentTurnId);
  return result;
}

/**
 * Extracts a deterministic decision/action snapshot from a completed turn.
 */
export function extractDecisionFromCompletedTurn(
  question: string,
  intent: QuestionIntentCategory,
  answer: SuggestedAnswer,
  contract?: AnswerContract
): InterviewTurnDecision | undefined {
  const opening = (answer.openingLine || "").trim();
  const openingLower = opening.toLowerCase();

  if (intent === "DOMAIN_SELECTION") {
    // Only extract choice if answer text clearly states a choice
    const answerText = [answer.openingLine, ...(answer.bullets || []), ...(answer.keywords || []), answer.streamingText]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    const choosesA =
      answerText.includes("chọn domain a") ||
      answerText.includes("lấy con a") ||
      answerText.includes("chọn con a") ||
      answerText.includes("ưu tiên domain a") ||
      answerText.includes("ưu tiên con a") ||
      answerText.includes("nghiêng về domain a") ||
      answerText.includes("nghiêng về con a") ||
      answerText.includes("nghiêng về site a") ||
      answerText.includes("lấy domain a") ||
      answerText.includes("lấy site a");

    const choosesB =
      answerText.includes("chọn domain b") ||
      answerText.includes("lấy con b") ||
      answerText.includes("chọn con b") ||
      answerText.includes("ưu tiên domain b") ||
      answerText.includes("ưu tiên con b") ||
      answerText.includes("nghiêng về domain b") ||
      answerText.includes("nghiêng về con b") ||
      answerText.includes("nghiêng về site b") ||
      answerText.includes("lấy domain b") ||
      answerText.includes("lấy site b");

    if (choosesA && !choosesB) {
      return {
        choice: "domain A",
        action: opening || "Em chọn domain A."
      };
    }
    if (choosesB && !choosesA) {
      return {
        choice: "domain B",
        action: opening || "Em chọn domain B."
      };
    }

    // If answer did NOT make a domain selection (e.g. diagnostic / Wayback check first), do NOT fabricate choice
    if (opening) {
      return {
        action: opening
      };
    }
    return undefined;
  }

  if (intent === "NEGATIVE_SEO") {
    if (
      openingLower.includes("chưa disavow") ||
      openingLower.includes("không disavow") ||
      openingLower.includes("theo dõi") ||
      openingLower.includes("kiểm tra trước")
    ) {
      return {
        action: "Do not disavow immediately; inspect and monitor ranking impact first."
      };
    }
    return {
      action: "Inspect link spam indexing and ranking fluctuation before disavow."
    };
  }

  if (intent === "NO_KEYWORD_SIGNAL") {
    return {
      action: "Check intent, on-page, and internal links before building external links."
    };
  }

  if (intent === "PBN_TIMING") {
    return {
      action: "Wait for indexing and impression signals before deploying PBN links."
    };
  }

  if (contract?.firstSentenceDirective) {
    return {
      action: opening || undefined
    };
  }

  if (opening) {
    return {
      action: opening
    };
  }

  return undefined;
}

/**
 * Formats the resolved follow-up context block for injection into Gemini prompts.
 */
export function formatFollowUpContextForPrompt(context: ResolvedFollowUpContext): string {
  if (!context.contextResolved) {
    return "";
  }

  const lines: string[] = [
    "[INTERVIEW FOLLOW-UP CONTEXT]:",
    `- Follow-up type: ${context.followUpType}`,
    `- Current interviewer utterance: "${context.currentUtterance}"`,
    `- Previous interviewer question: "${context.previousQuestion || "N/A"}"`,
    `- Previous intent: ${context.inheritedIntent || "UNKNOWN"}`
  ];

  if (context.previousDecision?.choice || context.previousDecision?.action) {
    lines.push(
      `- Previous answer decision: "${context.previousDecision.action || context.previousDecision.choice}"`
    );
  }

  if (context.targetEntity) {
    lines.push(`- Target Entity Focus: ${context.targetEntity}`);
  }

  if (context.inheritedEntities && context.inheritedEntities.length > 0) {
    lines.push(`- Relevant entities: ${context.inheritedEntities.join(", ")}`);
  }

  if (context.inheritedNumericFacts && context.inheritedNumericFacts.length > 0) {
    lines.push(`- Relevant facts: ${context.inheritedNumericFacts.join("; ")}`);
  }

  if (context.inheritedConstraints) {
    const sc = context.inheritedConstraints;
    const ruledOut: string[] = [];
    if (sc.coreUpdateOccurred === false) ruledOut.push("coreUpdateOccurred = false (NO Core Update)");
    if (sc.manualAction === false) ruledOut.push("manualAction = false (NO manual action)");
    if (sc.indexingIssue === false) ruledOut.push("indexingIssue = false (indexing normal)");
    if (sc.crawlIssue === false) ruledOut.push("crawlIssue = false (crawl normal)");
    if (sc.referringDomainLoss === false) ruledOut.push("referringDomainLoss = false (backlinks/RD intact)");
    if (sc.negativeSeo === false) ruledOut.push("negativeSeo = false (not negative SEO)");
    if (sc.trafficChangePercent !== undefined) ruledOut.push(`trafficChangePercent = ${sc.trafficChangePercent}%`);

    if (ruledOut.length > 0) {
      lines.push(`- Preserved Scenario Constraints: ${ruledOut.join("; ")}`);
    }
  }

  lines.push(
    "- Directive: Answer the current follow-up using the immediately previous interview context. Do not restart the topic from zero. Do not give an unrelated generic SEO workflow."
  );

  return lines.join("\n");
}

function logFollowUpTelemetry(result: ResolvedFollowUpContext, currentTurnId?: string): void {
  if (typeof process !== "undefined" && process.env?.NODE_ENV === "test") {
    return;
  }

  const lines = [
    "[FOLLOW-UP CONTEXT]",
    `currentTurnId: ${currentTurnId || "N/A"}`,
    `previousTurnId: ${result.previousTurnId || "none"}`,
    `utterance: "${result.currentUtterance}"`,
    `followUpDetected: ${Boolean(result.followUpType)}`,
    `followUpType: ${result.followUpType}`,
    `contextResolved: ${result.contextResolved}`,
    `inheritedIntent: ${result.inheritedIntent || "none"}`,
    `inheritedEntities: ${JSON.stringify(result.inheritedEntities)}`,
    `inheritedNumericFacts: ${JSON.stringify(result.inheritedNumericFacts)}`,
    `inheritedConstraints: ${result.inheritedConstraints ? JSON.stringify(result.inheritedConstraints) : "none"}`,
    `previousDecisionAvailable: ${Boolean(result.previousDecision?.choice || result.previousDecision?.action)}`,
    `resolutionMs: ${result.resolutionMs} ms`
  ];

  console.log(lines.join("\n"));
}
