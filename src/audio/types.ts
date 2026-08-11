export interface AudioFrame {
  data: Float32Array;
  sampleRate: number;
  capturedAt: number;
}

export interface AudioCapture {
  start: (onFrame: (frame: AudioFrame) => void) => Promise<void>;
  stop: () => Promise<void>;
}
