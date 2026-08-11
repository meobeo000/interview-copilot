import { describe, expect, it, vi } from "vitest";
import { MockAudioCapture } from "./mockAudioCapture";
import { SystemAudioCapture } from "./systemAudioCapture";

describe("AudioCapture subsystem", () => {
  it("SystemAudioCapture throws descriptive error when window.copilotWindow is absent", async () => {
    const capture = new SystemAudioCapture();
    const errorHandler = vi.fn();
    await expect(capture.start(() => {}, errorHandler)).rejects.toThrow(
      "Windows system audio capture is not supported in this environment."
    );
    expect(errorHandler).toHaveBeenCalled();
  });

  it("MockAudioCapture starts, emits valid 16kHz frames with RMS level, and stops cleanly", async () => {
    const mockCapture = new MockAudioCapture();
    const frameHandler = vi.fn();

    await mockCapture.start(frameHandler);

    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(frameHandler).toHaveBeenCalled();
    const frame = frameHandler.mock.calls[0][0];

    expect(frame.sampleRate).toBe(16_000);
    expect(frame.channels).toBe(1);
    expect(frame.sampleFormat).toBe("float32");
    expect(frame.rmsLevel).toBeGreaterThanOrEqual(0);

    await mockCapture.stop();
    expect(mockCapture.getAudioLevel()).toBe(0);
  });

  it("handles repeated start() and stop() calls idempotently without leaking state", async () => {
    const mockCapture = new MockAudioCapture();
    const handler = vi.fn();

    await mockCapture.start(handler);
    await mockCapture.start(handler);
    await mockCapture.stop();
    await mockCapture.stop();

    expect(mockCapture.getAudioLevel()).toBe(0);
  });
});
