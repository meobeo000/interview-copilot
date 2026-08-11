import { describe, expect, it, vi } from "vitest";
import { RealStreamingSTTService } from "./realStreamingSTT";

describe("RealStreamingSTTService", () => {
  it("emits error callback when copilotWindow.stt is unavailable", () => {
    const service = new RealStreamingSTTService();
    const onError = vi.fn();

    service.start({
      onPartial: () => {},
      onFinal: () => {},
      onError,
      onComplete: () => {}
    });

    expect(onError).toHaveBeenCalledWith(expect.any(Error));
    expect(onError.mock.calls[0][0].message).toContain("Real STT streaming is not available");
  });

  it("subscribes to IPC partial and final callbacks when stt bridge is present", async () => {
    let partialListener: ((text: string) => void) | undefined;
    let finalListener: ((text: string) => void) | undefined;
    const sendAudioFrame = vi.fn();
    const startSession = vi.fn().mockResolvedValue(undefined);
    const stopSession = vi.fn().mockResolvedValue(undefined);

    window.copilotWindow = {
      hide: vi.fn(),
      getDesktopSourceId: vi.fn(),
      stt: {
        startSession,
        sendAudioFrame,
        stopSession,
        getConfig: vi.fn().mockResolvedValue({ provider: "deepgram", isRealSttAvailable: true, mockMode: false }),
        onPartial: (cb) => {
          partialListener = cb;
          return () => {};
        },
        onFinal: (cb) => {
          finalListener = cb;
          return () => {};
        },
        onError: () => () => {}
      }
    };

    const service = new RealStreamingSTTService();
    const onPartial = vi.fn();
    const onFinal = vi.fn();

    const controller = service.start({
      onPartial,
      onFinal,
      onError: () => {},
      onComplete: () => {}
    });

    expect(startSession).toHaveBeenCalled();

    partialListener?.("Xin chào");
    expect(onPartial).toHaveBeenCalledWith(expect.objectContaining({ text: "Xin chào", isFinal: false }));

    finalListener?.("Xin chào các bạn");
    expect(onFinal).toHaveBeenCalledWith(expect.objectContaining({ text: "Xin chào các bạn", isFinal: true }));

    service.sendAudio({
      data: new Float32Array(480),
      sampleRate: 16000,
      channels: 1,
      sampleFormat: "float32",
      durationMs: 30,
      capturedAt: Date.now(),
      rmsLevel: 0.1
    });

    expect(sendAudioFrame).toHaveBeenCalled();

    controller.stop();
    expect(stopSession).toHaveBeenCalled();
  });

  it("resets accumulated transcript buffer when resetTurn() is called without stopping session", () => {
    let finalListener: ((text: string) => void) | undefined;

    window.copilotWindow = {
      hide: vi.fn(),
      getDesktopSourceId: vi.fn(),
      stt: {
        startSession: vi.fn().mockResolvedValue(undefined),
        sendAudioFrame: vi.fn(),
        stopSession: vi.fn().mockResolvedValue(undefined),
        getConfig: vi.fn().mockResolvedValue({ provider: "deepgram", isRealSttAvailable: true, mockMode: false }),
        onPartial: () => () => {},
        onFinal: (cb) => {
          finalListener = cb;
          return () => {};
        },
        onError: () => () => {}
      }
    };

    const service = new RealStreamingSTTService();
    const onFinal = vi.fn();

    service.start({
      onPartial: () => {},
      onFinal,
      onError: () => {},
      onComplete: () => {}
    });

    finalListener?.("Question 1 speech");
    expect(onFinal).toHaveBeenLastCalledWith(expect.objectContaining({ text: "Question 1 speech" }));

    // Reset turn boundary
    service.resetTurn();

    finalListener?.("Question 2 speech");
    expect(onFinal).toHaveBeenLastCalledWith(expect.objectContaining({ text: "Question 2 speech" }));
  });
});
