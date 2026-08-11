export interface AudioFrame {
  data: Float32Array;
  sampleRate: 16000;
  channels: 1;
  sampleFormat: "float32";
  durationMs: number;
  capturedAt: number;
  rmsLevel: number;
}

export interface AudioCapture {
  start: (onFrame: (frame: AudioFrame) => void, onError?: (error: Error) => void) => Promise<void>;
  stop: () => Promise<void>;
  getAudioLevel?: () => number;
}
