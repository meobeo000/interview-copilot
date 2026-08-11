import { create } from "zustand";
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

interface CopilotState {
  status: AppStatus;
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
  const history = capHistory([completed, ...get().history]);
  writeHistory(history);
  set({ status: "Idle", history });
}

export const useCopilotStore = create<CopilotState>((set, get) => ({
  status: "Idle",
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
      liveTranscript: "",
      rawQuestion: "",
      cleanedQuestion: "",
      detectedTopic: "",
      questionConfidence: undefined,
      answer: emptyAnswer(),
      error: undefined
    });

    transcriptController = transcriptService.start({
      onPartial: (chunk) => set({ liveTranscript: chunk.text, status: "Listening" }),
      onFinal: (chunk) => {
        set({ liveTranscript: chunk.text });
        if (activeItem) {
          activeItem = { ...activeItem, rawTranscript: chunk.text, completedAt: chunk.completedAt };
        }
      },
      onError: (error) => set({ status: "Error", error: error.message }),
      onComplete: () => {
        const item = activeItem;
        if (!item?.rawTranscript) {
          set({ status: "Error", error: "Mock transcript finished without a captured question." });
          return;
        }

        set({ status: "Processing" });
        void detector
          .analyze(item.rawTranscript)
          .then((result) => {
            if (!result.isQuestion || !result.cleanedQuestion) {
              set({
                status: "Listening",
                questionConfidence: result.confidence,
                error: result.reason ?? "Question confidence is low; continuing to listen."
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
              set({ status: "Error", error: error instanceof Error ? error.message : "Mock answer stream failed." });
            });
          })
          .catch((error: unknown) => {
            set({ status: "Error", error: error instanceof Error ? error.message : "Mock detector failed." });
          });
      }
    });
  },
  pause: () => {
    transcriptController?.stop();
    transcriptController = undefined;
    set({ status: "Idle" });
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
