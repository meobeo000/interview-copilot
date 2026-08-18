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

/**
 * Deterministically detects if an interviewer utterance is a short follow-up question.
 */
export function detectFollowUp(utterance: string): FollowUpDetectionResult {
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

  // 6. ENTITY_CONTINUATION (e.g. "Còn PBN?", "Còn Guest Post?", "Thế còn Entity?", "Còn internal link?")
  const entityContinuationMatch = lower.match(
    /^(?:còn|thế còn|vậy còn)\s+(pbn|guest post|entity|internal link|content|backlink|anchor text|textlink|link bẩn|gsc|ga4|ahrefs)(?:\s+thì sao|\s+như thế nào|\s+sao)?$/i
  );
  if (entityContinuationMatch) {
    const rawEnt = entityContinuationMatch[1].toLowerCase();
    let normalizedEnt = rawEnt;
    if (rawEnt === "pbn") normalizedEnt = "PBN";
    else if (rawEnt === "guest post") normalizedEnt = "Guest Post";
    else if (rawEnt === "entity") normalizedEnt = "Entity";
    else if (rawEnt === "internal link") normalizedEnt = "internal link";
    else if (rawEnt === "content") normalizedEnt = "content";
    else if (rawEnt === "backlink") normalizedEnt = "backlink";
    else if (rawEnt === "anchor text") normalizedEnt = "anchor text";
    else if (rawEnt === "gsc") normalizedEnt = "GSC";
    else if (rawEnt === "ga4") normalizedEnt = "GA4";
    else if (rawEnt === "ahrefs") normalizedEnt = "Ahrefs";

    return {
      detected: true,
      type: "ENTITY_CONTINUATION",
      targetEntity: normalizedEnt,
      rawPattern: entityContinuationMatch[0]
    };
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
  const detection = detectFollowUp(currentUtterance);

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
  const qLower = question.toLowerCase();
  const opening = (answer.openingLine || "").trim();
  const openingLower = opening.toLowerCase();

  if (intent === "DOMAIN_SELECTION") {
    if (openingLower.includes("domain b") || openingLower.includes("con b") || openingLower.includes("site b") || qLower.includes("domain b")) {
      return {
        choice: "domain B",
        action: "Em chọn domain B."
      };
    }
    if (openingLower.includes("domain a") || openingLower.includes("con a") || openingLower.includes("site a")) {
      return {
        choice: "domain A",
        action: "Em chọn domain A."
      };
    }
    return {
      choice: "domain B",
      action: opening || "Em chọn domain B (có traffic thật và backlink niche)."
    };
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
