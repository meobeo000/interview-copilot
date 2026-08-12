import { describe, expect, it, vi } from "vitest";
import { GroqAnswerService, readGroqAnswerConfig } from "./groqAnswerService";
import { createAnswerService } from "./factory";
import type { AnswerRequest } from "./types";

describe("GroqAnswerService", () => {
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

  it("streams answer JSON for Personal Experience question with placeholders", async () => {
    const mockResponseBody = [
      'data: {"choices":[{"delta":{"content":"{\\"openingLine\\": \\"Dự án gần nhất em trực tiếp triển khai là [Tên project] target thị trường [GEO].\\", \\"bullets\\": [\\"Lúc nhận site keyword [___] đang ở position [___].\\", \\"Em tập trung audit entity và làm lại internal link.\\"], \\"keywords\\": [\\"iGaming\\", \\"SEO\\"]}"}}]}\n\n',
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
                return { done: false, value: new TextEncoder().encode(mockResponseBody) };
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

    expect(deltas.some((d) => d.type === "openingLine" && d.value.includes("[Tên project]"))).toBe(true);
    expect(deltas.some((d) => d.type === "bullet")).toBe(true);
  });

  it("selects GroqAnswerService when ANSWER_PROVIDER=groq", () => {
    const service = createAnswerService({
      ANSWER_PROVIDER: "groq",
      GROQ_API_KEY: "gsk_sample",
      GROQ_ANSWER_MODEL: "llama-3.3-70b-versatile"
    });

    expect(service.providerName).toBe("groq");
    expect(service.modelName).toBe("llama-3.3-70b-versatile");
  });

  it("selects MockAnswerService when ANSWER_PROVIDER=mock", () => {
    const service = createAnswerService({
      ANSWER_PROVIDER: "mock"
    });

    expect(service.providerName).toBe("mock");
  });
});
