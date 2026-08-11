export interface QuestionCandidate {
  text: string;
  isComplete: boolean;
  reason?: string;
}

export function isVietnameseSentenceComplete(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }

  // Clean trailing punctuation for word inspection
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

  // Incomplete trailing words / conjunctions / incomplete clause indicators
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

  if (incompleteEndings.includes(lastWord)) {
    return false;
  }

  if (incompletePhrases.some((phrase) => trimmed.toLowerCase().endsWith(phrase))) {
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
      if (this.currentText.trim().length > 0) {
        onFinalize({
          text: this.currentText,
          isComplete: isVietnameseSentenceComplete(this.currentText),
          reason: "Hard timeout silence threshold reached."
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
