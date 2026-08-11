import { describe, expect, it, vi } from "vitest";
import { MockAudioCapture } from "./mockAudioCapture";
import { SystemAudioCapture } from "./systemAudioCapture";

describe("AudioCapture subsystem", () => {
  it("SystemAudioCapture throws descriptive error when window.copilotWindow is absent", async () => {
    const capture = new SystemAudioCapture();
    await expect(capture.start(() => {})).rejects.toThrow("Windows system audio capture is not supported in this environment.");
  });

  it("MockAudioCapture starts, emits valid frames with RMS level, and stops cleanly", async () => {
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
});
