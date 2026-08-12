import { create } from "zustand";
import { MockAudioCapture } from "../../audio/mockAudioCapture";
import { SystemAudioCapture } from "../../audio/systemAudioCapture";
import type { AudioCapture, AudioFrame } from "../../audio/types";
import { ContextAwareTranscriptCorrector } from "../../corrector/contextAwareCorrector";
import { MockAnswerService } from "../../llm/mockAnswerService";
import type { AnswerDelta } from "../../llm/types";
import { SmartQuestionDetector } from "../../question-detector/smartQuestionDetector";
import { capHistory } from "../../shared/history";
import type { AppStatus, ConversationItem, StreamController, SuggestedAnswer } from "../../shared/types";
import { MockTranscriptService } from "../../transcription/mockTranscriptService";
import { RealStreamingSTTService } from "../../transcription/realStreamingSTT";
import type { TranscriptionService } from "../../transcription/types";

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

const answerService = new MockAnswerService();
const audioCapture = createAudioCapture();
const smartDetector = new SmartQuestionDetector();
const corrector = new ContextAwareTranscriptCorrector();

let activeTranscriptService:
  | (TranscriptionService & { sendAudio?: (frame: AudioFrame) => void; resetTurn?: () => void })
  | undefined;
let transcriptController: StreamController | undefined;
let activeItem: ConversationItem | undefined;
let graceWindowTimer: number | undefined;
let rawLiveTranscript = "";

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
  rawLiveTranscript = rawText;
  const correctionResult = corrector.correct(rawText, { domain: "seo_igaming_interview" });
  const correctedText = correctionResult.correctedText;

  const currentStatus = get().status;

  // Speech resumed during Grace Window: reopen candidate question and append speech
  if (currentStatus === "FinalizingQuestion" || currentStatus === "PossibleEnd") {
    clearGraceWindow();
    set({ status: "Listening", liveTranscript: correctedText });
  } else {
    set({ liveTranscript: correctedText });
  }

  // While answering, accumulate speech for next turn without triggering turn detection
  if (currentStatus === "Answering") {
    return;
  }

  smartDetector.updateTurn(
    correctedText,
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

  const rawText = rawLiveTranscript.trim() || correctedText;
  rawLiveTranscript = "";

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
    detectedTopic: "Vietnamese SEO Question"
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

  for await (const delta of answerService.streamAnswer({
    question: item.cleanedQuestion ?? item.rawTranscript,
    rawTranscript: item.rawTranscript,
    recentHistory: get().history.slice(0, 5)
  })) {
    nextAnswer = applyDelta(nextAnswer, delta);
    set({ answer: nextAnswer });
  }

  const completed: ConversationItem = {
    ...item,
    answer: nextAnswer
  };
  activeItem = completed;

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

  // Transition back to Listening state
  set({ status: "Listening", history });

  // Evaluate any speech collected during answer streaming for the next turn
  const accumulatedTurnSpeech = get().liveTranscript.trim();
  if (accumulatedTurnSpeech) {
    handleTranscriptUpdate(accumulatedTurnSpeech, set, get);
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
    rawLiveTranscript = "";

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
