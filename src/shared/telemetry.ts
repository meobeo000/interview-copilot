import type { SuggestedAnswer } from "./types";

export type LatencyPipelineMode = "speculativeReused" | "speculativeReplaced" | "normalCommitted";

export interface PipelineTimestamps {
  speechLastActivityAt?: number;
  lastSttPartialAt?: number;
  lastSttFinalAt?: number;
  questionIntentReadyAt?: number;
  intentCandidateAt?: number;
  speculativeRequestStartedAt?: number;
  questionCommittedAt?: number;
  answerRequestStartedAt?: number;
  firstAnswerTokenAt?: number;
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
  const speechEnd = timestamps.speechLastActivityAt ?? timestamps.lastSttFinalAt ?? timestamps.lastSttPartialAt;
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
    requestToFirstToken:
      requestStart !== undefined && firstToken !== undefined ? Math.max(0, firstToken - requestStart) : undefined,
    speechEndToFirstToken:
      speechEnd !== undefined && firstToken !== undefined ? Math.max(0, firstToken - speechEnd) : undefined,
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
  if (metrics.speechEndToCommit !== undefined) {
    lines.push(`speechEndToCommit: ${fmt(metrics.speechEndToCommit)}`);
  }
  lines.push(`requestToFirstToken: ${fmt(metrics.requestToFirstToken)}`);
  lines.push(`speechEndToFirstToken: ${fmt(metrics.speechEndToFirstToken)}`);
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
