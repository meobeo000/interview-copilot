import type { ConversationItem, SuggestedAnswer } from "../shared/types";
import type { CandidateProfile } from "../shared/candidateProfile";
import type { QuestionIntent } from "../question-detector/intentClassifier";
import type { KnowledgeChunk } from "../knowledge/types";

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
  speechLastActivityAt?: number;
  speechEndedAt?: number;
  questionIntentReadyAt?: number;
  recentHistory?: ConversationItem[];
  profile?: CandidateProfile;
  intent?: QuestionIntent | string;
  retrievedChunks?: KnowledgeChunk[];
  knowledgeContext?: string;
  contract?: import("./answerContract").AnswerContract;
  semanticEvidence?: import("../question-detector/semanticEvidence").SemanticEvidenceState;
  followUpContext?: import("../question-detector/interviewTurnContext").ResolvedFollowUpContext;
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
