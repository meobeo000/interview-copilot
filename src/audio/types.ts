export interface AudioFrame {
  data: Float32Array;
  sampleRate: number;
  channels: number;
  sampleFormat: "float32" | "pcm16";
  durationMs: number;
  capturedAt: number;
  rmsLevel: number;
}

export interface AudioCapture {
  start: (onFrame: (frame: AudioFrame) => void) => Promise<void>;
  stop: () => Promise<void>;
  getAudioLevel?: () => number;
}
