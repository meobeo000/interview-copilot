import { EventEmitter } from "node:events";
import type { IncomingMessage } from "node:http";
import { describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import {
  DEFAULT_OPENAI_TRANSCRIBE_PROMPT,
  OpenAIStreamingSttProvider,
  readOpenAiSttConfig
} from "./openAiStreamingSttProvider";
import { SttMainService } from "../sttMainService";

class FakeWebSocket extends EventEmitter {
  readyState: number = WebSocket.OPEN;
  sentData: string[] = [];

  send(data: string): void {
    this.sentData.push(data);
  }

  close(): void {
    this.readyState = WebSocket.CLOSED;
    this.emit("close");
  }
}

describe("OpenAIStreamingSttProvider Transcription Schema", () => {
  it("defaults to gpt-4o-mini-transcribe and vi language in readOpenAiSttConfig", () => {
    const config = readOpenAiSttConfig({
      OPENAI_API_KEY: "sk-test-123456"
    });

    expect(config.provider).toBe("openai");
    expect(config.model).toBe("gpt-4o-mini-transcribe");
    expect(config.language).toBe("vi");
    expect(config.sampleRate).toBe(24000);
    expect(config.sourceSampleRate).toBe(16000);
    expect(config.targetSampleRate).toBe(24000);
    expect(config.channels).toBe(1);
    expect(config.encoding).toBe("PCM16");
    expect(config.isRealSttAvailable).toBe(true);
    expect(config.transcriptionPrompt).toBe(DEFAULT_OPENAI_TRANSCRIBE_PROMPT);
  });

  it("allows model override via OPENAI_TRANSCRIBE_MODEL env var", () => {
    const config = readOpenAiSttConfig({
      OPENAI_API_KEY: "sk-test-123456",
      OPENAI_TRANSCRIBE_MODEL: "gpt-4o-transcribe"
    });

    expect(config.model).toBe("gpt-4o-transcribe");
  });

  it("throws configuration error when OPENAI_API_KEY is missing", async () => {
    const config = readOpenAiSttConfig({});
    const provider = new OpenAIStreamingSttProvider(config);

    await expect(
      provider.startSession({
        onPartial: vi.fn(),
        onFinal: vi.fn(),
        onError: vi.fn()
      })
    ).rejects.toThrow("OPENAI_API_KEY is missing");
  });

  it("sends official transcription-session schema and routes partial/final transcripts", async () => {
    const fakeWs = new FakeWebSocket();
    let requestedUrl = "";
    let requestedOptions: WebSocket.ClientOptions | undefined;

    const mockFactory = vi.fn((url: string, options: WebSocket.ClientOptions) => {
      requestedUrl = url;
      requestedOptions = options;
      return fakeWs as unknown as WebSocket;
    });

    const config = readOpenAiSttConfig({
      OPENAI_API_KEY: "sk-mock-key",
      OPENAI_TRANSCRIBE_MODEL: "gpt-4o-mini-transcribe"
    });

    const provider = new OpenAIStreamingSttProvider(config, mockFactory);
    const onPartial = vi.fn();
    const onFinal = vi.fn();
    const onError = vi.fn();

    const startPromise = provider.startSession({ onPartial, onFinal, onError });
    await Promise.resolve();
    fakeWs.emit("open");
    await startPromise;

    expect(mockFactory).toHaveBeenCalled();
    expect(requestedUrl).toBe("wss://api.openai.com/v1/realtime?model=gpt-4o-mini-transcribe");
    expect(requestedOptions?.headers).toEqual({
      Authorization: "Bearer sk-mock-key",
      "OpenAI-Beta": "realtime=v1"
    });

    // Verify session.update message sent
    expect(fakeWs.sentData.length).toBeGreaterThanOrEqual(1);
    const sessionPayload = JSON.parse(fakeWs.sentData[0]) as {
      type: string;
      session: {
        type: string;
        input_audio_format?: unknown;
        input_audio_transcription?: unknown;
        audio: {
          input: {
            format: { type: string; rate: number };
            transcription: { model: string; language: string; prompt: string };
            turn_detection: { type: string };
          };
        };
      };
    };

    // Strict schema assertions
    expect(sessionPayload.type).toBe("session.update");
    expect(sessionPayload.session.type).toBe("transcription");
    expect(sessionPayload.session.audio.input.format.type).toBe("audio/pcm");
    expect(sessionPayload.session.audio.input.format.rate).toBe(24000);
    expect(sessionPayload.session.audio.input.transcription.model).toBe("gpt-4o-mini-transcribe");
    expect(sessionPayload.session.audio.input.transcription.language).toBe("vi");
    expect(sessionPayload.session.audio.input.transcription.prompt).toBe(DEFAULT_OPENAI_TRANSCRIBE_PROMPT);
    expect(sessionPayload.session.audio.input.turn_detection.type).toBe("server_vad");

    // Ensure NO legacy top-level fields exist on session
    expect(sessionPayload.session.input_audio_format).toBeUndefined();
    expect(sessionPayload.session.input_audio_transcription).toBeUndefined();

    // Simulate partial transcript delta
    fakeWs.emit(
      "message",
      Buffer.from(
        JSON.stringify({
          type: "conversation.item.input_audio_transcription.delta",
          delta: "Dự án iGaming "
        })
      )
    );
    expect(onPartial).toHaveBeenCalledWith("Dự án iGaming");

    // Simulate final completed transcript
    fakeWs.emit(
      "message",
      Buffer.from(
        JSON.stringify({
          type: "conversation.item.input_audio_transcription.completed",
          transcript: "Dự án iGaming gần nhất mà em trực tiếp làm lên top là con nào?"
        })
      )
    );
    expect(onFinal).toHaveBeenCalledWith("Dự án iGaming gần nhất mà em trực tiếp làm lên top là con nào?");

    // Send 16k Float32 audio frame (converted & resampled to 24k PCM16 Base64)
    const float32Array = new Float32Array([0, 0.5, -0.5]);
    provider.sendAudioFrame(float32Array.buffer);
    expect(fakeWs.sentData.length).toBe(2);
    const audioPayload = JSON.parse(fakeWs.sentData[1]) as { type: string; audio: string };
    expect(audioPayload.type).toBe("input_audio_buffer.append");
    expect(typeof audioPayload.audio).toBe("string");

    // Stop session
    await provider.stopSession();
    expect(fakeWs.readyState).toBe(WebSocket.CLOSED);
  });

  it("handles conversation.item.input_audio_transcription.failed event", async () => {
    const fakeWs = new FakeWebSocket();
    const mockFactory = vi.fn(() => fakeWs as unknown as WebSocket);

    const config = readOpenAiSttConfig({
      OPENAI_API_KEY: "sk-mock-key"
    });

    const provider = new OpenAIStreamingSttProvider(config, mockFactory);
    const onError = vi.fn();

    const startPromise = provider.startSession({ onPartial: vi.fn(), onFinal: vi.fn(), onError });
    await Promise.resolve();
    fakeWs.emit("open");
    await startPromise;

    fakeWs.emit(
      "message",
      Buffer.from(
        JSON.stringify({
          type: "conversation.item.input_audio_transcription.failed",
          error: { message: "Audio buffer overflow or corrupt frame" }
        })
      )
    );

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("Transcription failed: Audio buffer overflow or corrupt frame")
      })
    );
  });

  it("surfaces authentication error details cleanly without exposing secrets", async () => {
    const fakeWs = new FakeWebSocket();
    const mockFactory = vi.fn(() => fakeWs as unknown as WebSocket);

    const config = readOpenAiSttConfig({
      OPENAI_API_KEY: "invalid-key-secret"
    });

    const provider = new OpenAIStreamingSttProvider(config, mockFactory);
    const onError = vi.fn();

    const startPromise = provider.startSession({ onPartial: vi.fn(), onFinal: vi.fn(), onError });
    await Promise.resolve();
    fakeWs.emit("open");
    await startPromise;

    const fakeRes = new EventEmitter() as EventEmitter & IncomingMessage;
    fakeRes.statusCode = 401;
    fakeRes.statusMessage = "Unauthorized";

    fakeWs.emit("unexpected-response", {}, fakeRes);
    fakeRes.emit("data", Buffer.from(JSON.stringify({ error: { message: "Incorrect API key provided" } })));
    fakeRes.emit("end");

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("OpenAI STT authentication failed")
      })
    );
    // Ensure actual key secret was NOT leaked in error message
    expect(onError.mock.calls[0][0].message).not.toContain("invalid-key-secret");
  });

  it("selects openai provider in SttMainService when STT_PROVIDER=openai", () => {
    const originalProvider = process.env.STT_PROVIDER;
    const originalModel = process.env.OPENAI_TRANSCRIBE_MODEL;
    const originalKey = process.env.OPENAI_API_KEY;
    try {
      process.env.STT_PROVIDER = "openai";
      delete process.env.OPENAI_TRANSCRIBE_MODEL;
      process.env.OPENAI_API_KEY = "test-sk-key";

      const service = new SttMainService();
      const config = service.getConfig();

      expect(config.provider).toBe("openai");
      expect(config.model).toBe("gpt-4o-mini-transcribe");
      expect(config.language).toBe("vi");
      expect(config.isRealSttAvailable).toBe(true);
    } finally {
      process.env.STT_PROVIDER = originalProvider;
      process.env.OPENAI_TRANSCRIBE_MODEL = originalModel;
      process.env.OPENAI_API_KEY = originalKey;
    }
  });
});
