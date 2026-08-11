import { create } from "zustand";
import { MockAudioCapture } from "../../audio/mockAudioCapture";
import { SystemAudioCapture } from "../../audio/systemAudioCapture";
import type { AudioCapture } from "../../audio/types";
import { MockAnswerService } from "../../llm/mockAnswerService";
import type { AnswerDelta } from "../../llm/types";
import { MockQuestionDetector } from "../../question-detector/mockQuestionDetector";
import { capHistory } from "../../shared/history";
import type { AppStatus, ConversationItem, StreamController, SuggestedAnswer } from "../../shared/types";
import { MockTranscriptService } from "../../transcription/mockTranscriptService";

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
  error?: string;
  startListening: () => void;
  pause: () => void;
  regenerateAnswer: () => Promise<void>;
  hideOverlay: () => Promise<void>;
}

const transcriptService = new MockTranscriptService();
const detector = new MockQuestionDetector();
const answerService = new MockAnswerService();
const audioCapture = createAudioCapture();

let transcriptController: StreamController | undefined;
let activeItem: ConversationItem | undefined;

async function streamAnswerForItem(item: ConversationItem, set: (partial: Partial<CopilotState>) => void, get: () => CopilotState) {
  let nextAnswer = emptyAnswer();
  set({ status: "Answering", answer: nextAnswer });

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
  void audioCapture.stop();
  set({ status: "Idle", audioLevel: 0, history });
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
  error: undefined,
  startListening: () => {
    transcriptController?.stop();
    const startedAt = Date.now();
    activeItem = {
      id: crypto.randomUUID(),
      startedAt,
      rawTranscript: ""
    };

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

    void audioCapture
      .start(
        (frame) => {
          set({ audioLevel: frame.rmsLevel });
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

    transcriptController = transcriptService.start({
      onPartial: (chunk) => set({ liveTranscript: chunk.text, status: "Listening" }),
      onFinal: (chunk) => {
        set({ liveTranscript: chunk.text });
        if (activeItem) {
          activeItem = { ...activeItem, rawTranscript: chunk.text, completedAt: chunk.completedAt };
        }
      },
      onError: (error) => {
        void audioCapture.stop();
        set({ status: "Error", audioLevel: 0, error: error.message });
      },
      onComplete: () => {
        const item = activeItem;
        if (!item?.rawTranscript) {
          void audioCapture.stop();
          set({ status: "Error", audioLevel: 0, error: "Mock transcript finished without a captured question." });
          return;
        }

        set({ status: "Processing" });
        void detector
          .analyze(item.rawTranscript)
          .then((result) => {
            if (!result.isQuestion || !result.cleanedQuestion) {
              transcriptController?.stop();
              transcriptController = undefined;
              void audioCapture.stop();
              set({
                status: "Idle",
                audioLevel: 0,
                questionConfidence: result.confidence,
                error: result.reason ?? "Question confidence is low; stopped listening."
              });
              return;
            }

            const detectedItem: ConversationItem = {
              ...item,
              cleanedQuestion: result.cleanedQuestion,
              detectedTopic: result.topic,
              questionConfidence: result.confidence
            };
            activeItem = detectedItem;
            set({
              rawQuestion: detectedItem.rawTranscript,
              cleanedQuestion: detectedItem.cleanedQuestion ?? "",
              detectedTopic: detectedItem.detectedTopic ?? "",
              questionConfidence: detectedItem.questionConfidence,
              error: undefined
            });
            void streamAnswerForItem(detectedItem, set, get).catch((error: unknown) => {
              void audioCapture.stop();
              set({ status: "Error", audioLevel: 0, error: error instanceof Error ? error.message : "Mock answer stream failed." });
            });
          })
          .catch((error: unknown) => {
            void audioCapture.stop();
            set({ status: "Error", audioLevel: 0, error: error instanceof Error ? error.message : "Mock detector failed." });
          });
      }
    });
  },
  pause: () => {
    transcriptController?.stop();
    transcriptController = undefined;
    void audioCapture.stop();
    set({ status: "Idle", audioLevel: 0 });
  },
  regenerateAnswer: async () => {
    const question = activeItem;
    if (!question?.cleanedQuestion) {
      return;
    }
    await streamAnswerForItem(question, set, get);
  },
  hideOverlay: () => window.copilotWindow.hide()
}));
