import { EventEmitter } from "node:events";
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

describe("DeepgramStreamingSttProvider", () => {
  it("defaults to nova-3 and vietnamese language in readDeepgramSttConfig", () => {
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
  });

  it("allows model override via DEEPGRAM_MODEL env var", () => {
    const config = readDeepgramSttConfig({
      DEEPGRAM_API_KEY: "test-key-123",
      DEEPGRAM_MODEL: "nova-2"
    });

    expect(config.model).toBe("nova-2");
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

  it("initializes WebSocket streaming and routes partial/final transcripts", async () => {
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
      DEEPGRAM_MODEL: "nova-3"
    });

    const provider = new DeepgramStreamingSttProvider(config, mockFactory);
    const onPartial = vi.fn();
    const onFinal = vi.fn();
    const onError = vi.fn();

    const startPromise = provider.startSession({ onPartial, onFinal, onError });

    // Open connection
    fakeWs.emit("open");
    await startPromise;

    expect(mockFactory).toHaveBeenCalled();
    expect(requestedUrl).toContain("model=nova-3");
    expect(requestedUrl).toContain("language=vi");
    expect(requestedUrl).toContain("encoding=linear16");
    expect(requestedUrl).toContain("sample_rate=16000");
    expect(requestedUrl).toContain("interim_results=true");
    expect(requestedUrl).toContain("keywords=GSC:1");
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

    // Send audio frame
    const float32Array = new Float32Array([0, 0.5, -0.5]);
    provider.sendAudioFrame(float32Array.buffer);
    expect(fakeWs.sentData.length).toBe(1);
    expect(Buffer.isBuffer(fakeWs.sentData[0])).toBe(true);

    // Stop session
    await provider.stopSession();
    expect(fakeWs.sentData).toContain(JSON.stringify({ type: "CloseStream" }));
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
