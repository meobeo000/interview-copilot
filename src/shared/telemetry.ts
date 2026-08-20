import type { SuggestedAnswer } from "./types";

export type LatencyPipelineMode = "speculativeReused" | "speculativeReplaced" | "normalCommitted";

export interface PipelineTimestamps {
  speechLastActivityAt?: number;
  speechEndedAt?: number;
  lastSttPartialAt?: number;
  lastSttFinalAt?: number;
  questionIntentReadyAt?: number;
  intentCandidateAt?: number;
  speculativeRequestStartedAt?: number;
  questionCommittedAt?: number;
  answerRequestStartedAt?: number;
  firstAnswerTokenAt?: number;
  firstVisibleAnswerAt?: number;
  firstUsefulAnswerAt?: number;
  answerCompletedAt?: number;
  mode?: LatencyPipelineMode;
}

export interface PipelineLatencyMetrics {
  mode?: LatencyPipelineMode;
  speechEndToIntent?: number;
  speechEndToCommit?: number;
  intentToRequest?: number;
  intentToSpeculativeRequest?: number;
  requestToFirstToken?: number;
  speechEndToFirstToken?: number;
  prewarmLeadTimeMs?: number;
  speechEndToFirstVisibleAnswerMs?: number;
  speechEndToFirstUsefulAnswer?: number;
  questionCommitAfterAnswerStarted?: number;
  totalAnswerGeneration?: number;
}

/**
 * Calculates latency deltas in milliseconds between stages of the interview pipeline.
 */
export function calculatePipelineMetrics(
  timestamps: PipelineTimestamps
): PipelineLatencyMetrics {
  const speechEnd = timestamps.speechEndedAt ?? timestamps.speechLastActivityAt ?? timestamps.lastSttFinalAt ?? timestamps.lastSttPartialAt;
  const intentReady = timestamps.questionIntentReadyAt ?? timestamps.intentCandidateAt;
  const committed = timestamps.questionCommittedAt;
  const requestStart = timestamps.speculativeRequestStartedAt ?? timestamps.answerRequestStartedAt;
  const firstToken = timestamps.firstAnswerTokenAt;
  const firstUseful = timestamps.firstUsefulAnswerAt;
  const answerCompleted = timestamps.answerCompletedAt;

  return {
    mode: timestamps.mode,
    speechEndToIntent:
      speechEnd !== undefined && intentReady !== undefined ? Math.max(0, intentReady - speechEnd) : undefined,
    speechEndToCommit:
      speechEnd !== undefined && committed !== undefined ? Math.max(0, committed - speechEnd) : undefined,
    intentToRequest:
      intentReady !== undefined && requestStart !== undefined ? Math.max(0, requestStart - intentReady) : undefined,
    intentToSpeculativeRequest:
      intentReady !== undefined && timestamps.speculativeRequestStartedAt !== undefined
        ? Math.max(0, timestamps.speculativeRequestStartedAt - intentReady)
        : undefined,
    prewarmLeadTimeMs:
      speechEnd !== undefined && timestamps.speculativeRequestStartedAt !== undefined
        ? Math.max(0, speechEnd - timestamps.speculativeRequestStartedAt)
        : undefined,
    requestToFirstToken:
      requestStart !== undefined && firstToken !== undefined ? Math.max(0, firstToken - requestStart) : undefined,
    speechEndToFirstToken:
      speechEnd !== undefined && firstToken !== undefined ? Math.max(0, firstToken - speechEnd) : undefined,
    speechEndToFirstVisibleAnswerMs:
      speechEnd !== undefined && timestamps.firstVisibleAnswerAt !== undefined
        ? Math.max(0, timestamps.firstVisibleAnswerAt - speechEnd)
        : undefined,
    speechEndToFirstUsefulAnswer:
      speechEnd !== undefined && firstUseful !== undefined ? Math.max(0, firstUseful - speechEnd) : undefined,
    questionCommitAfterAnswerStarted:
      committed !== undefined && requestStart !== undefined ? Math.max(0, committed - requestStart) : undefined,
    totalAnswerGeneration:
      requestStart !== undefined && answerCompleted !== undefined
        ? Math.max(0, answerCompleted - requestStart)
        : undefined
  };
}

/**
 * Formats metrics into the standard [INTERVIEW LATENCY] log block.
 */
export function formatPipelineMetricsLog(metrics: PipelineLatencyMetrics): string {
  const fmt = (v?: number) => (v !== undefined ? `${v} ms` : "N/A");
  const lines = ["[INTERVIEW LATENCY]"];

  if (metrics.mode) {
    lines.push(`mode: ${metrics.mode}`);
  }
  lines.push(`speechEndToIntent: ${fmt(metrics.speechEndToIntent)}`);
  if (metrics.intentToSpeculativeRequest !== undefined) {
    lines.push(`intentToSpeculativeRequest: ${fmt(metrics.intentToSpeculativeRequest)}`);
  } else {
    lines.push(`intentToRequest: ${fmt(metrics.intentToRequest)}`);
  }
  if (metrics.prewarmLeadTimeMs !== undefined) {
    lines.push(`prewarmLeadTimeMs: ${fmt(metrics.prewarmLeadTimeMs)}`);
  }
  if (metrics.speechEndToCommit !== undefined) {
    lines.push(`speechEndToCommit: ${fmt(metrics.speechEndToCommit)}`);
  }
  lines.push(`requestToFirstToken: ${fmt(metrics.requestToFirstToken)}`);
  lines.push(`speechEndToFirstToken: ${fmt(metrics.speechEndToFirstToken)}`);
  lines.push(`speechEndToFirstVisibleAnswerMs: ${fmt(metrics.speechEndToFirstVisibleAnswerMs)}`);
  lines.push(`speechEndToFirstUsefulAnswer: ${fmt(metrics.speechEndToFirstUsefulAnswer)}`);
  if (metrics.questionCommitAfterAnswerStarted !== undefined && metrics.mode?.startsWith("speculative")) {
    lines.push(`questionCommitAfterAnswerStarted: ${fmt(metrics.questionCommitAfterAnswerStarted)}`);
  }
  lines.push(`totalAnswerGeneration: ${fmt(metrics.totalAnswerGeneration)}`);

  return lines.join("\n");
}

/**
 * Determines if text contains a readable, meaningful answer fragment
 * that allows an interviewee to start answering.
 *
 * Excludes:
 * - JSON syntax: {, }, [, ], quotes, colons, commas
 * - JSON keys: "openingLine", "bullets", "keywords"
 * - Markdown fence markers: ```json, ```
 * - Empty strings, pure whitespace, or single punctuation
 */
export function extractFirstUsefulAnswer(
  input: string | Partial<SuggestedAnswer> | undefined
): string | undefined {
  if (!input) {
    return undefined;
  }

  // 1. If object provided
  if (typeof input === "object") {
    const opening = input.openingLine?.trim();
    if (opening && isValidAnswerText(opening)) {
      return opening;
    }
    if (input.bullets && input.bullets.length > 0) {
      const firstBullet = input.bullets[0]?.trim();
      if (firstBullet && isValidAnswerText(firstBullet)) {
        return firstBullet;
      }
    }
    return undefined;
  }

  // 2. If raw string provided
  const text = input.trim();
  if (!text) {
    return undefined;
  }

  // Check if string is raw JSON or partial JSON
  // If it starts with JSON structure, strip syntax keys
  const cleaned = text
    .replace(/^```(?:json)?/gi, "")
    .replace(/```$/g, "")
    .replace(/[{}[\]"]/g, "")
    .replace(/\b(?:openingLine|bullets|keywords|confidence)\s*:/gi, "")
    .trim();

  if (isValidAnswerText(cleaned)) {
    return cleaned;
  }

  return undefined;
}

function isValidAnswerText(text: string): boolean {
  const stripped = text.replace(/^[,\s:\-•*"\\]+/, "").replace(/[,\s:\-•*"\\]+$/, "").trim();
  // Must have at least 4 letters/word characters to be a readable phrase, not just syntax debris
  const letterCount = (stripped.match(/[\p{L}\p{N}]/gu) || []).length;
  if (letterCount < 4) {
    return false;
  }
  // Disallow common JSON keys or pure formatting strings
  const forbiddenPhrases = [
    "openingline",
    "bullets",
    "keywords",
    "confidence",
    "json",
    "null",
    "undefined"
  ];
  if (forbiddenPhrases.includes(stripped.toLowerCase())) {
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Strict Turn Isolation & Manual Answer Telemetry
// ---------------------------------------------------------------------------

export interface TurnCreatedLogPayload {
  turnId: string;
  timestamp: number;
  hash: string;
}

export interface TurnCommittedLogPayload {
  turnId: string;
  questionText: string;
  intent: string;
  questionShape: string;
  hash: string;
  parentTurnId?: string;
}

export interface ManualAnswerRequestedLogPayload {
  turnId: string;
  requestId?: string;
  requestedAt: number;
  questionHash?: string;
}

export interface AnswerContextBuiltLogPayload {
  turnId: string;
  requestId?: string;
  entityCount: number;
  factCount: number;
  parentTurnId?: string;
  inheritedIntent?: string;
}

export interface GeminiRequestStartedLogPayload {
  turnId: string;
  requestId: string;
  model: string;
  provider: string;
  questionHash?: string;
}

export interface GeminiResponseReceivedLogPayload {
  turnId: string;
  requestId: string;
  status: string;
  elapsedMs: number;
}

export interface AnswerAttachedToTurnLogPayload {
  turnId: string;
  requestId: string;
  attachedTurnId: string;
  match: boolean;
}

function shouldLogTurnTelemetry(): boolean {
  if (typeof process !== "undefined" && process.env?.NODE_ENV === "test") {
    return false;
  }
  return true;
}

export function logTurnCreated(payload: TurnCreatedLogPayload): void {
  if (!shouldLogTurnTelemetry()) return;
  console.log(`[TURN_CREATED]\nturnId: ${payload.turnId}\nhash: ${payload.hash}\ntimestamp: ${payload.timestamp}`);
}

export function logTurnCommitted(payload: TurnCommittedLogPayload): void {
  if (!shouldLogTurnTelemetry()) return;
  const lines = [
    "[TURN_COMMITTED]",
    `turnId: ${payload.turnId}`,
    `questionText: "${payload.questionText}"`,
    `intent: ${payload.intent}`,
    `questionShape: ${payload.questionShape}`,
    `hash: ${payload.hash}`
  ];
  if (payload.parentTurnId) {
    lines.push(`parentTurnId: ${payload.parentTurnId}`);
  }
  console.log(lines.join("\n"));
}

export function logManualAnswerRequested(payload: ManualAnswerRequestedLogPayload): void {
  if (!shouldLogTurnTelemetry()) return;
  const lines = [
    "[MANUAL_ANSWER_REQUESTED]",
    `turnId: ${payload.turnId}`,
    `requestedAt: ${payload.requestedAt}`
  ];
  if (payload.requestId) lines.push(`requestId: ${payload.requestId}`);
  if (payload.questionHash) lines.push(`questionHash: ${payload.questionHash}`);
  console.log(lines.join("\n"));
}

export function logAnswerContextBuilt(payload: AnswerContextBuiltLogPayload): void {
  if (!shouldLogTurnTelemetry()) return;
  const lines = [
    "[ANSWER_CONTEXT_BUILT]",
    `turnId: ${payload.turnId}`,
    `entityCount: ${payload.entityCount}`,
    `factCount: ${payload.factCount}`
  ];
  if (payload.requestId) lines.push(`requestId: ${payload.requestId}`);
  if (payload.parentTurnId) lines.push(`parentTurnId: ${payload.parentTurnId}`);
  if (payload.inheritedIntent) lines.push(`inheritedIntent: ${payload.inheritedIntent}`);
  console.log(lines.join("\n"));
}

export function logGeminiRequestStarted(payload: GeminiRequestStartedLogPayload): void {
  if (!shouldLogTurnTelemetry()) return;
  const lines = [
    "[GEMINI_REQUEST_STARTED]",
    `turnId: ${payload.turnId}`,
    `requestId: ${payload.requestId}`,
    `provider: ${payload.provider}`,
    `model: ${payload.model}`
  ];
  if (payload.questionHash) lines.push(`questionHash: ${payload.questionHash}`);
  console.log(lines.join("\n"));
}

export function logGeminiResponseReceived(payload: GeminiResponseReceivedLogPayload): void {
  if (!shouldLogTurnTelemetry()) return;
  console.log(
    `[GEMINI_RESPONSE_RECEIVED]\nturnId: ${payload.turnId}\nrequestId: ${payload.requestId}\nstatus: ${payload.status}\nelapsedMs: ${payload.elapsedMs} ms`
  );
}

export function logAnswerAttachedToTurn(payload: AnswerAttachedToTurnLogPayload): void {
  if (!shouldLogTurnTelemetry()) return;
  console.log(
    `[ANSWER_ATTACHED_TO_TURN]\nturnId: ${payload.turnId}\nrequestId: ${payload.requestId}\nattachedTurnId: ${payload.attachedTurnId}\nmatch: ${payload.match}`
  );
}

