import type { AudioFrame } from "../audio/types";
import type { StreamController, TranscriptCallbacks, TranscriptChunk } from "../shared/types";
import type { TranscriptionService } from "./types";
import { TurnTranscriptAssembler } from "./turnTranscriptAssembler";

export class RealStreamingSTTService implements TranscriptionService {
  private active = false;
  private readonly assembler = new TurnTranscriptAssembler();
  private startedAt = Date.now();

  start(callbacks: TranscriptCallbacks): StreamController {
    this.active = true;
    this.assembler.reset();
    this.startedAt = Date.now();

    const stt = window.copilotWindow?.stt;

    if (!stt) {
      callbacks.onError(new Error("Real STT streaming is not available in this environment."));
      return { stop: () => {} };
    }

    const unsubPartial = stt.onPartial((partialText) => {
      if (!this.active) {
        return;
      }
      const text = this.assembler.applyPartial(partialText);
      const chunk: TranscriptChunk = {
        text,
        isFinal: false,
        startedAt: this.startedAt
      };
      callbacks.onPartial(chunk);
    });

    const unsubFinal = stt.onFinal((finalText) => {
      if (!this.active) {
        return;
      }
      const text = this.assembler.applyFinal(finalText);
      const chunk: TranscriptChunk = {
        text,
        isFinal: true,
        startedAt: this.startedAt,
        completedAt: Date.now()
      };
      callbacks.onFinal(chunk);
    });

    const unsubSpeechFinal = stt.onSpeechFinal
      ? stt.onSpeechFinal((speechFinalText) => {
          if (!this.active) {
            return;
          }
          if (speechFinalText) {
            this.assembler.applyFinal(speechFinalText);
          } else {
            this.assembler.applySpeechFinal();
          }
          const text = this.assembler.getDisplayTranscript();
          const chunk: TranscriptChunk = {
            text,
            isFinal: true,
            startedAt: this.startedAt,
            completedAt: Date.now()
          };
          if (callbacks.onSpeechFinal) {
            callbacks.onSpeechFinal(chunk);
          } else {
            callbacks.onFinal(chunk);
          }
        })
      : () => {};

    const unsubError = stt.onError((errorMessage) => {
      if (!this.active) {
        return;
      }
      callbacks.onError(new Error(errorMessage));
    });

    void stt.startSession().catch((err: unknown) => {
      if (this.active) {
        callbacks.onError(new Error(`STT Session start failed: ${err instanceof Error ? err.message : String(err)}`));
      }
    });

    return {
      stop: () => {
        this.active = false;
        unsubPartial();
        unsubFinal();
        unsubSpeechFinal();
        unsubError();
        void stt.stopSession();
      }
    };
  }

  resetTurn(): void {
    this.assembler.reset();
    this.startedAt = Date.now();
  }

  sendAudio(frame: AudioFrame): void {
    if (!this.active) {
      return;
    }
    const sendFn = window.copilotWindow?.stt?.sendAudioFrame;
    if (typeof sendFn === "function") {
      const arrayBuffer = frame.data.buffer.slice(
        frame.data.byteOffset,
        frame.data.byteOffset + frame.data.byteLength
      ) as ArrayBuffer;
      sendFn(arrayBuffer, frame.capturedAt);
    }
  }
}
