import { describe, expect, it, vi } from "vitest";
import { GroqAnswerService, readGroqAnswerConfig } from "./groqAnswerService";
import { MainBridgeAnswerService } from "./mainBridgeAnswerService";
import { createAnswerService } from "./factory";
import type { AnswerRequest } from "./types";
import type { SuggestedAnswer } from "../shared/types";

describe("GroqAnswerService & Main Process Bridge Architecture", () => {
  it("reads config from process.env with defaults", () => {
    const config = readGroqAnswerConfig({
      GROQ_API_KEY: "gsk_test12345"
    });

    expect(config.apiKey).toBe("gsk_test12345");
    expect(config.model).toBe("llama-3.3-70b-versatile");
  });

  it("throws clear error when GROQ_API_KEY is missing", async () => {
    const service = new GroqAnswerService({ apiKey: "", model: "llama-3.3-70b-versatile" });
    const req: AnswerRequest = {
      questionId: "q1",
      question: "Dự án iGaming gần nhất mà em làm là con nào?",
      rawTranscript: "Dự án iGaming gần nhất mà em làm là con nào?"
    };

    const gen = service.streamAnswer(req);
    await expect(gen.next()).rejects.toThrow("GROQ_API_KEY is missing");
  });

  it("streams answer tokens progressively as accumulatedText chunks before completion", async () => {
    const chunk1 = 'data: {"choices":[{"delta":{"content":"Dự án gần nhất "}}]}\n\n';
    const chunk2 = 'data: {"choices":[{"delta":{"content":"em làm là [Tên project]."}}\n\n';
    const chunkDone = "data: [DONE]\n\n";

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: {
        getReader: () => {
          let step = 0;
          return {
            read: async () => {
              if (step === 0) {
                step++;
                return { done: false, value: new TextEncoder().encode(chunk1) };
              }
              if (step === 1) {
                step++;
                return { done: false, value: new TextEncoder().encode(chunk2 + chunkDone) };
              }
              return { done: true, value: undefined };
            }
          };
        }
      }
    });

    const service = new GroqAnswerService({ apiKey: "gsk_valid_key", model: "llama-3.3-70b-versatile" }, mockFetch as unknown as typeof fetch);

    const deltas = [];
    const gen = service.streamAnswer({
      questionId: "q-personal",
      question: "Dự án iGaming gần nhất mà em trực tiếp làm lên top là con nào?",
      rawTranscript: "Dự án iGaming gần nhất mà em trực tiếp làm lên top là con nào?"
    });

    for await (const chunk of gen) {
      deltas.push(chunk);
    }

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.groq.com/openai/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer gsk_valid_key"
        })
      })
    );

    // Verify chunk 1 arrives progressively
    expect(deltas[0].type).toBe("chunk");
    if (deltas[0].type === "chunk") {
      expect(deltas[0].accumulatedText).toBe("Dự án gần nhất ");
    }

    // Verify finalAnswer delta contains final answer
    const finalDelta = deltas.find((d) => d.type === "finalAnswer");
    expect(finalDelta).toBeDefined();
    if (finalDelta?.type === "finalAnswer") {
      expect(finalDelta.answer.confidence).toBeDefined();
      expect(Array.isArray(finalDelta.answer.bullets)).toBe(true);
      expect(Array.isArray(finalDelta.answer.keywords)).toBe(true);
    }
  });

  it("aborts network request via AbortController when signal is aborted", async () => {
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

    const service = new GroqAnswerService({ apiKey: "gsk_valid_key", model: "llama-3.3-70b-versatile" }, mockFetch as unknown as typeof fetch);

    const gen = service.streamAnswer({
      questionId: "q-abort",
      question: "Site mở bot rồi nhưng hai tuần không nhận key?",
      rawTranscript: "Site mở bot rồi nhưng hai tuần không nhận key?",
      signal: controller.signal
    });

    const streamPromise = (async () => {
      for await (const chunk of gen) {
        void chunk;
      }
    })();

    controller.abort();
    await expect(streamPromise).rejects.toThrow("Groq request cancelled");
  });

  it("uses MainBridgeAnswerService in renderer without leaking API key", () => {
    const originalCopilotWindow = window.copilotWindow;
    try {
      let onChunkCb: ((p: { questionId: string; accumulatedText: string }) => void) | undefined;
      let onCompleteCb: ((p: { questionId: string; answer: unknown }) => void) | undefined;

      const mockGenerate = vi.fn().mockImplementation(({ questionId }) => {
        setTimeout(() => {
          onChunkCb?.({ questionId, accumulatedText: "Dự án [Tên project]" });
          onCompleteCb?.({
            questionId,
            answer: {
              openingLine: "Dự án [Tên project]",
              bullets: ["Bullet 1", "Bullet 2"],
              keywords: ["Ahrefs", "GSC"],
              confidence: 0.95
            } as SuggestedAnswer
          });
        }, 10);
        return Promise.resolve();
      });

      window.copilotWindow = {
        hide: vi.fn(),
        getDesktopSourceId: vi.fn(),
        answer: {
          generateAnswer: mockGenerate,
          cancelAnswer: vi.fn(),
          onChunk: (cb) => {
            onChunkCb = cb;
            return () => {};
          },
          onComplete: (cb) => {
            onCompleteCb = cb;
            return () => {};
          },
          onError: vi.fn().mockReturnValue(() => {})
        }
      };

      const service = createAnswerService({ ANSWER_PROVIDER: "groq" });
      expect(service).toBeInstanceOf(MainBridgeAnswerService);

      // Verify GROQ_API_KEY is NOT exposed on service or renderer window
      expect((service as unknown as { apiKey?: string }).apiKey).toBeUndefined();
    } finally {
      window.copilotWindow = originalCopilotWindow;
    }
  });

  it("selects GroqAnswerService when running in main process environment", () => {
    const originalCopilotWindow = window.copilotWindow;
    try {
      window.copilotWindow = {
        hide: vi.fn(),
        getDesktopSourceId: vi.fn()
      };

      const service = createAnswerService({
        ANSWER_PROVIDER: "groq",
        GROQ_API_KEY: "gsk_sample",
        GROQ_ANSWER_MODEL: "llama-3.3-70b-versatile"
      });

      expect(service.providerName).toBe("groq");
      expect(service.modelName).toBe("llama-3.3-70b-versatile");
    } finally {
      window.copilotWindow = originalCopilotWindow;
    }
  });
});
