import type { SuggestedAnswer } from "./types";

export interface PipelineTimestamps {
  speechLastActivityAt?: number;
  lastSttPartialAt?: number;
  lastSttFinalAt?: number;
  questionIntentReadyAt?: number;
  questionCommittedAt?: number;
  answerRequestStartedAt?: number;
  firstAnswerTokenAt?: number;
  firstUsefulAnswerAt?: number;
  answerCompletedAt?: number;
}

export interface PipelineLatencyMetrics {
  speechEndToIntent?: number;
  speechEndToCommit?: number;
  intentToRequest?: number;
  requestToFirstToken?: number;
  speechEndToFirstToken?: number;
  speechEndToFirstUsefulAnswer?: number;
  totalAnswerGeneration?: number;
}

/**
 * Calculates latency deltas in milliseconds between stages of the interview pipeline.
 */
export function calculatePipelineMetrics(
  timestamps: PipelineTimestamps
): PipelineLatencyMetrics {
  const speechEnd = timestamps.speechLastActivityAt ?? timestamps.lastSttFinalAt ?? timestamps.lastSttPartialAt;
  const intentReady = timestamps.questionIntentReadyAt;
  const committed = timestamps.questionCommittedAt;
  const requestStart = timestamps.answerRequestStartedAt;
  const firstToken = timestamps.firstAnswerTokenAt;
  const firstUseful = timestamps.firstUsefulAnswerAt;
  const answerCompleted = timestamps.answerCompletedAt;

  return {
    speechEndToIntent:
      speechEnd !== undefined && intentReady !== undefined ? Math.max(0, intentReady - speechEnd) : undefined,
    speechEndToCommit:
      speechEnd !== undefined && committed !== undefined ? Math.max(0, committed - speechEnd) : undefined,
    intentToRequest:
      intentReady !== undefined && requestStart !== undefined ? Math.max(0, requestStart - intentReady) : undefined,
    requestToFirstToken:
      requestStart !== undefined && firstToken !== undefined ? Math.max(0, firstToken - requestStart) : undefined,
    speechEndToFirstToken:
      speechEnd !== undefined && firstToken !== undefined ? Math.max(0, firstToken - speechEnd) : undefined,
    speechEndToFirstUsefulAnswer:
      speechEnd !== undefined && firstUseful !== undefined ? Math.max(0, firstUseful - speechEnd) : undefined,
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
  return [
    "[INTERVIEW LATENCY]",
    `speechEndToIntent: ${fmt(metrics.speechEndToIntent)}`,
    `speechEndToCommit: ${fmt(metrics.speechEndToCommit)}`,
    `intentToRequest: ${fmt(metrics.intentToRequest)}`,
    `requestToFirstToken: ${fmt(metrics.requestToFirstToken)}`,
    `speechEndToFirstToken: ${fmt(metrics.speechEndToFirstToken)}`,
    `speechEndToFirstUsefulAnswer: ${fmt(metrics.speechEndToFirstUsefulAnswer)}`,
    `totalAnswerGeneration: ${fmt(metrics.totalAnswerGeneration)}`
  ].join("\n");
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
