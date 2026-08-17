import type { QuestionDetectionResult } from "../shared/types";
import { classifyQuestionIntent, type QuestionIntent } from "./intentClassifier";
import { SemanticEvidenceAccumulator, type SemanticEvidenceState } from "./semanticEvidence";
import { QuestionCommitGate } from "./questionCommitGate";
import type { QuestionDetector } from "./types";

export interface QuestionCandidate {
  text: string;
  isComplete: boolean;
  reason?: string;
  intent?: QuestionIntent;
}

export interface IntentCandidateEvent {
  text: string;
  intent: QuestionIntent;
  readyAt: number;
}

const incompleteConjunctions = [
  "nếu",
  "và",
  "hoặc",
  "nhưng",
  "vì",
  "nên",
  "là",
  "rằng",
  "thì",
  "cho",
  "với",
  "bởi",
  "do",
  "như",
  "mà",
  "khi",
  "đang",
  "sẽ",
  "cần",
  "muốn"
];

const questionRegexPatterns: RegExp[] = [
  // Starts with question trigger
  /^(bao lâu|khi nào|có nên|có cần|có phải|cách nào|cách gì|tại sao|vì sao|làm sao|ở đâu)\b/i,

  // Contains specific question phrase
  /\b(bao lâu|khi nào|cách nào|cách gì)\b/i,
  /\b(có nên|có cần|có phải)\b/i,

  // Ends with question phrase/intent
  /(thì sao|thế nào|như thế nào|ra sao|làm sao|kiểu gì|chia kiểu gì|ở đâu|là gì|tại sao|vì sao|nhỉ|hả|hở)$/i,

  // Ends with question particle or interrogative pronoun
  /(cái nào|con nào|bước nào|domain nào|cách nào|nào|gì|không|chưa|hả|à|ổn không|được không|đúng không|phải không)$/i,

  // Verbal question structures
  /\b(chọn|làm|bắt đầu|xử lý|chia|kiểm tra|dùng)\b.+\b(nào|gì|sao|đâu)\b/i,
  /\b(mô tả|trình bày|cho anh biết|giải thích|phân tích|nói cho anh|chia sẻ cho anh)\b/i
];

const endOfQuestionRegex = /(\?|thì sao|thế nào|như thế nào|ra sao|làm sao|kiểu gì|ở đâu|là gì|tại sao|vì sao|cái nào|con nào|bước nào|domain nào|cách nào|nào|gì|không|chưa|hả|à|hở|nhỉ|ổn không|được không|đúng không|phải không)$/i;

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,?!:;]+$/g, "")
    .replace(/(^|\s+)(ờ|ừm|hả)($|\s+)/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function hasEndQuestionMarker(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (trimmed.endsWith("?")) return true;
  const normalized = normalizeText(trimmed);
  return endOfQuestionRegex.test(normalized) || /\b(nói cho anh|chia sẻ cho anh|giải thích cho anh|cho anh biết)\b/i.test(normalized);
}

export function hasQuestionIntent(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }

  // Explicit question mark at end
  if (trimmed.endsWith("?")) {
    return true;
  }

  const normalized = normalizeText(trimmed);
  if (!normalized) {
    return false;
  }

  for (const pattern of questionRegexPatterns) {
    if (pattern.test(normalized)) {
      return true;
    }
  }

  return false;
}

export function isSetupFragment(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) {
    return true;
  }

  const normalized = normalizeText(trimmed);
  const words = normalized.split(/\s+/);

  if (words.length < 3) {
    return true;
  }

  const lastWord = words[words.length - 1];
  if (incompleteConjunctions.includes(lastWord)) {
    return true;
  }

  // If text does not contain valid question intent, it is treated as an incomplete setup fragment
  return !hasQuestionIntent(trimmed);
}

export function isVietnameseSentenceComplete(text: string): boolean {
  if (isSetupFragment(text)) {
    return false;
  }
  return hasQuestionIntent(text);
}

export class SmartQuestionDetector implements QuestionDetector {
  private candidateTimer: number | undefined;
  private hardTimeoutTimer: number | undefined;
  private accumulator: SemanticEvidenceAccumulator;

  public CANDIDATE_PAUSE_MS = 1200;
  public HARD_TIMEOUT_MS = 2800;

  constructor() {
    this.accumulator = new SemanticEvidenceAccumulator();
  }

  /**
   * Returns current accumulated semantic evidence state for this turn.
   */
  getEvidenceState(): SemanticEvidenceState {
    return this.accumulator.getState();
  }

  /**
   * Evaluates semantic intent for the given transcript text and accumulated evidence.
   */
  detectIntent(text: string, rawTranscript?: string): QuestionIntent {
    return classifyQuestionIntent(text, rawTranscript, this.accumulator.getState());
  }

  async analyze(rawTranscript: string): Promise<QuestionDetectionResult> {
    const isQ = hasQuestionIntent(rawTranscript) && !isSetupFragment(rawTranscript);
    const intent = this.detectIntent(rawTranscript, rawTranscript);
    return {
      isQuestion: isQ,
      confidence: isQ ? 0.9 : 0.2,
      cleanedQuestion: rawTranscript.trim(),
      topic: intent.category !== "UNKNOWN" ? intent.category : "SEO Question",
      intent
    };
  }

  appendSegment(segmentText: string): string {
    return segmentText.trim();
  }

  updateTurn(
    fullText: string,
    onPossibleEnd: () => void,
    onFinalizeCandidate: (candidate: QuestionCandidate) => void,
    onIntentCandidate?: (candidate: IntentCandidateEvent) => void
  ): void {
    const trimmed = fullText.trim();
    if (!trimmed) {
      return;
    }

    // Accumulate semantic evidence progressively across STT partials
    this.accumulator.appendPartial(trimmed);

    // Reset timers when new speech arrives
    this.clearTimers();

    const isComplete = hasQuestionIntent(trimmed) && !isSetupFragment(trimmed);
    const hasEndMarker = hasEndQuestionMarker(trimmed);

    // Only emit intent candidate if the question is complete and has an end-of-question marker or explicit question structure
    if (isComplete && onIntentCandidate) {
      const intent = this.detectIntent(trimmed);
      if (intent.category !== "UNKNOWN") {
        onIntentCandidate({
          text: trimmed,
          intent,
          readyAt: Date.now()
        });
      }
    }

    // Adaptive silence: If sentence has end marker, use standard pause (~1200ms). If fragment/preamble, wait longer (~2200ms).
    const candidatePause = hasEndMarker ? this.CANDIDATE_PAUSE_MS : Math.max(this.CANDIDATE_PAUSE_MS, 2000);
    const hardTimeout = hasEndMarker ? this.HARD_TIMEOUT_MS : Math.max(this.HARD_TIMEOUT_MS, 3200);

    // Timer 1: Candidate Pause
    this.candidateTimer = window.setTimeout(() => {
      onPossibleEnd();

      // Only candidate-finalize if turn contains explicit question intent and is not an incomplete setup fragment
      if (hasQuestionIntent(trimmed) && !isSetupFragment(trimmed)) {
        const intent = this.detectIntent(trimmed);
        onFinalizeCandidate({
          text: trimmed,
          isComplete: true,
          reason: "Question intent detected at candidate pause.",
          intent
        });
        this.clearTimers();
      }
    }, candidatePause);

    // Timer 2: Hard Timeout
    this.hardTimeoutTimer = window.setTimeout(() => {
      const hasIntent = hasQuestionIntent(trimmed);
      const setup = isSetupFragment(trimmed);

      if (hasIntent && !setup) {
        const intent = this.detectIntent(trimmed);
        onFinalizeCandidate({
          text: trimmed,
          isComplete: true,
          reason: "Hard timeout reached for complete question turn.",
          intent
        });
      }
      this.clearTimers();
    }, hardTimeout);
  }

  /**
   * Immediately evaluates question finalization when a provider speech_final / endpoint signal arrives.
   */
  triggerSpeechFinal(
    fullText: string,
    onFinalizeCandidate: (candidate: QuestionCandidate) => void
  ): void {
    const trimmed = fullText.trim();
    if (!trimmed) {
      return;
    }

    this.clearTimers();
    const intent = this.detectIntent(trimmed);
    const gateEval = QuestionCommitGate.evaluate(trimmed, this.accumulator.getState(), intent);

    if (gateEval.decision === "COMMIT") {
      onFinalizeCandidate({
        text: trimmed,
        isComplete: true,
        reason: `QuestionCommitGate: ${gateEval.reason}`,
        intent
      });
    } else if (typeof process !== "undefined" && process.env?.NODE_ENV !== "test") {
      console.log(`[QUESTION COMMIT GATE] decision: ${gateEval.decision} | reason: ${gateEval.reason} | text: "${trimmed}"`);
    }
  }

  clearTimers(): void {
    if (this.candidateTimer !== undefined) {
      window.clearTimeout(this.candidateTimer);
      this.candidateTimer = undefined;
    }
    if (this.hardTimeoutTimer !== undefined) {
      window.clearTimeout(this.hardTimeoutTimer);
      this.hardTimeoutTimer = undefined;
    }
  }

  reset(): void {
    this.clearTimers();
    this.accumulator.reset();
  }
}
