import type { AudioCapture, AudioFrame } from "./types";

export class MockAudioCapture implements AudioCapture {
  private timer: number | undefined;
  private currentLevel = 0;

  async start(onFrame: (frame: AudioFrame) => void): Promise<void> {
    await this.stop();
    this.timer = window.setInterval(() => {
      this.currentLevel = Math.min(1, Math.max(0.05, Math.random() * 0.45));
      onFrame({
        data: new Float32Array(480),
        sampleRate: 16_000,
        channels: 1,
        sampleFormat: "float32",
        durationMs: 30,
        capturedAt: Date.now(),
        rmsLevel: this.currentLevel
      });
    }, 100);
  }

  async stop(): Promise<void> {
    if (this.timer) {
      window.clearInterval(this.timer);
      this.timer = undefined;
    }
    this.currentLevel = 0;
  }

  getAudioLevel(): number {
    return this.currentLevel;
  }
}
