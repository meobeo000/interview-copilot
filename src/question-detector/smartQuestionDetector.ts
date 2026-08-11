export interface QuestionCandidate {
  text: string;
  isComplete: boolean;
  reason?: string;
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
  /(thì sao|thế nào|như thế nào|ra sao|làm sao|kiểu gì|chia kiểu gì|ở đâu|là gì|tại sao|vì sao)$/i,

  // Ends with question particle or interrogative pronoun
  /(cái nào|con nào|bước nào|domain nào|cách nào|nào|gì|không|chưa|hả|à|ổn không|được không|đúng không)$/i,

  // Verbal question structures
  /\b(chọn|làm|bắt đầu|xử lý|chia|kiểm tra|dùng)\b.+\b(nào|gì|sao|đâu)\b/i,
  /\b(mô tả|trình bày|cho anh biết|giải thích|phân tích)\b/i
];

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,?!:;]+$/g, "")
    .replace(/(^|\s+)(ờ|ừm|hả)($|\s+)/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
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

export class SmartQuestionDetector {
  private candidateTimer: number | undefined;
  private hardTimeoutTimer: number | undefined;

  public CANDIDATE_PAUSE_MS = 1200; // ~800ms - 1800ms
  public HARD_TIMEOUT_MS = 2800; // ~1800ms - 3000ms

  /**
   * Deprecated / Internal helper for tests backward compatibility.
   * Delegates directly to current turn text evaluation.
   */
  appendSegment(segmentText: string): string {
    return segmentText.trim();
  }

  updateTurn(
    fullText: string,
    onPossibleEnd: () => void,
    onFinalizeCandidate: (candidate: QuestionCandidate) => void
  ): void {
    const trimmed = fullText.trim();
    if (!trimmed) {
      return;
    }

    // Reset timers when new speech arrives
    this.clearTimers();

    // Timer 1: Candidate Pause (~1200ms)
    this.candidateTimer = window.setTimeout(() => {
      onPossibleEnd();

      // Only candidate-finalize if turn contains explicit question intent and is not an incomplete setup fragment
      if (hasQuestionIntent(trimmed) && !isSetupFragment(trimmed)) {
        onFinalizeCandidate({
          text: trimmed,
          isComplete: true,
          reason: "Question intent detected at candidate pause."
        });
        this.clearTimers();
      }
    }, this.CANDIDATE_PAUSE_MS);

    // Timer 2: Hard Timeout (~2800ms)
    this.hardTimeoutTimer = window.setTimeout(() => {
      const hasIntent = hasQuestionIntent(trimmed);
      const setup = isSetupFragment(trimmed);

      // Finalize ONLY IF turn contains question intent and is not an incomplete setup fragment
      if (hasIntent && !setup) {
        onFinalizeCandidate({
          text: trimmed,
          isComplete: true,
          reason: "Hard timeout reached for complete question turn."
        });
      }
      this.clearTimers();
    }, this.HARD_TIMEOUT_MS);
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
  }
}
