import type { ConversationItem, SuggestedAnswer } from "../shared/types";

export type AnswerDelta =
  | { type: "openingLine"; value: string }
  | { type: "bullet"; value: string }
  | { type: "keywords"; value: string[] }
  | { type: "confidence"; value: number };

export interface AnswerRequest {
  question: string;
  rawTranscript: string;
  recentHistory: ConversationItem[];
}

export interface AnswerService {
  streamAnswer: (request: AnswerRequest) => AsyncGenerator<AnswerDelta, SuggestedAnswer, void>;
}
