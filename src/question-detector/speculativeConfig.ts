import type { QuestionIntent } from "./intentClassifier";

export const SPECULATIVE_CONFIG = {
  MIN_CONFIDENCE: 0.85,
  MIN_WORD_COUNT: 4,
  MIN_EVIDENCE_COUNT: 1,
  DEFAULT_ENABLED: true
} as const;

export function isSpeculativeEnabled(env?: Record<string, string | undefined>): boolean {
  if (typeof import.meta !== "undefined" && import.meta.env?.VITE_SPECULATIVE_ANSWER_ENABLED !== undefined) {
    return import.meta.env.VITE_SPECULATIVE_ANSWER_ENABLED === "true";
  }
  if (env?.SPECULATIVE_ANSWER_ENABLED !== undefined) {
    return env.SPECULATIVE_ANSWER_ENABLED === "true";
  }
  if (typeof process !== "undefined" && process.env?.SPECULATIVE_ANSWER_ENABLED !== undefined) {
    return process.env.SPECULATIVE_ANSWER_ENABLED === "true";
  }
  return SPECULATIVE_CONFIG.DEFAULT_ENABLED;
}

/**
 * Gate evaluation for speculative answering.
 * Requires:
 * 1. Intent is not UNKNOWN
 * 2. Confidence >= MIN_CONFIDENCE (0.85)
 * 3. Text contains at least MIN_WORD_COUNT (4 words)
 * 4. Intent has at least MIN_EVIDENCE_COUNT (1 matching evidence item)
 */
export function isEligibleForSpeculativeAnswer(
  intent: QuestionIntent | undefined,
  text: string
): boolean {
  if (!intent || intent.category === "UNKNOWN") {
    return false;
  }

  if (intent.confidence < SPECULATIVE_CONFIG.MIN_CONFIDENCE) {
    return false;
  }

  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length < SPECULATIVE_CONFIG.MIN_WORD_COUNT) {
    return false;
  }

  if (!intent.evidence || intent.evidence.length < SPECULATIVE_CONFIG.MIN_EVIDENCE_COUNT) {
    return false;
  }

  return true;
}
