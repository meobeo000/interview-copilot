import { create } from "zustand";
import { MockAudioCapture } from "../../audio/mockAudioCapture";
import { SystemAudioCapture } from "../../audio/systemAudioCapture";
import type { AudioCapture, AudioFrame } from "../../audio/types";
import { ContextAwareTranscriptCorrector } from "../../corrector/contextAwareCorrector";
import { createAnswerService } from "../../llm/factory.browser";
import type { AnswerDelta } from "../../llm/types";
import { SmartQuestionDetector } from "../../question-detector/smartQuestionDetector";
import { capHistory } from "../../shared/history";
import type { AppStatus, ConversationItem, StreamController, SuggestedAnswer } from "../../shared/types";
import { MockTranscriptService } from "../../transcription/mockTranscriptService";
import { RealStreamingSTTService } from "../../transcription/realStreamingSTT";
import type { TranscriptionService } from "../../transcription/types";

import { parsePartialAnswerJson } from "../../llm/parseAnswerJson";

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
    const parsed = parsePartialAnswerJson(delta.accumulatedText);
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
  answer: SuggestedAnswer;
  history: ConversationItem[];
  isHistoryOpen: boolean;
  error?: string;
  startListening: () => void;
  pause: () => void;
  finalizeQuestionNow: () => void;
  toggleHistoryDrawer: () => void;
  setHistoryOpen: (open: boolean) => void;
  regenerateAnswer: () => Promise<void>;
  hideOverlay: () => Promise<void>;
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
let graceWindowTimer: number | undefined;
let rawTurnSpeechBuffer = "";
let correctedTurnSpeechBuffer = "";

function clearGraceWindow() {
  if (graceWindowTimer !== undefined) {
    window.clearTimeout(graceWindowTimer);
    graceWindowTimer = undefined;
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
  } else {
    set({ liveTranscript: correctedTurnSpeechBuffer });
  }

  // While answering, accumulate speech for next turn without triggering turn detection
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
      startGraceWindow(candidate.text, set, get);
    }
  );
}

function startGraceWindow(
  questionText: string,
  set: (partial: Partial<CopilotState>) => void,
  get: () => CopilotState
) {
  const text = questionText.trim();
  if (!text || get().status === "FinalizingQuestion" || get().status === "Answering") {
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

  // 4. Create single committed conversation item for the entire turn
  const newItem: ConversationItem = {
    id: crypto.randomUUID(),
    startedAt: Date.now(),
    rawTranscript: rawText,
    correctedTranscript: correctedText,
    cleanedQuestion: correctedText,
    detectedTopic: "Vietnamese SEO Question",
    answerProvider: answerService.providerName,
    answerModel: answerService.modelName
  };
  activeItem = newItem;

  // 5. Stream answer for committed question
  void streamAnswerForItem(newItem, set, get).catch((error: unknown) => {
    set({
      status: "Error",
      error: error instanceof Error ? error.message : "Answer stream failed."
    });
  });
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

  let hasError = false;
  try {
    const generator = answerService.streamAnswer({
      questionId: item.id,
      question: item.cleanedQuestion ?? item.rawTranscript,
      rawTranscript: item.rawTranscript,
      questionCommittedAt: item.startedAt,
      recentHistory: get().history.slice(0, 5)
    });

    for await (const delta of generator) {
      // Ownership check: if activeItem changed to a new question during streaming, do not overwrite state with stale chunks!
      if (activeItem?.id !== item.id) {
        break;
      }
      nextAnswer = applyDelta(nextAnswer, delta);
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

  const completed: ConversationItem = {
    ...item,
    answer: nextAnswer,
    completedAt: Date.now()
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

  if (activeItem?.id === item.id) {
    activeItem = completed;
    // Transition back to Listening state if no error
    if (get().status === "Answering") {
      set({ status: "Listening", history });
    }
  }

  // Evaluate any speech collected during answer streaming for the next turn
  if (correctedTurnSpeechBuffer.trim()) {
    evaluateAccumulatedTurn(set, get);
  }
}

export const useCopilotStore = create<CopilotState>((set, get) => ({
  status: "Idle",
  audioLevel: 0,
  liveTranscript: "",
  rawQuestion: "",
  cleanedQuestion: "",
  detectedTopic: "",
  questionConfidence: undefined,
  answer: emptyAnswer(),
  history: readHistory(),
  isHistoryOpen: false,
  error: undefined,
  startListening: () => {
    transcriptController?.stop();
    clearGraceWindow();
    smartDetector.reset();

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
      answer: emptyAnswer(),
      error: undefined
    });

    activeTranscriptService = createTranscriptService();

    void audioCapture
      .start(
        (frame) => {
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
      onPartial: (chunk) => handleTranscriptUpdate(chunk.text, set, get),
      onFinal: (chunk) => handleTranscriptUpdate(chunk.text, set, get),
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
    smartDetector.reset();
    transcriptController?.stop();
    transcriptController = undefined;
    activeTranscriptService = undefined;
    rawTurnSpeechBuffer = "";
    correctedTurnSpeechBuffer = "";
    void audioCapture.stop();
    set({ status: "Idle", audioLevel: 0 });
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
  regenerateAnswer: async () => {
    const question = activeItem;
    if (!question?.cleanedQuestion) {
      return;
    }
    await streamAnswerForItem(question, set, get);
  },
  hideOverlay: () => window.copilotWindow.hide()
}));
