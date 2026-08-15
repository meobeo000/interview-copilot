import { create } from "zustand";
import { MockAudioCapture } from "../../audio/mockAudioCapture";
import { SystemAudioCapture } from "../../audio/systemAudioCapture";
import type { AudioCapture, AudioFrame } from "../../audio/types";
import { ContextAwareTranscriptCorrector } from "../../corrector/contextAwareCorrector";
import { createAnswerService } from "../../llm/factory.browser";
import type { AnswerDelta } from "../../llm/types";
import type { QuestionIntent, QuestionIntentCategory } from "../../question-detector/intentClassifier";
import { type IntentCandidateEvent, SmartQuestionDetector } from "../../question-detector/smartQuestionDetector";
import { isEligibleForSpeculativeAnswer, isSpeculativeEnabled } from "../../question-detector/speculativeConfig";
import { capHistory } from "../../shared/history";
import {
  calculatePipelineMetrics,
  extractFirstUsefulAnswer,
  formatPipelineMetricsLog,
  type PipelineTimestamps
} from "../../shared/telemetry";
import type { AppStatus, ConversationItem, StreamController, SuggestedAnswer } from "../../shared/types";
import { MockTranscriptService } from "../../transcription/mockTranscriptService";
import { RealStreamingSTTService } from "../../transcription/realStreamingSTT";
import type { TranscriptionService } from "../../transcription/types";

import { parseStreamingAnswer } from "../../llm/parseAnswerJson";
import { type CandidateProfile, loadCandidateProfile, saveCandidateProfile } from "../../shared/candidateProfile";

const historyKey = "interview-copilot.history.v1";

function emptyAnswer(): SuggestedAnswer {
  return {
    openingLine: "",
    bullets: [],
    keywords: []
  };
}

function readHistory(): ConversationItem[] {
  try {
    const raw = window.localStorage.getItem(historyKey);
    if (!raw) {
      return [];
    }
    return capHistory(JSON.parse(raw) as ConversationItem[]);
  } catch {
    return [];
  }
}

function writeHistory(items: ConversationItem[]) {
  window.localStorage.setItem(historyKey, JSON.stringify(capHistory(items)));
}

function applyDelta(answer: SuggestedAnswer, delta: AnswerDelta): SuggestedAnswer {
  if (delta.type === "chunk") {
    const parsed = parseStreamingAnswer(delta.accumulatedText);
    return {
      ...answer,
      openingLine: parsed.openingLine || answer.openingLine,
      bullets: parsed.bullets.length > 0 ? parsed.bullets : answer.bullets,
      keywords: parsed.keywords.length > 0 ? parsed.keywords : answer.keywords,
      streamingText: undefined
    };
  }

  if (delta.type === "finalAnswer") {
    return {
      openingLine: delta.answer.openingLine,
      bullets: delta.answer.bullets,
      keywords: delta.answer.keywords,
      confidence: delta.answer.confidence,
      streamingText: undefined
    };
  }

  if (delta.type === "openingLine") {
    return { ...answer, openingLine: delta.value };
  }

  if (delta.type === "bullet") {
    return { ...answer, bullets: [...answer.bullets, delta.value] };
  }

  if (delta.type === "keywords") {
    return { ...answer, keywords: delta.value };
  }

  return { ...answer, confidence: delta.value };
}

function createAudioCapture(): AudioCapture {
  if (typeof window !== "undefined" && typeof window.copilotWindow?.getDesktopSourceId === "function") {
    return new SystemAudioCapture();
  }
  return new MockAudioCapture();
}

function createTranscriptService(): TranscriptionService & {
  sendAudio?: (frame: AudioFrame) => void;
  resetTurn?: () => void;
} {
  if (typeof import.meta !== "undefined" && import.meta.env?.VITE_USE_MOCK_STT === "true") {
    return new MockTranscriptService();
  }
  return new RealStreamingSTTService();
}

interface CopilotState {
  status: AppStatus;
  audioLevel: number;
  liveTranscript: string;
  rawQuestion: string;
  cleanedQuestion: string;
  detectedTopic: string;
  questionConfidence?: number;
  intentCandidate?: IntentCandidateEvent;
  answer: SuggestedAnswer;
  history: ConversationItem[];
  isHistoryOpen: boolean;
  candidateProfile: import("../../shared/candidateProfile").CandidateProfile;
  isProfileOpen: boolean;
  isContentProtected: boolean;
  error?: string;
  startListening: () => void;
  pause: () => void;
  finalizeQuestionNow: () => void;
  toggleHistoryDrawer: () => void;
  setHistoryOpen: (open: boolean) => void;
  setProfileOpen: (open: boolean) => void;
  updateProfile: (profile: import("../../shared/candidateProfile").CandidateProfile) => void;
  toggleContentProtection: () => Promise<void>;
  regenerateAnswer: () => Promise<void>;
  triggerDevDirectQuestion: (questionText?: string) => Promise<void>;
  hideOverlay: () => Promise<void>;
}

interface ActiveSpeculativeRequest {
  requestId: string;
  intentCategory: QuestionIntentCategory;
  normalizedQuestion: string;
  rawTranscript: string;
  startedAt: number;
  abortController: AbortController;
  status: "streaming" | "completed" | "aborted";
  answer: SuggestedAnswer;
  timestamps: PipelineTimestamps;
}

const answerService = createAnswerService();
const audioCapture = createAudioCapture();
const smartDetector = new SmartQuestionDetector();
const corrector = new ContextAwareTranscriptCorrector();

let activeTranscriptService:
  | (TranscriptionService & { sendAudio?: (frame: AudioFrame) => void; resetTurn?: () => void })
  | undefined;
let transcriptController: StreamController | undefined;
let activeItem: ConversationItem | undefined;
let activeSpeculative: ActiveSpeculativeRequest | undefined;
let graceWindowTimer: number | undefined;
let rawTurnSpeechBuffer = "";
let correctedTurnSpeechBuffer = "";

// Real-time telemetry tracking buffers
let turnSpeechLastActivityAt: number | undefined;
let turnLastSttPartialAt: number | undefined;
let turnLastSttFinalAt: number | undefined;
let turnQuestionIntentReadyAt: number | undefined;
let latestIntentCandidate: QuestionIntent | undefined;

function clearGraceWindow() {
  if (graceWindowTimer !== undefined) {
    window.clearTimeout(graceWindowTimer);
    graceWindowTimer = undefined;
  }
}

function resetTurnTelemetry() {
  turnSpeechLastActivityAt = undefined;
  turnLastSttPartialAt = undefined;
  turnLastSttFinalAt = undefined;
  turnQuestionIntentReadyAt = undefined;
  latestIntentCandidate = undefined;
}

function abortActiveSpeculative() {
  if (activeSpeculative) {
    activeSpeculative.abortController.abort();
    activeSpeculative.status = "aborted";
    activeSpeculative = undefined;
  }
}

function handleTranscriptUpdate(
  rawText: string,
  set: (partial: Partial<CopilotState>) => void,
  get: () => CopilotState
) {
  rawTurnSpeechBuffer = rawText;
  const correctionResult = corrector.correct(rawText, { domain: "seo_igaming_interview" });
  correctedTurnSpeechBuffer = correctionResult.correctedText;

  const currentStatus = get().status;

  // Speech resumed during Grace Window: reopen candidate question and append speech
  if (currentStatus === "FinalizingQuestion" || currentStatus === "PossibleEnd") {
    clearGraceWindow();
    set({ status: "Listening", liveTranscript: correctedTurnSpeechBuffer });
  } else if (currentStatus !== "Answering") {
    set({ liveTranscript: correctedTurnSpeechBuffer });
  }

  // While answering committed or speculative answer, accumulate speech for next turn without triggering turn detection
  if (currentStatus === "Answering") {
    return;
  }

  evaluateAccumulatedTurn(set, get);
}

function evaluateAccumulatedTurn(
  set: (partial: Partial<CopilotState>) => void,
  get: () => CopilotState
) {
  const currentStatus = get().status;
  if (currentStatus === "Answering" || !correctedTurnSpeechBuffer.trim()) {
    return;
  }

  smartDetector.updateTurn(
    correctedTurnSpeechBuffer,
    () => {
      if (get().status === "Listening") {
        set({ status: "PossibleEnd" });
      }
    },
    (candidate) => {
      if (candidate.intent) {
        latestIntentCandidate = candidate.intent;
      }
      startGraceWindow(candidate.text, set, get);
    },
    (candidateEvent) => {
      // Record candidate intent timestamp for telemetry and speculative candidate hooks
      turnQuestionIntentReadyAt = candidateEvent.readyAt;
      latestIntentCandidate = candidateEvent.intent;
      set({ intentCandidate: candidateEvent });

      // PHASE 2 SPECULATIVE ANSWERING TRIGGER
      if (isSpeculativeEnabled() && isEligibleForSpeculativeAnswer(candidateEvent.intent, candidateEvent.text)) {
        handleSpeculativeTrigger(candidateEvent, set, get);
      }
    }
  );
}

function handleSpeculativeTrigger(
  candidateEvent: IntentCandidateEvent,
  set: (partial: Partial<CopilotState>) => void,
  get: () => CopilotState
) {
  if (get().status === "Answering") {
    return;
  }

  // Request deduplication: If active speculative request exists
  if (activeSpeculative) {
    if (activeSpeculative.status !== "aborted" && activeSpeculative.intentCategory === candidateEvent.intent.category) {
      // Same intent: Deduplicate and do nothing (re-use existing stream)
      return;
    }
    // Intent shifted: abort previous speculative request and replace with new one
    abortActiveSpeculative();
  }

  // Start new speculative stream
  startSpeculativeStream(candidateEvent, set, get);
}

function startSpeculativeStream(
  candidateEvent: IntentCandidateEvent,
  set: (partial: Partial<CopilotState>) => void,
  get: () => CopilotState
) {
  const requestId = crypto.randomUUID();
  const abortController = new AbortController();
  const startedAt = Date.now();

  const timestamps: PipelineTimestamps = {
    speechLastActivityAt: turnSpeechLastActivityAt ?? startedAt,
    lastSttPartialAt: turnLastSttPartialAt,
    lastSttFinalAt: turnLastSttFinalAt,
    intentCandidateAt: candidateEvent.readyAt,
    questionIntentReadyAt: candidateEvent.readyAt,
    speculativeRequestStartedAt: startedAt,
    answerRequestStartedAt: startedAt,
    mode: "speculativeReused"
  };

  const req: ActiveSpeculativeRequest = {
    requestId,
    intentCategory: candidateEvent.intent.category,
    normalizedQuestion: candidateEvent.text,
    rawTranscript: rawTurnSpeechBuffer.trim() || candidateEvent.text,
    startedAt,
    abortController,
    status: "streaming",
    answer: emptyAnswer(),
    timestamps
  };

  activeSpeculative = req;

  // Stream directly into answer panel without "speculative" badge
  set({
    status: "Answering",
    answer: emptyAnswer(),
    rawQuestion: req.rawTranscript,
    cleanedQuestion: req.normalizedQuestion,
    detectedTopic: candidateEvent.intent.category
  });

  void (async () => {
    let nextAnswer = emptyAnswer();
    try {
      const generator = answerService.streamAnswer({
        questionId: requestId,
        question: req.normalizedQuestion,
        rawTranscript: req.rawTranscript,
        questionCommittedAt: startedAt,
        speechLastActivityAt: timestamps.speechLastActivityAt,
        questionIntentReadyAt: timestamps.questionIntentReadyAt,
        recentHistory: get().history.slice(0, 5),
        profile: get().candidateProfile,
        signal: abortController.signal
      });

      for await (const delta of generator) {
        if (activeSpeculative?.requestId !== requestId || abortController.signal.aborted) {
          break;
        }

        if (timestamps.firstAnswerTokenAt === undefined) {
          timestamps.firstAnswerTokenAt = Date.now();
        }

        nextAnswer = applyDelta(nextAnswer, delta);
        req.answer = nextAnswer;

        if (timestamps.firstUsefulAnswerAt === undefined) {
          const useful = extractFirstUsefulAnswer(nextAnswer);
          if (useful) {
            timestamps.firstUsefulAnswerAt = Date.now();
          }
        }

        if (activeSpeculative?.requestId === requestId) {
          set({ answer: nextAnswer });
        }
      }

      if (activeSpeculative?.requestId === requestId) {
        req.status = "completed";
        timestamps.answerCompletedAt = Date.now();

        // If this speculative request has been promoted to committed activeItem, finalize history
        if (activeItem && activeItem.id === requestId) {
          finalizeCommittedItem(activeItem, nextAnswer, set, get);
        }
      }
    } catch {
      if (abortController.signal.aborted || activeSpeculative?.requestId !== requestId) {
        return;
      }
      req.status = "aborted";
    }
  })();
}

function startGraceWindow(
  questionText: string,
  set: (partial: Partial<CopilotState>) => void,
  get: () => CopilotState
) {
  const text = questionText.trim();
  if (!text || get().status === "FinalizingQuestion") {
    return;
  }

  clearGraceWindow();
  set({ status: "FinalizingQuestion" });

  // Grace Window (~1.8 seconds) to allow interviewer speech resumption
  graceWindowTimer = window.setTimeout(() => {
    commitQuestion(text, set, get);
  }, 1800);
}

function commitQuestion(
  questionText: string,
  set: (partial: Partial<CopilotState>) => void,
  get: () => CopilotState
) {
  clearGraceWindow();
  const correctedText = questionText.trim();
  if (!correctedText) {
    return;
  }

  const commitTime = Date.now();
  const rawText = rawTurnSpeechBuffer.trim() || correctedText;
  rawTurnSpeechBuffer = "";
  correctedTurnSpeechBuffer = "";

  // 1. Reset smart detector
  smartDetector.reset();

  // 2. Clear current turn buffer on STT service while keeping WebSocket session alive
  if (typeof activeTranscriptService?.resetTurn === "function") {
    activeTranscriptService.resetTurn();
  }

  // 3. Clear liveTranscript for the new turn
  set({
    liveTranscript: ""
  });

  const finalIntent = smartDetector.detectIntent(correctedText, rawText);

  // Check if we can REUSE the active speculative request
  const canReuseSpeculative =
    isSpeculativeEnabled() &&
    activeSpeculative !== undefined &&
    activeSpeculative.status !== "aborted" &&
    (activeSpeculative.intentCategory === finalIntent.category ||
      finalIntent.category === "STRATEGY_PLAN" ||
      finalIntent.category === "UNKNOWN");

  if (canReuseSpeculative && activeSpeculative) {
    const spec = activeSpeculative;
    spec.timestamps.questionCommittedAt = commitTime;
    spec.timestamps.mode = "speculativeReused";

    const newItem: ConversationItem = {
      id: spec.requestId,
      startedAt: spec.startedAt,
      rawTranscript: rawText,
      correctedTranscript: correctedText,
      cleanedQuestion: correctedText,
      detectedTopic: spec.intentCategory !== "UNKNOWN" ? spec.intentCategory : "Vietnamese SEO Question",
      intent: finalIntent.category !== "UNKNOWN" ? finalIntent : latestIntentCandidate,
      answerProvider: answerService.providerName,
      answerModel: answerService.modelName,
      answer: spec.answer,
      timestamps: spec.timestamps
    };

    activeItem = newItem;
    resetTurnTelemetry();

    // If speculative stream already finished before commit, record to history and finish turn
    if (spec.status === "completed") {
      finalizeCommittedItem(newItem, spec.answer, set, get);
    } else {
      // If still streaming, set activeItem; the streaming loop will finalize on completion
      set({
        status: "Answering",
        rawQuestion: newItem.rawTranscript,
        cleanedQuestion: newItem.cleanedQuestion,
        detectedTopic: newItem.detectedTopic
      });
    }
    return;
  }

  // Otherwise: Cancel any stale speculative request and start fresh stream
  const wasSpeculativeAborted = activeSpeculative !== undefined;
  abortActiveSpeculative();

  const timestamps: PipelineTimestamps = {
    speechLastActivityAt: turnSpeechLastActivityAt ?? commitTime,
    lastSttPartialAt: turnLastSttPartialAt,
    lastSttFinalAt: turnLastSttFinalAt,
    questionIntentReadyAt: turnQuestionIntentReadyAt ?? commitTime,
    questionCommittedAt: commitTime,
    mode: wasSpeculativeAborted ? "speculativeReplaced" : "normalCommitted"
  };

  const newItem: ConversationItem = {
    id: crypto.randomUUID(),
    startedAt: commitTime,
    rawTranscript: rawText,
    correctedTranscript: correctedText,
    cleanedQuestion: correctedText,
    detectedTopic: finalIntent.category !== "UNKNOWN" ? finalIntent.category : "Vietnamese SEO Question",
    intent: finalIntent,
    answerProvider: answerService.providerName,
    answerModel: answerService.modelName,
    timestamps
  };
  activeItem = newItem;

  resetTurnTelemetry();

  void streamAnswerForItem(newItem, set, get).catch((error: unknown) => {
    set({
      status: "Error",
      error: error instanceof Error ? error.message : "Answer stream failed."
    });
  });
}

function finalizeCommittedItem(
  item: ConversationItem,
  finalAnswer: SuggestedAnswer,
  set: (partial: Partial<CopilotState>) => void,
  get: () => CopilotState
) {
  const completedAt = Date.now();
  if (item.timestamps) {
    item.timestamps.answerCompletedAt = completedAt;
    if (item.timestamps.firstUsefulAnswerAt === undefined) {
      item.timestamps.firstUsefulAnswerAt = completedAt;
    }
    if (item.timestamps.firstAnswerTokenAt === undefined) {
      item.timestamps.firstAnswerTokenAt = completedAt;
    }
    const metrics = calculatePipelineMetrics(item.timestamps);
    if (answerService.providerName !== "gemini") {
      console.log(formatPipelineMetricsLog(metrics));
    }
  }

  const completed: ConversationItem = {
    ...item,
    answer: finalAnswer,
    completedAt
  };

  const currentHistory = get().history;
  const existingIndex = currentHistory.findIndex((h) => h.id === completed.id);
  let nextHistory: ConversationItem[];
  if (existingIndex >= 0) {
    nextHistory = [...currentHistory];
    nextHistory[existingIndex] = completed;
  } else {
    nextHistory = [completed, ...currentHistory];
  }

  const history = capHistory(nextHistory);
  writeHistory(history);

  activeSpeculative = undefined;
  activeItem = undefined;

  set({ status: "Listening", history });

  if (correctedTurnSpeechBuffer.trim()) {
    evaluateAccumulatedTurn(set, get);
  }
}

async function streamAnswerForItem(
  item: ConversationItem,
  set: (partial: Partial<CopilotState>) => void,
  get: () => CopilotState
) {
  let nextAnswer = emptyAnswer();
  set({
    status: "Answering",
    answer: nextAnswer,
    rawQuestion: item.rawTranscript,
    cleanedQuestion: item.cleanedQuestion ?? item.rawTranscript,
    detectedTopic: item.detectedTopic ?? "SEO Question"
  });

  const timestamps: PipelineTimestamps = {
    ...item.timestamps,
    answerRequestStartedAt: Date.now()
  };

  let hasError = false;
  try {
    const generator = answerService.streamAnswer({
      questionId: item.id,
      question: item.cleanedQuestion ?? item.rawTranscript,
      rawTranscript: item.rawTranscript,
      questionCommittedAt: item.timestamps?.questionCommittedAt ?? item.startedAt,
      speechLastActivityAt: item.timestamps?.speechLastActivityAt,
      questionIntentReadyAt: item.timestamps?.questionIntentReadyAt,
      recentHistory: get().history.slice(0, 5),
      profile: get().candidateProfile
    });

    for await (const delta of generator) {
      // Ownership check: if activeItem changed to a new question during streaming, do not overwrite state with stale chunks!
      if (activeItem?.id !== item.id) {
        break;
      }

      if (timestamps.firstAnswerTokenAt === undefined) {
        timestamps.firstAnswerTokenAt = Date.now();
      }

      nextAnswer = applyDelta(nextAnswer, delta);

      if (timestamps.firstUsefulAnswerAt === undefined) {
        const useful = extractFirstUsefulAnswer(nextAnswer);
        if (useful) {
          timestamps.firstUsefulAnswerAt = Date.now();
        }
      }

      set({ answer: nextAnswer });
    }
  } catch (error) {
    hasError = true;
    const errorMsg = error instanceof Error ? error.message : String(error);
    if (activeItem?.id === item.id) {
      set({
        status: "Error",
        error: `Answer generation failed: ${errorMsg}`
      });
    }
  }

  if (hasError) {
    // Do NOT write an empty successful answer item to history on error!
    if (correctedTurnSpeechBuffer.trim()) {
      evaluateAccumulatedTurn(set, get);
    }
    return;
  }

  finalizeCommittedItem({ ...item, timestamps }, nextAnswer, set, get);
}

export const useCopilotStore = create<CopilotState>((set, get) => ({
  status: "Idle",
  audioLevel: 0,
  liveTranscript: "",
  rawQuestion: "",
  cleanedQuestion: "",
  detectedTopic: "",
  questionConfidence: undefined,
  intentCandidate: undefined,
  answer: emptyAnswer(),
  history: readHistory(),
  isHistoryOpen: false,
  candidateProfile: loadCandidateProfile(),
  isProfileOpen: false,
  isContentProtected: true,
  error: undefined,
  startListening: () => {
    transcriptController?.stop();
    clearGraceWindow();
    abortActiveSpeculative();
    smartDetector.reset();
    resetTurnTelemetry();

    activeItem = undefined;
    rawTurnSpeechBuffer = "";
    correctedTurnSpeechBuffer = "";

    set({
      status: "Listening",
      audioLevel: 0,
      liveTranscript: "",
      rawQuestion: "",
      cleanedQuestion: "",
      detectedTopic: "",
      questionConfidence: undefined,
      intentCandidate: undefined,
      answer: emptyAnswer(),
      error: undefined
    });

    activeTranscriptService = createTranscriptService();

    void audioCapture
      .start(
        (frame) => {
          turnSpeechLastActivityAt = frame.capturedAt || Date.now();
          set({ audioLevel: frame.rmsLevel });
          if (typeof activeTranscriptService?.sendAudio === "function") {
            activeTranscriptService.sendAudio(frame);
          }
        },
        (err) => {
          transcriptController?.stop();
          transcriptController = undefined;
          set({
            status: "Error",
            audioLevel: 0,
            error: `Audio stream error: ${err.message}`
          });
        }
      )
      .catch((err: unknown) => {
        transcriptController?.stop();
        transcriptController = undefined;
        set({
          status: "Error",
          audioLevel: 0,
          error: `Audio capture failed: ${err instanceof Error ? err.message : String(err)}`
        });
      });

    transcriptController = activeTranscriptService.start({
      onPartial: (chunk) => {
        turnLastSttPartialAt = Date.now();
        turnSpeechLastActivityAt = turnLastSttPartialAt;
        handleTranscriptUpdate(chunk.text, set, get);
      },
      onFinal: (chunk) => {
        turnLastSttFinalAt = Date.now();
        turnSpeechLastActivityAt = turnLastSttFinalAt;
        handleTranscriptUpdate(chunk.text, set, get);
      },
      onError: (error) => {
        void audioCapture.stop();
        set({ status: "Error", audioLevel: 0, error: error.message });
      },
      onComplete: () => {
        const item = activeItem;
        if (!item?.rawTranscript) {
          void audioCapture.stop();
          set({ status: "Error", audioLevel: 0, error: "Transcript finished without a question." });
          return;
        }
      }
    });
  },
  pause: () => {
    clearGraceWindow();
    abortActiveSpeculative();
    smartDetector.reset();
    resetTurnTelemetry();
    transcriptController?.stop();
    transcriptController = undefined;
    activeTranscriptService = undefined;
    rawTurnSpeechBuffer = "";
    correctedTurnSpeechBuffer = "";
    void audioCapture.stop();
    set({ status: "Idle", audioLevel: 0, intentCandidate: undefined });
  },
  finalizeQuestionNow: () => {
    const text = get().liveTranscript.trim();
    if (!text) {
      return;
    }
    commitQuestion(text, set, get);
  },
  toggleHistoryDrawer: () => set((state) => ({ isHistoryOpen: !state.isHistoryOpen })),
  setHistoryOpen: (open: boolean) => set({ isHistoryOpen: open }),
  setProfileOpen: (open: boolean) => set({ isProfileOpen: open }),
  updateProfile: (profile: CandidateProfile) => {
    saveCandidateProfile(profile);
    set({ candidateProfile: profile });
  },
  toggleContentProtection: async () => {
    const nextState = !get().isContentProtected;
    if (typeof window !== "undefined" && window.copilotWindow?.setContentProtection) {
      await window.copilotWindow.setContentProtection(nextState);
    }
    set({ isContentProtected: nextState });
  },
  regenerateAnswer: async () => {
    const question = activeItem;
    if (!question?.cleanedQuestion) {
      return;
    }
    await streamAnswerForItem(question, set, get);
  },
  triggerDevDirectQuestion: async (questionText = "Site mở bot hai tuần vẫn chưa nhận keyword thì em xử lý thế nào?") => {
    clearGraceWindow();
    abortActiveSpeculative();
    smartDetector.reset();
    resetTurnTelemetry();

    const rawText = questionText;
    const correctionResult = corrector.correct(rawText, { domain: "seo_igaming_interview" });
    const correctedText = correctionResult.correctedText;
    const finalIntent = smartDetector.detectIntent(correctedText, rawText);
    const commitTime = Date.now();

    const newItem: ConversationItem = {
      id: crypto.randomUUID(),
      startedAt: commitTime,
      rawTranscript: rawText,
      correctedTranscript: correctedText,
      cleanedQuestion: correctedText,
      detectedTopic: finalIntent.category !== "UNKNOWN" ? finalIntent.category : "Vietnamese SEO Question",
      intent: finalIntent,
      answerProvider: answerService.providerName,
      answerModel: answerService.modelName,
      timestamps: {
        speechLastActivityAt: commitTime,
        questionIntentReadyAt: commitTime,
        questionCommittedAt: commitTime,
        mode: "normalCommitted"
      }
    };

    activeItem = newItem;
    await streamAnswerForItem(newItem, set, get);
  },
  hideOverlay: () => window.copilotWindow.hide()
}));
