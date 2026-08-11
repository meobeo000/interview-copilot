export type AppStatus = "Idle" | "Listening" | "Processing" | "Answering" | "Error";

export interface ConversationItem {
  id: string;
  startedAt: number;
  completedAt?: number;
  rawTranscript: string;
  cleanedQuestion?: string;
  detectedTopic?: string;
  questionConfidence?: number;
  answer?: SuggestedAnswer;
}

export interface SuggestedAnswer {
  openingLine: string;
  bullets: string[];
  keywords: string[];
  confidence?: number;
}

export interface QuestionDetectionResult {
  isQuestion: boolean;
  confidence: number;
  cleanedQuestion?: string;
  topic?: string;
  reason?: string;
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
  onError: (error: Error) => void;
  onComplete: () => void;
}

export interface StreamController {
  stop: () => void;
}
