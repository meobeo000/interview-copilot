import { describe, expect, it, vi } from "vitest";
import * as SpeechSDK from "microsoft-cognitiveservices-speech-sdk";
import { AzureStreamingSttProvider, readAzureSttConfig } from "./azureStreamingSttProvider";
import { SttMainService } from "../sttMainService";

interface FakeRecognizerCallbacks {
  recognizing?: (sender: unknown, event: { result: { text?: string } }) => void;
  recognized?: (sender: unknown, event: { result: { reason: SpeechSDK.ResultReason; text?: string } }) => void;
  canceled?: (sender: unknown, event: { reason: string; errorDetails?: string }) => void;
  sessionStopped?: () => void;
}

class FakePushStream {
  readonly writtenChunks: ArrayBuffer[] = [];
  closed = false;

  write(data: ArrayBuffer): void {
    this.writtenChunks.push(data);
  }

  close(): void {
    this.closed = true;
  }
}

class FakeSpeechRecognizer {
  callbacks: FakeRecognizerCallbacks = {};
  startAsyncCalled = false;
  stopAsyncCalled = false;
  closed = false;

  set recognizing(fn: FakeRecognizerCallbacks["recognizing"]) {
    this.callbacks.recognizing = fn;
  }

  set recognized(fn: FakeRecognizerCallbacks["recognized"]) {
    this.callbacks.recognized = fn;
  }

  set canceled(fn: FakeRecognizerCallbacks["canceled"]) {
    this.callbacks.canceled = fn;
  }

  set sessionStopped(fn: FakeRecognizerCallbacks["sessionStopped"]) {
    this.callbacks.sessionStopped = fn;
  }

  startContinuousRecognitionAsync(cb: () => void): void {
    this.startAsyncCalled = true;
    cb();
  }

  stopContinuousRecognitionAsync(cb: () => void): void {
    this.stopAsyncCalled = true;
    cb();
  }

  close(): void {
    this.closed = true;
  }
}

describe("AzureStreamingSttProvider", () => {
  it("initializes Azure Speech continuous recognition and routes recognizing/recognized events", async () => {
    const fakeRecognizer = new FakeSpeechRecognizer();
    const fakePushStream = new FakePushStream();

    const config = readAzureSttConfig({
      AZURE_SPEECH_KEY: "mock-azure-key",
      AZURE_SPEECH_REGION: "eastus"
    });

    const mockFactory = vi.fn(() => ({
      recognizer: fakeRecognizer as unknown as SpeechSDK.SpeechRecognizer,
      pushStream: fakePushStream as unknown as SpeechSDK.PushAudioInputStream
    }));

    const provider = new AzureStreamingSttProvider(config, mockFactory);
    const onPartial = vi.fn();
    const onFinal = vi.fn();
    const onError = vi.fn();

    await provider.startSession({ onPartial, onFinal, onError });

    expect(mockFactory).toHaveBeenCalledWith(expect.objectContaining({
      provider: "azure",
      language: "vi-VN",
      subscriptionKey: "mock-azure-key",
      serviceRegion: "eastus"
    }));
    expect(fakeRecognizer.startAsyncCalled).toBe(true);

    // Simulate recognizing (partial)
    fakeRecognizer.callbacks.recognizing?.({}, { result: { text: "Dự án iGaming" } });
    expect(onPartial).toHaveBeenCalledWith("Dự án iGaming");

    // Simulate recognized (final)
    fakeRecognizer.callbacks.recognized?.({}, {
      result: {
        reason: SpeechSDK.ResultReason.RecognizedSpeech,
        text: "Dự án iGaming gần nhất mà em trực tiếp làm lên top là con nào?"
      }
    });
    expect(onFinal).toHaveBeenCalledWith("Dự án iGaming gần nhất mà em trực tiếp làm lên top là con nào?");

    // Send audio frame
    provider.sendAudioFrame(new Float32Array([0, 0.5]).buffer);
    expect(fakePushStream.writtenChunks.length).toBe(1);

    await provider.stopSession();
    expect(fakeRecognizer.stopAsyncCalled).toBe(true);
    expect(fakePushStream.closed).toBe(true);
  });

  it("handles cancellation errors cleanly", async () => {
    const fakeRecognizer = new FakeSpeechRecognizer();
    const fakePushStream = new FakePushStream();

    const config = readAzureSttConfig({
      AZURE_SPEECH_KEY: "mock-azure-key",
      AZURE_SPEECH_REGION: "eastus"
    });

    const mockFactory = vi.fn(() => ({
      recognizer: fakeRecognizer as unknown as SpeechSDK.SpeechRecognizer,
      pushStream: fakePushStream as unknown as SpeechSDK.PushAudioInputStream
    }));

    const provider = new AzureStreamingSttProvider(config, mockFactory);
    const onError = vi.fn();

    await provider.startSession({ onPartial: vi.fn(), onFinal: vi.fn(), onError });

    fakeRecognizer.callbacks.canceled?.({}, { reason: "Error", errorDetails: "QuotaExceeded: 429 Too Many Requests" });
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.stringContaining("Azure STT quota/rate limit exceeded")
    }));
  });

  it("throws configuration error when AZURE_SPEECH_KEY or AZURE_SPEECH_REGION is missing", async () => {
    const configMissingKey = readAzureSttConfig({ AZURE_SPEECH_REGION: "eastus" });
    const provider1 = new AzureStreamingSttProvider(configMissingKey);
    await expect(provider1.startSession({ onPartial: vi.fn(), onFinal: vi.fn(), onError: vi.fn() }))
      .rejects.toThrow("AZURE_SPEECH_KEY is missing");

    const configMissingRegion = readAzureSttConfig({ AZURE_SPEECH_KEY: "some-key" });
    const provider2 = new AzureStreamingSttProvider(configMissingRegion);
    await expect(provider2.startSession({ onPartial: vi.fn(), onFinal: vi.fn(), onError: vi.fn() }))
      .rejects.toThrow("AZURE_SPEECH_REGION is missing");
  });

  it("selects azure provider in SttMainService when STT_PROVIDER=azure", () => {
    const originalEnv = process.env.STT_PROVIDER;
    try {
      process.env.STT_PROVIDER = "azure";
      process.env.AZURE_SPEECH_KEY = "test-key";
      process.env.AZURE_SPEECH_REGION = "eastus";

      const service = new SttMainService();
      const config = service.getConfig();

      expect(config.provider).toBe("azure");
      expect(config.language).toBe("vi-VN");
      expect(config.isRealSttAvailable).toBe(true);
    } finally {
      process.env.STT_PROVIDER = originalEnv;
    }
  });
});
