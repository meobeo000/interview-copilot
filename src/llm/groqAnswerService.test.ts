import { describe, expect, it, vi } from "vitest";
import { GroqAnswerService, readGroqAnswerConfig } from "./groqAnswerService";
import { MainBridgeAnswerService } from "./mainBridgeAnswerService";
import { createAnswerService } from "./factory";
import type { AnswerRequest } from "./types";

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

  it("streams answer tokens progressively to UI before stream completion", async () => {
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

    // Verify first token delta was yielded progressively
    expect(deltas.length).toBeGreaterThan(0);
    expect(deltas[0].type).toBe("openingLine");
    expect(deltas[0].value).toContain("Dự án gần nhất");
  });

  it("uses MainBridgeAnswerService when window.copilotWindow.answer is available in renderer", () => {
    const originalCopilotWindow = window.copilotWindow;
    try {
      window.copilotWindow = {
        hide: vi.fn(),
        getDesktopSourceId: vi.fn(),
        answer: {
          generateAnswer: vi.fn(),
          cancelAnswer: vi.fn(),
          onChunk: vi.fn().mockReturnValue(() => {}),
          onComplete: vi.fn().mockReturnValue(() => {}),
          onError: vi.fn().mockReturnValue(() => {})
        }
      };

      const service = createAnswerService({
        ANSWER_PROVIDER: "groq"
      });

      expect(service).toBeInstanceOf(MainBridgeAnswerService);
      expect(service.providerName).toBe("groq");
    } finally {
      window.copilotWindow = originalCopilotWindow;
    }
  });

  it("selects GroqAnswerService when running in main process environment with GROQ_API_KEY", () => {
    const originalCopilotWindow = window.copilotWindow;
    try {
      // Remove window.copilotWindow.answer to simulate main process environment
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
