export interface QuestionCandidate {
  text: string;
  isComplete: boolean;
  reason?: string;
}

export interface InterviewerTurn {
  segments: string[];
  fullText: string;
  startedAt: number;
  lastSpeechAt: number;
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

const setupPhrases = [
  "anh hỏi sâu hơn chút",
  "giả sử",
  "trường hợp",
  "nếu website",
  "nếu cách đó",
  "anh có một",
  "đối thủ chính",
  "vị trí trung bình",
  "impressions chỉ giảm",
  "click giảm",
  "và trường hợp",
  "ví dụ bên anh"
];

const questionIntentEndings = [
  "là gì",
  "tại sao",
  "vì sao",
  "như thế nào",
  "thế nào",
  "làm gì",
  "kiểm tra gì",
  "xử lý gì",
  "xử lý thế nào",
  "em sẽ làm gì",
  "em nghĩ sao",
  "ưu tiên cái gì",
  "dựa vào đâu",
  "bao lâu",
  "thì sao",
  "còn ... thì sao",
  "không",
  "chưa",
  "hả",
  "à",
  "được không",
  "đúng không",
  "hợp lý không"
];

const questionRequestPrefixes = [
  "em mô tả",
  "em trình bày",
  "anh muốn em",
  "cho anh biết",
  "em giải thích",
  "hãy phân tích",
  "hãy chia sẻ",
  "hãy giải thích"
];

export function isSetupFragment(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) {
    return true;
  }

  const lower = trimmed.toLowerCase();
  const words = lower
    .replace(/[.,?!:;]+$/g, "")
    .trim()
    .split(/\s+/);

  if (words.length < 3) {
    return true;
  }

  const lastWord = words[words.length - 1];
  if (incompleteConjunctions.includes(lastWord)) {
    return true;
  }

  // If text contains setup context and lacks question intent
  const containsSetupContext = setupPhrases.some((phrase) => lower.includes(phrase));
  if (containsSetupContext && !hasQuestionIntent(trimmed)) {
    return true;
  }

  return false;
}

export function hasQuestionIntent(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }

  const lower = trimmed.toLowerCase();

  // Explicit question mark at the end
  if (trimmed.endsWith("?")) {
    return true;
  }

  // Check request / imperative question prefixes
  for (const prefix of questionRequestPrefixes) {
    if (lower.includes(prefix)) {
      return true;
    }
  }

  // Check ending question intent particles / phrases
  const words = lower
    .replace(/[.,?!:;]+$/g, "")
    .trim()
    .split(/\s+/);

  const lastWord = words[words.length - 1];
  const lastTwoWords = words.slice(-2).join(" ");
  const lastThreeWords = words.slice(-3).join(" ");

  for (const ending of questionIntentEndings) {
    if (
      lastWord === ending ||
      lastTwoWords === ending ||
      lastThreeWords === ending ||
      lower.endsWith(" " + ending)
    ) {
      return true;
    }
  }

  return false;
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
  private currentTurn: InterviewerTurn = {
    segments: [],
    fullText: "",
    startedAt: Date.now(),
    lastSpeechAt: Date.now()
  };

  public CANDIDATE_PAUSE_MS = 1200; // ~800ms - 1800ms
  public HARD_TIMEOUT_MS = 2800; // ~1800ms - 3000ms

  appendSegment(segmentText: string): string {
    const trimmed = segmentText.trim();
    if (!trimmed) {
      return this.currentTurn.fullText;
    }

    if (this.currentTurn.segments.length === 0) {
      this.currentTurn.startedAt = Date.now();
    }

    // Append segment to turn buffer if not duplicate
    if (!this.currentTurn.segments.includes(trimmed)) {
      this.currentTurn.segments.push(trimmed);
    }

    // Full text combines all segments with natural punctuation / spacing
    this.currentTurn.fullText = this.currentTurn.segments.join(", ");
    this.currentTurn.lastSpeechAt = Date.now();

    return this.currentTurn.fullText;
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

    this.currentTurn.fullText = trimmed;
    this.currentTurn.lastSpeechAt = Date.now();

    // Reset timers when speech arrives
    this.clearTimers();

    // Timer 1: Candidate Pause (~1200ms)
    this.candidateTimer = window.setTimeout(() => {
      onPossibleEnd();

      // Only candidate-finalize if turn contains explicit question intent
      if (hasQuestionIntent(this.currentTurn.fullText) && !isSetupFragment(this.currentTurn.fullText)) {
        onFinalizeCandidate({
          text: this.currentTurn.fullText,
          isComplete: true,
          reason: "Question intent detected at candidate pause."
        });
        this.clearTimers();
      }
    }, this.CANDIDATE_PAUSE_MS);

    // Timer 2: Hard Timeout (~2800ms)
    this.hardTimeoutTimer = window.setTimeout(() => {
      const textToTest = this.currentTurn.fullText.trim();
      const hasIntent = hasQuestionIntent(textToTest);
      const setup = isSetupFragment(textToTest);

      // Finalize ONLY IF turn contains question intent and is not an incomplete setup fragment
      if (hasIntent && !setup) {
        onFinalizeCandidate({
          text: textToTest,
          isComplete: true,
          reason: "Hard timeout reached for complete question turn."
        });
      }
      this.clearTimers();
    }, this.HARD_TIMEOUT_MS);
  }

  getCurrentTurn(): InterviewerTurn {
    return { ...this.currentTurn };
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
    this.currentTurn = {
      segments: [],
      fullText: "",
      startedAt: Date.now(),
      lastSpeechAt: Date.now()
    };
  }
}
