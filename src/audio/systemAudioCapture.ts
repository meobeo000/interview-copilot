import type { AudioCapture, AudioFrame } from "./types";

export class SystemAudioCapture implements AudioCapture {
  private mediaStream: MediaStream | undefined;
  private audioContext: AudioContext | undefined;
  private processorNode: ScriptProcessorNode | undefined;
  private sourceNode: MediaStreamAudioSourceNode | undefined;
  private currentRms = 0;
  private active = false;

  async start(onFrame: (frame: AudioFrame) => void): Promise<void> {
    await this.stop();

    if (typeof window.copilotWindow?.getDesktopSourceId !== "function" || !navigator.mediaDevices?.getUserMedia) {
      throw new Error("Windows system audio capture is not supported in this environment.");
    }

    const sourceId = await window.copilotWindow.getDesktopSourceId();
    if (!sourceId) {
      throw new Error("No desktop screen source available for system audio capture.");
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

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    this.mediaStream = stream;

    // Release temporary video tracks immediately so we only retain system output audio
    stream.getVideoTracks().forEach((track) => track.stop());

    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      throw new Error("No system audio track captured from Windows desktop source.");
    }

    const audioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const audioContext = new audioContextClass();
    this.audioContext = audioContext;

    const sourceNode = audioContext.createMediaStreamSource(stream);
    this.sourceNode = sourceNode;

    const bufferSize = 2048;
    const processorNode = audioContext.createScriptProcessor(bufferSize, 1, 1);
    this.processorNode = processorNode;

    sourceNode.connect(processorNode);
    // Connect to destination node to keep processor active without producing output echo
    processorNode.connect(audioContext.destination);

    this.active = true;

    processorNode.onaudioprocess = (event: AudioProcessingEvent) => {
      if (!this.active) {
        return;
      }

      const inputBuffer = event.inputBuffer;
      const channelData = inputBuffer.getChannelData(0);
      const sampleRate = inputBuffer.sampleRate;

      let sumSq = 0;
      for (let i = 0; i < channelData.length; i++) {
        sumSq += channelData[i] * channelData[i];
      }
      const rawRms = Math.sqrt(sumSq / channelData.length);
      const rmsLevel = Math.min(1, Math.max(0, Math.pow(rawRms * 4.5, 0.75)));
      this.currentRms = rmsLevel;

      const pcmCopy = new Float32Array(channelData);
      const durationMs = Math.round((channelData.length / sampleRate) * 1000);

      onFrame({
        data: pcmCopy,
        sampleRate,
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
      this.mediaStream.getTracks().forEach((track) => track.stop());
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
