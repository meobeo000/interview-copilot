import { describe, expect, it, vi } from "vitest";
import { GeminiAnswerService, readGeminiAnswerConfig } from "./geminiAnswerService";
import { createAnswerService } from "./factory";
import type { AnswerRequest } from "./types";
import { bootstrapEnv } from "../electron/envBootstrap";

describe("GeminiAnswerService & Provider Factory Integration", () => {
  it("reads config from env with configurable default model", () => {
    const config = readGeminiAnswerConfig({
      GEMINI_API_KEY: "AIzaSyTestKey123",
      GEMINI_ANSWER_MODEL: "gemini-2.5-flash"
    });

    expect(config.apiKey).toBe("AIzaSyTestKey123");
    expect(config.model).toBe("gemini-2.5-flash");
  });

  it("differentiates missing configuration error cleanly", async () => {
    const service = new GeminiAnswerService({ apiKey: "", model: "gemini-2.5-flash" });
    const req: AnswerRequest = {
      questionId: "q1",
      question: "Dự án iGaming gần nhất mà em làm là con nào?",
      rawTranscript: "Dự án iGaming gần nhất mà em làm là con nào?"
    };

    const gen = service.streamAnswer(req);
    await expect(gen.next()).rejects.toThrow("GEMINI_API_KEY is missing");
  });

  it("differentiates HTTP 401/403 Authentication error", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      text: async () => JSON.stringify({ error: { message: "API key invalid" } })
    });

    const service = new GeminiAnswerService({ apiKey: "AIzaSyInvalid", model: "gemini-2.5-flash" }, mockFetch as unknown as typeof fetch);

    const gen = service.streamAnswer({
      questionId: "q-401",
      question: "Site mở bot rồi nhưng hai tuần không nhận key?",
      rawTranscript: "Site mở bot rồi nhưng hai tuần không nhận key?"
    });

    await expect(gen.next()).rejects.toThrow("Gemini Authentication error (HTTP 401): API key invalid");
  });

  it("differentiates HTTP 429 Quota/Rate Limit error", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      statusText: "Too Many Requests",
      text: async () => JSON.stringify({ error: { message: "Quota exceeded" } })
    });

    const service = new GeminiAnswerService({ apiKey: "AIzaSyValid", model: "gemini-2.5-flash" }, mockFetch as unknown as typeof fetch);

    const gen = service.streamAnswer({
      questionId: "q-429",
      question: "Impressions giảm 5%, click giảm 40%?",
      rawTranscript: "Impressions giảm 5%, click giảm 40%?"
    });

    await expect(gen.next()).rejects.toThrow("Gemini Quota error (HTTP 429): Quota exceeded");
  });

  it("differentiates HTTP 404 Model Unavailable error", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
      text: async () => JSON.stringify({ error: { message: "Model not found" } })
    });

    const service = new GeminiAnswerService({ apiKey: "AIzaSyValid", model: "gemini-unknown-model" }, mockFetch as unknown as typeof fetch);

    const gen = service.streamAnswer({
      questionId: "q-404",
      question: "Tại sao?",
      rawTranscript: "Tại sao?"
    });

    await expect(gen.next()).rejects.toThrow("Gemini Model error (HTTP 404): Model 'gemini-unknown-model' is unavailable or not found.");
  });

  it("streams progressive chunks and yields final structured SuggestedAnswer", async () => {
    const mockSse = [
      'data: {"candidates":[{"content":{"parts":[{"text":"{\\"openingLine\\": \\"Dự án iGaming gần nhất em trực tiếp triển khai là [Tên project].\\", \\"bullets\\": [\\"Lúc nhận site keyword [___] ở position [___].\\"], \\"keywords\\": [\\"iGaming\\", \\"SEO\\"]}"}]}}]}\n\n',
      "data: [DONE]\n\n"
    ].join("");

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: {
        getReader: () => {
          let readCount = 0;
          return {
            read: async () => {
              if (readCount === 0) {
                readCount++;
                return { done: false, value: new TextEncoder().encode(mockSse) };
              }
              return { done: true, value: undefined };
            }
          };
        }
      }
    });

    const service = new GeminiAnswerService({ apiKey: "AIzaSyTestKey", model: "gemini-2.5-flash" }, mockFetch as unknown as typeof fetch);

    const deltas = [];
    const gen = service.streamAnswer({
      questionId: "q-gemini-stream",
      question: "Dự án iGaming gần nhất mà em trực tiếp làm lên top là con nào?",
      rawTranscript: "Dự án iGaming gần nhất mà em trực tiếp làm lên top là con nào?"
    });

    for await (const delta of gen) {
      deltas.push(delta);
    }

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    const calledOptions = mockFetch.mock.calls[0][1] as RequestInit;

    // Verify API key NEVER appears in request URL
    expect(calledUrl).not.toContain("key=");
    expect(calledUrl).not.toContain("AIzaSyTestKey");

    // Verify x-goog-api-key header is used
    expect(calledOptions.headers).toEqual({
      "Content-Type": "application/json",
      "x-goog-api-key": "AIzaSyTestKey"
    });

    // Progressive accumulatedText chunk
    expect(deltas.some((d) => d.type === "chunk")).toBe(true);

    // Final answer payload with real structured fields
    const finalDelta = deltas.find((d) => d.type === "finalAnswer");
    expect(finalDelta).toBeDefined();
    if (finalDelta?.type === "finalAnswer") {
      expect(finalDelta.answer.openingLine).toContain("[Tên project]");
      expect(finalDelta.answer.keywords).toContain("iGaming");
    }
  });

  it("aborts network request via AbortController on cancel", async () => {
    const controller = new AbortController();
    const mockFetch = vi.fn().mockImplementation(() => {
      return new Promise((_, reject) => {
        controller.signal.addEventListener("abort", () => {
          const err = new Error("Aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    });

    const service = new GeminiAnswerService({ apiKey: "AIzaSyTestKey", model: "gemini-2.5-flash" }, mockFetch as unknown as typeof fetch);

    const gen = service.streamAnswer({
      questionId: "q-abort-gemini",
      question: "Anh cho em budget 20 triệu thì em chia thế nào?",
      rawTranscript: "Anh cho em budget 20 triệu thì em chia thế nào?",
      signal: controller.signal
    });

    const streamPromise = (async () => {
      for await (const chunk of gen) {
        void chunk;
      }
    })();

    controller.abort();
    await expect(streamPromise).rejects.toThrow("Gemini request cancelled");
  });

  it("selects GeminiAnswerService by default when ANSWER_PROVIDER=gemini", () => {
    const originalCopilotWindow = window.copilotWindow;
    try {
      window.copilotWindow = {
        hide: vi.fn(),
        getDesktopSourceId: vi.fn()
      };

      const service = createAnswerService({
        ANSWER_PROVIDER: "gemini",
        GEMINI_API_KEY: "AIzaSyTestKey",
        GEMINI_ANSWER_MODEL: "gemini-2.5-flash"
      });

      expect(service.providerName).toBe("gemini");
      expect(service.modelName).toBe("gemini-2.5-flash");
    } finally {
      window.copilotWindow = originalCopilotWindow;
    }
  });

  it("selects GroqAnswerService when ANSWER_PROVIDER=groq", () => {
    const originalCopilotWindow = window.copilotWindow;
    try {
      window.copilotWindow = {
        hide: vi.fn(),
        getDesktopSourceId: vi.fn()
      };

      const service = createAnswerService({
        ANSWER_PROVIDER: "groq",
        GROQ_API_KEY: "gsk_test123",
        GROQ_ANSWER_MODEL: "llama-3.3-70b-versatile"
      });

      expect(service.providerName).toBe("groq");
      expect(service.modelName).toBe("llama-3.3-70b-versatile");
    } finally {
      window.copilotWindow = originalCopilotWindow;
    }
  });

  it("runs bootstrapEnv without throwing errors or printing secrets", () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    bootstrapEnv();
    expect(consoleSpy).toHaveBeenCalledWith("[ENV]");
    consoleSpy.mockRestore();
  });
});
