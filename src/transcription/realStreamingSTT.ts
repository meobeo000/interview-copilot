import type { AudioFrame } from "../audio/types";
import type { StreamController, TranscriptCallbacks, TranscriptChunk } from "../shared/types";
import type { TranscriptionService } from "./types";

export class RealStreamingSTTService implements TranscriptionService {
  private active = false;
  private currentPartial = "";
  private accumulatedFinal = "";
  private startedAt = Date.now();

  start(callbacks: TranscriptCallbacks): StreamController {
    this.active = true;
    this.currentPartial = "";
    this.accumulatedFinal = "";
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
      this.currentPartial = partialText;
      const combinedText = (this.accumulatedFinal + " " + partialText).trim();
      const chunk: TranscriptChunk = {
        text: combinedText,
        isFinal: false,
        startedAt: this.startedAt
      };
      callbacks.onPartial(chunk);
    });

    const unsubFinal = stt.onFinal((finalText) => {
      if (!this.active) {
        return;
      }
      this.accumulatedFinal = (this.accumulatedFinal + " " + finalText).trim();
      this.currentPartial = "";
      const chunk: TranscriptChunk = {
        text: this.accumulatedFinal,
        isFinal: true,
        startedAt: this.startedAt,
        completedAt: Date.now()
      };
      callbacks.onFinal(chunk);
    });

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
        unsubError();
        void stt.stopSession();
      }
    };
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
      sendFn(arrayBuffer);
    }
  }
}
