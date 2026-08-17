import { EventEmitter } from "node:events";
import type { IncomingMessage } from "node:http";
import { describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import { DeepgramStreamingSttProvider, readDeepgramSttConfig } from "./deepgramStreamingSttProvider";
import { SttMainService } from "../sttMainService";

class FakeWebSocket extends EventEmitter {
  readyState: number = WebSocket.OPEN;
  sentData: Array<string | Buffer> = [];

  send(data: string | Buffer): void {
    this.sentData.push(data);
  }

  close(): void {
    this.readyState = WebSocket.CLOSED;
    this.emit("close");
  }
}

describe("DeepgramStreamingSttProvider Nova-3 Keyterms", () => {
  it("defaults to nova-3, vietnamese language, and keyterms enabled in readDeepgramSttConfig", () => {
    const config = readDeepgramSttConfig({
      DEEPGRAM_API_KEY: "test-key-123"
    });

    expect(config.provider).toBe("deepgram");
    expect(config.model).toBe("nova-3");
    expect(config.language).toBe("vi");
    expect(config.sampleRate).toBe(16000);
    expect(config.channels).toBe(1);
    expect(config.encoding).toBe("LINEAR16");
    expect(config.isRealSttAvailable).toBe(true);
    expect(config.keytermsEnabled).toBe(true);
    expect(config.keytermList).toContain("site");
    expect(config.keytermList).toContain("iGaming");
    expect(config.keytermList).toContain("keyword");
  });

  it("allows model override via DEEPGRAM_MODEL env var", () => {
    const config = readDeepgramSttConfig({
      DEEPGRAM_API_KEY: "test-key-123",
      DEEPGRAM_MODEL: "nova-2"
    });

    expect(config.model).toBe("nova-2");
  });

  it("allows disabling keyterms via STT_DEEPGRAM_KEYTERMS=false", () => {
    const config = readDeepgramSttConfig({
      DEEPGRAM_API_KEY: "test-key-123",
      STT_DEEPGRAM_KEYTERMS: "false"
    });

    expect(config.keytermsEnabled).toBe(false);
  });

  it("supports backward compatibility via STT_DEEPGRAM_KEYWORDS=false", () => {
    const config = readDeepgramSttConfig({
      DEEPGRAM_API_KEY: "test-key-123",
      STT_DEEPGRAM_KEYWORDS: "false"
    });

    expect(config.keytermsEnabled).toBe(false);
  });

  it("throws configuration error when DEEPGRAM_API_KEY is missing", async () => {
    const config = readDeepgramSttConfig({});
    const provider = new DeepgramStreamingSttProvider(config);

    await expect(
      provider.startSession({
        onPartial: vi.fn(),
        onFinal: vi.fn(),
        onError: vi.fn()
      })
    ).rejects.toThrow("DEEPGRAM_API_KEY is missing");
  });

  it("initializes Nova-3 request with keyterm= parameters and NO legacy keywords= parameters", async () => {
    const fakeWs = new FakeWebSocket();
    let requestedUrl = "";
    let requestedOptions: WebSocket.ClientOptions | undefined;

    const mockFactory = vi.fn((url: string, options: WebSocket.ClientOptions) => {
      requestedUrl = url;
      requestedOptions = options;
      return fakeWs as unknown as WebSocket;
    });

    const config = readDeepgramSttConfig({
      DEEPGRAM_API_KEY: "mock-key",
      DEEPGRAM_MODEL: "nova-3",
      STT_DEEPGRAM_KEYTERMS: "true"
    });

    const provider = new DeepgramStreamingSttProvider(config, mockFactory);
    const onPartial = vi.fn();
    const onFinal = vi.fn();
    const onError = vi.fn();

    const startPromise = provider.startSession({ onPartial, onFinal, onError });
    fakeWs.emit("open");
    await startPromise;

    expect(mockFactory).toHaveBeenCalled();
    expect(requestedUrl).toContain("model=nova-3");
    expect(requestedUrl).toContain("language=vi");
    expect(requestedUrl).toContain("encoding=linear16");
    expect(requestedUrl).toContain("sample_rate=16000");
    expect(requestedUrl).toContain("interim_results=true");
    expect(requestedUrl).not.toContain("endpointing=");
    expect(requestedUrl).not.toContain("utterance_end_ms=");
    expect(requestedUrl).not.toContain("vad_events=");

    // Must use keyterm= parameters
    expect(requestedUrl).toContain("keyterm=site");
    expect(requestedUrl).toContain("keyterm=iGaming");
    expect(requestedUrl).toContain("keyterm=keyword");
    expect(requestedUrl).toContain("keyterm=Ahrefs");

    // Must NOT contain legacy keywords= parameter
    expect(requestedUrl).not.toContain("keywords=");

    expect(requestedOptions?.headers).toEqual({ Authorization: "Token mock-key" });

    // Simulate partial message
    fakeWs.emit(
      "message",
      Buffer.from(
        JSON.stringify({
          is_final: false,
          channel: { alternatives: [{ transcript: "Dự án iGaming" }] }
        })
      )
    );
    expect(onPartial).toHaveBeenCalledWith("Dự án iGaming");

    // Simulate final message
    fakeWs.emit(
      "message",
      Buffer.from(
        JSON.stringify({
          is_final: true,
          channel: { alternatives: [{ transcript: "Dự án iGaming gần nhất mà em làm lên top là con nào?" }] }
        })
      )
    );
    expect(onFinal).toHaveBeenCalledWith("Dự án iGaming gần nhất mà em làm lên top là con nào?");

    // Send Float32 audio frame (converted to 16k mono LINEAR16)
    const float32Array = new Float32Array([0, 0.5, -0.5]);
    provider.sendAudioFrame(float32Array.buffer);
    expect(fakeWs.sentData.length).toBe(1);
    expect(Buffer.isBuffer(fakeWs.sentData[0])).toBe(true);

    // Stop session
    await provider.stopSession();
    expect(fakeWs.sentData).toContain(JSON.stringify({ type: "CloseStream" }));
  });

  it("maps both configured speech_final and defensive UtteranceEnd endpoint events", async () => {
    const fakeWs = new FakeWebSocket();
    const provider = new DeepgramStreamingSttProvider(
      readDeepgramSttConfig({ DEEPGRAM_API_KEY: "mock-key" }),
      vi.fn(() => fakeWs as unknown as WebSocket)
    );
    const onSpeechFinal = vi.fn();

    const startPromise = provider.startSession({
      onPartial: vi.fn(),
      onFinal: vi.fn(),
      onSpeechFinal,
      onError: vi.fn()
    });
    fakeWs.emit("open");
    await startPromise;

    fakeWs.emit(
      "message",
      Buffer.from(JSON.stringify({
        type: "Results",
        is_final: true,
        speech_final: true,
        channel: { alternatives: [{ transcript: "20 triệu phân bổ content PBN" }] }
      }))
    );
    fakeWs.emit("message", Buffer.from(JSON.stringify({ type: "UtteranceEnd", channel: [0], last_word_end: 2.5 })));

    expect(onSpeechFinal).toHaveBeenCalledTimes(2);
    expect(onSpeechFinal).toHaveBeenNthCalledWith(1, "20 triệu phân bổ content PBN");
    expect(onSpeechFinal).toHaveBeenNthCalledWith(2);
  });

  it("omits keyterm= parameters when STT_DEEPGRAM_KEYTERMS=false", async () => {
    const fakeWs = new FakeWebSocket();
    let requestedUrl = "";

    const mockFactory = vi.fn((url: string) => {
      requestedUrl = url;
      return fakeWs as unknown as WebSocket;
    });

    const config = readDeepgramSttConfig({
      DEEPGRAM_API_KEY: "mock-key",
      STT_DEEPGRAM_KEYTERMS: "false"
    });

    const provider = new DeepgramStreamingSttProvider(config, mockFactory);
    const startPromise = provider.startSession({ onPartial: vi.fn(), onFinal: vi.fn(), onError: vi.fn() });
    fakeWs.emit("open");
    await startPromise;

    expect(requestedUrl).not.toContain("keyterm=");
    expect(requestedUrl).not.toContain("keywords=");
  });

  it("surfaces detailed HTTP 400 response body when Deepgram rejects connection", async () => {
    const fakeWs = new FakeWebSocket();

    const mockFactory = vi.fn(() => fakeWs as unknown as WebSocket);

    const config = readDeepgramSttConfig({
      DEEPGRAM_API_KEY: "mock-key"
    });

    const provider = new DeepgramStreamingSttProvider(config, mockFactory);
    const onError = vi.fn();

    const startPromise = provider.startSession({ onPartial: vi.fn(), onFinal: vi.fn(), onError });
    fakeWs.emit("open");
    await startPromise;

    // Simulate unexpected HTTP 400 response body from Deepgram
    const fakeRes = new EventEmitter() as EventEmitter & IncomingMessage;
    fakeRes.statusCode = 400;
    fakeRes.statusMessage = "Bad Request";

    fakeWs.emit("unexpected-response", {}, fakeRes);
    fakeRes.emit("data", Buffer.from(JSON.stringify({ err_msg: "Invalid query parameter 'keywords'" })));
    fakeRes.emit("end");

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("Deepgram connection rejected (HTTP 400 Bad Request): Invalid query parameter 'keywords'")
      })
    );
  });

  it("selects deepgram provider in SttMainService when STT_PROVIDER=deepgram", () => {
    const originalProvider = process.env.STT_PROVIDER;
    const originalModel = process.env.DEEPGRAM_MODEL;
    const originalKey = process.env.DEEPGRAM_API_KEY;
    try {
      process.env.STT_PROVIDER = "deepgram";
      delete process.env.DEEPGRAM_MODEL;
      process.env.DEEPGRAM_API_KEY = "test-key";

      const service = new SttMainService();
      const config = service.getConfig();

      expect(config.provider).toBe("deepgram");
      expect(config.model).toBe("nova-3");
      expect(config.language).toBe("vi");
      expect(config.isRealSttAvailable).toBe(true);
    } finally {
      process.env.STT_PROVIDER = originalProvider;
      process.env.DEEPGRAM_MODEL = originalModel;
      process.env.DEEPGRAM_API_KEY = originalKey;
    }
  });
});
