import type { StreamController, TranscriptCallbacks } from "../shared/types";

export interface TranscriptionService {
  start: (callbacks: TranscriptCallbacks) => StreamController;
}
