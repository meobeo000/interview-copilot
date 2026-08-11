import type { AudioCapture, AudioFrame } from "./types";

export class MockAudioCapture implements AudioCapture {
  private timer: number | undefined;

  async start(onFrame: (frame: AudioFrame) => void): Promise<void> {
    this.stop();
    this.timer = window.setInterval(() => {
      onFrame({
        data: new Float32Array(480),
        sampleRate: 48_000,
        capturedAt: Date.now()
      });
    }, 100);
  }

  async stop(): Promise<void> {
    if (this.timer) {
      window.clearInterval(this.timer);
      this.timer = undefined;
    }
  }
}
