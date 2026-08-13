import type { ConversationItem, SuggestedAnswer } from "../shared/types";

export type AnswerDelta =
  | { type: "chunk"; accumulatedText: string }
  | { type: "finalAnswer"; answer: SuggestedAnswer }
  | { type: "openingLine"; value: string }
  | { type: "bullet"; value: string }
  | { type: "keywords"; value: string[] }
  | { type: "confidence"; value: number };

export interface AnswerRequest {
  questionId: string;
  question: string;
  rawTranscript: string;
  questionCommittedAt?: number;
  recentHistory?: ConversationItem[];
  signal?: AbortSignal;
}

export interface AnswerService {
  providerName: string;
  modelName: string;
  streamAnswer: (request: AnswerRequest) => AsyncGenerator<AnswerDelta, SuggestedAnswer, void>;
}

export interface AnswerServiceConfig {
  provider: "groq" | "mock";
  apiKey: string;
  model: string;
}
