import { resampleMono } from "./resampler";
import type { AudioCapture, AudioFrame } from "./types";

export const TARGET_SAMPLE_RATE = 16000;

export class SystemAudioCapture implements AudioCapture {
  private mediaStream: MediaStream | undefined;
  private audioContext: AudioContext | undefined;
  private processorNode: ScriptProcessorNode | undefined;
  private sourceNode: MediaStreamAudioSourceNode | undefined;
  private currentRms = 0;
  private active = false;

  async start(onFrame: (frame: AudioFrame) => void, onError?: (error: Error) => void): Promise<void> {
    await this.stop();

    if (typeof window.copilotWindow?.getDesktopSourceId !== "function" || !navigator.mediaDevices?.getUserMedia) {
      const err = new Error("Windows system audio capture is not supported in this environment.");
      onError?.(err);
      throw err;
    }

    let sourceId: string | undefined;
    try {
      sourceId = await window.copilotWindow.getDesktopSourceId();
    } catch (cause) {
      const err = new Error(`Failed to acquire desktop source ID: ${cause instanceof Error ? cause.message : String(cause)}`);
      onError?.(err);
      throw err;
    }

    if (!sourceId) {
      const err = new Error("No desktop screen source available for system audio capture.");
      onError?.(err);
      throw err;
    }

    const constraints = {
      audio: {
        mandatory: {
          chromeMediaSource: "desktop",
          chromeMediaSourceId: sourceId
        }
      } as unknown as MediaTrackConstraints,
      video: {
        mandatory: {
          chromeMediaSource: "desktop",
          chromeMediaSourceId: sourceId,
          minWidth: 16,
          maxWidth: 16,
          minHeight: 16,
          maxHeight: 16
        }
      } as unknown as MediaTrackConstraints
    };

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (cause) {
      const err = new Error(`Windows system audio capture permission/stream failure: ${cause instanceof Error ? cause.message : String(cause)}`);
      onError?.(err);
      throw err;
    }

    this.mediaStream = stream;

    // Release temporary video tracks immediately so we only retain system output audio
    stream.getVideoTracks().forEach((track) => track.stop());

    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      const err = new Error("No system audio track captured from Windows desktop source.");
      onError?.(err);
      throw err;
    }

    const primaryAudioTrack = audioTracks[0];
    primaryAudioTrack.onended = () => {
      if (this.active) {
        this.currentRms = 0;
        this.active = false;
        onError?.(new Error("Windows system audio track disconnected or ended. Please click Listen to restart capture."));
      }
    };

    const audioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const audioContext = new audioContextClass();
    this.audioContext = audioContext;

    const sourceNode = audioContext.createMediaStreamSource(stream);
    this.sourceNode = sourceNode;

    const bufferSize = 2048;
    const processorNode = audioContext.createScriptProcessor(bufferSize, 1, 1);
    this.processorNode = processorNode;

    sourceNode.connect(processorNode);
    // Connect to destination to keep node active in event loop without audio feedback loop
    processorNode.connect(audioContext.destination);

    this.active = true;

    processorNode.onaudioprocess = (event: AudioProcessingEvent) => {
      if (!this.active) {
        return;
      }

      const inputBuffer = event.inputBuffer;
      const channelData = inputBuffer.getChannelData(0);
      const inputRate = inputBuffer.sampleRate;

      let sumSq = 0;
      for (let i = 0; i < channelData.length; i++) {
        sumSq += channelData[i] * channelData[i];
      }
      const rawRms = Math.sqrt(sumSq / channelData.length);
      const rmsLevel = Math.min(1, Math.max(0, Math.pow(rawRms * 4.5, 0.75)));
      this.currentRms = rmsLevel;

      // Resample mono float32 channel data down to strict 16,000 Hz target rate
      const resampledData = resampleMono(channelData, inputRate, TARGET_SAMPLE_RATE);
      const durationMs = Math.round((resampledData.length / TARGET_SAMPLE_RATE) * 1000);

      onFrame({
        data: resampledData,
        sampleRate: TARGET_SAMPLE_RATE,
        channels: 1,
        sampleFormat: "float32",
        durationMs,
        capturedAt: Date.now(),
        rmsLevel
      });
    };
  }

  async stop(): Promise<void> {
    this.active = false;
    this.currentRms = 0;

    if (this.processorNode) {
      this.processorNode.onaudioprocess = null;
      this.processorNode.disconnect();
      this.processorNode = undefined;
    }

    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = undefined;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => {
        track.onended = null;
        track.stop();
      });
      this.mediaStream = undefined;
    }

    if (this.audioContext && this.audioContext.state !== "closed") {
      try {
        await this.audioContext.close();
      } catch {
        // Ignore closing errors
      }
      this.audioContext = undefined;
    }
  }

  getAudioLevel(): number {
    return this.currentRms;
  }
}
