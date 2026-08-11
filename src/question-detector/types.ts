import type { QuestionDetectionResult } from "../shared/types";

export interface QuestionDetector {
  analyze: (rawTranscript: string) => Promise<QuestionDetectionResult>;
}
