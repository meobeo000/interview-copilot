export interface QuestionCandidate {
  text: string;
  isComplete: boolean;
  reason?: string;
}

const incompleteEndings = [
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

const incompletePhrases = [
  "theo em nếu",
  "ví dụ bên anh",
  "trường hợp",
  "giả sử",
  "nếu website đang",
  "và trường hợp"
];

export function isIncompleteEnding(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) {
    return true;
  }

  const words = trimmed
    .replace(/[.,?!:;]+$/g, "")
    .trim()
    .toLowerCase()
    .split(/\s+/);

  if (words.length < 5) {
    return true;
  }

  const lastWord = words[words.length - 1];
  if (incompleteEndings.includes(lastWord)) {
    return true;
  }

  if (incompletePhrases.some((phrase) => trimmed.toLowerCase().endsWith(phrase))) {
    return true;
  }

  return false;
}

export function isVietnameseSentenceComplete(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }

  const words = trimmed
    .replace(/[.,?!:;]+$/g, "")
    .trim()
    .toLowerCase()
    .split(/\s+/);

  if (words.length < 3) {
    return false;
  }

  const lastWord = words[words.length - 1];
  const lastTwoWords = words.slice(-2).join(" ");
  const lastThreeWords = words.slice(-3).join(" ");

  // Explicit question mark at the end
  if (trimmed.endsWith("?")) {
    return true;
  }

  if (isIncompleteEnding(trimmed)) {
    return false;
  }

  // Complete question ending particles / words
  const questionParticles = [
    "không",
    "chưa",
    "thế nào",
    "ra sao",
    "gì",
    "sao",
    "đâu",
    "ai",
    "nào",
    "mấy",
    "bao nhiêu",
    "như thế nào",
    "tại sao",
    "làm sao",
    "được không",
    "đúng không",
    "hả",
    "à",
    "hợp lý không",
    "thì sao"
  ];

  if (
    questionParticles.includes(lastWord) ||
    questionParticles.includes(lastTwoWords) ||
    questionParticles.includes(lastThreeWords)
  ) {
    return true;
  }

  // Fallback: sentence with sufficient length (> 8 words) without trailing conjunctions
  return words.length >= 8;
}

export class SmartQuestionDetector {
  private candidateTimer: number | undefined;
  private hardTimeoutTimer: number | undefined;
  private lastSpeechTime = 0;
  private currentText = "";

  public CANDIDATE_SILENCE_MS = 1000; // ~700ms - 1500ms
  public HARD_TIMEOUT_MS = 2800; // ~2500ms - 3000ms

  updateTranscript(text: string, onPossibleEnd: () => void, onFinalize: (candidate: QuestionCandidate) => void): void {
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }

    this.currentText = trimmed;
    this.lastSpeechTime = Date.now();

    // Reset existing timers as new speech has arrived
    this.clearTimers();

    // Timer 1: Candidate End (~1000ms silence)
    this.candidateTimer = window.setTimeout(() => {
      onPossibleEnd();

      const isComplete = isVietnameseSentenceComplete(this.currentText);
      if (isComplete) {
        onFinalize({
          text: this.currentText,
          isComplete: true,
          reason: "Semantic completeness check passed after candidate silence."
        });
        this.clearTimers();
      }
    }, this.CANDIDATE_SILENCE_MS);

    // Timer 2: Hard Timeout (~2800ms silence fallback)
    this.hardTimeoutTimer = window.setTimeout(() => {
      const textToTest = this.currentText.trim();
      const isComplete = isVietnameseSentenceComplete(textToTest);
      const isExplicitlyIncomplete = isIncompleteEnding(textToTest);

      // Do NOT finalize if text is explicitly incomplete (conjunction or <5 words)
      if (textToTest.length > 0 && !isExplicitlyIncomplete) {
        onFinalize({
          text: textToTest,
          isComplete,
          reason: "Hard timeout silence threshold reached for usable content."
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
    this.currentText = "";
    this.lastSpeechTime = 0;
  }
}
