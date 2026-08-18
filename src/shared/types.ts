import type { PipelineTimestamps } from "./telemetry";
import type { QuestionIntent } from "../question-detector/intentClassifier";

export type AppStatus =
  | "Idle"
  | "Listening"
  | "PossibleEnd"
  | "FinalizingQuestion"
  | "QuestionReady"
  | "Processing"
  | "Answering"
  | "Error";

export interface ConversationItem {
  id: string;
  startedAt: number;
  completedAt?: number;
  rawTranscript: string;
  correctedTranscript?: string;
  cleanedQuestion?: string;
  detectedTopic?: string;
  questionConfidence?: number;
  answer?: SuggestedAnswer;
  answerProvider?: string;
  answerModel?: string;
  intent?: QuestionIntent;
  contract?: import("../llm/answerContract").AnswerContract;
  followUpContext?: import("../question-detector/interviewTurnContext").ResolvedFollowUpContext;
  timestamps?: PipelineTimestamps;
  providerStatus?: "SUCCESS" | "RATE_LIMIT" | "TIMEOUT" | "NETWORK_ERROR" | "STREAM_ERROR";
  answerSource?: "GEMINI" | "SAFE_FALLBACK";
  fallbackReason?: string;
}

export interface SuggestedAnswer {
  openingLine: string;
  bullets: string[];
  keywords: string[];
  confidence?: number;
  streamingText?: string;
  providerStatus?: "SUCCESS" | "RATE_LIMIT" | "TIMEOUT" | "NETWORK_ERROR" | "STREAM_ERROR";
  answerSource?: "GEMINI" | "SAFE_FALLBACK";
  fallbackReason?: string;
}

export interface QuestionDetectionResult {
  isQuestion: boolean;
  confidence: number;
  cleanedQuestion?: string;
  topic?: string;
  reason?: string;
  intent?: QuestionIntent;
}

export interface TranscriptChunk {
  text: string;
  isFinal: boolean;
  confidence?: number;
  startedAt: number;
  completedAt?: number;
}

export interface TranscriptCallbacks {
  onPartial: (chunk: TranscriptChunk) => void;
  onFinal: (chunk: TranscriptChunk) => void;
  onSpeechFinal?: (chunk: TranscriptChunk) => void;
  onError: (error: Error) => void;
  onComplete: () => void;
}

export interface StreamController {
  stop: () => void;
}
