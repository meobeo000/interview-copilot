export interface ChangeDetail {
  from: string;
  to: string;
  reason: string;
  confidence: number;
}

export interface CorrectionResult {
  rawText: string;
  correctedText: string;
  changes: ChangeDetail[];
  confidence: number;
}

export interface CorrectorContext {
  domain?: string;
  isFinalSegment?: boolean;
}

export interface TranscriptCorrector {
  correct(input: string, context?: CorrectorContext): CorrectionResult;
}
