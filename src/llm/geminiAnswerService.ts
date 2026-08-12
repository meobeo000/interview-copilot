import type { AnswerDelta, AnswerRequest, AnswerService } from "./types";
import type { SuggestedAnswer } from "../shared/types";
import { SEO_INTERVIEW_SYSTEM_PROMPT } from "./prompts/seoInterviewPrompt";

export interface GeminiAnswerConfig {
  apiKey: string;
  model: string;
}

export function readGeminiAnswerConfig(env: Record<string, string | undefined> = process.env): GeminiAnswerConfig {
  const apiKey = env.GEMINI_API_KEY?.trim() ?? "";
  const model = env.GEMINI_ANSWER_MODEL?.trim() || "gemini-2.5-flash";

  return { apiKey, model };
}

function parseAnswerJson(rawJsonText: string): SuggestedAnswer {
  try {
    const parsed = JSON.parse(rawJsonText) as {
      openingLine?: string;
      bullets?: string[];
      keywords?: string[];
    };

    return {
      openingLine: parsed.openingLine || "Em xin trả lời câu hỏi của anh như sau:",
      bullets: Array.isArray(parsed.bullets) ? parsed.bullets : [],
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
      confidence: 0.95
    };
  } catch {
    // If partial or non-strict JSON output occurs, return raw text split by bullet lines
    const lines = rawJsonText
      .split("\n")
      .map((l) => l.trim().replace(/^[-*•\d.]+\s*/, ""))
      .filter(Boolean);

    return {
      openingLine: lines[0] || rawJsonText || "Em xin trả lời câu hỏi của anh:",
      bullets: lines.slice(1),
      keywords: ["SEO", "Strategy"],
      confidence: 0.85
    };
  }
}

export class GeminiAnswerService implements AnswerService {
  readonly providerName = "gemini";
  readonly modelName: string;
  private readonly apiKey: string;
  private readonly fetchFn: typeof fetch;

  constructor(
    config: GeminiAnswerConfig = readGeminiAnswerConfig(),
    fetchFn: typeof fetch = globalThis.fetch ? globalThis.fetch.bind(globalThis) : fetch
  ) {
    this.apiKey = config.apiKey;
    this.modelName = config.model;
    this.fetchFn = fetchFn;
  }

  async *streamAnswer(request: AnswerRequest): AsyncGenerator<AnswerDelta, SuggestedAnswer, void> {
    if (!this.apiKey) {
      throw new Error("Gemini Answer configuration error: GEMINI_API_KEY is missing. Check .env file.");
    }

    const startTime = Date.now();
    let networkTTFT: number | undefined;
    let visibleTTFA: number | undefined;

    const payload = {
      system_instruction: {
        parts: [{ text: SEO_INTERVIEW_SYSTEM_PROMPT }]
      },
      contents: [
        {
          role: "user",
          parts: [{ text: `Interviewer Question:\n"${request.question}"` }]
        }
      ],
      generationConfig: {
        temperature: 0.3,
        responseMimeType: "application/json"
      }
    };

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.modelName)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(this.apiKey)}`;

    let response: Response;
    try {
      response = await this.fetchFn(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload),
        signal: request.signal
      });
    } catch (err) {
      if (request.signal?.aborted) {
        throw new Error("Gemini request cancelled");
      }
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Gemini Network error: ${msg.replace(this.apiKey, "[REDACTED]")}`);
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      let detail = `HTTP ${response.status} ${response.statusText}`;
      try {
        const parsed = JSON.parse(errorText) as { error?: { message?: string } };
        if (parsed.error?.message) {
          detail = parsed.error.message;
        }
      } catch {
        if (errorText) {
          detail = errorText.slice(0, 150);
        }
      }

      const cleanDetail = detail.replace(this.apiKey, "[REDACTED]");

      if (response.status === 401 || response.status === 403) {
        throw new Error(`Gemini Authentication error (HTTP ${response.status}): ${cleanDetail}`);
      }
      if (response.status === 429) {
        throw new Error(`Gemini Quota error (HTTP 429): ${cleanDetail}`);
      }
      if (response.status === 404) {
        throw new Error(`Gemini Model error (HTTP 404): Model '${this.modelName}' is unavailable or not found.`);
      }
      if (response.status >= 500) {
        throw new Error(`Gemini Server error (HTTP ${response.status}): ${cleanDetail}`);
      }
      throw new Error(`Gemini API error (${response.status}): ${cleanDetail}`);
    }

    if (!response.body) {
      throw new Error("Gemini API error: response body is null");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let accumulatedText = "";
    let buffer = "";

    while (true) {
      if (request.signal?.aborted) {
        await reader.cancel().catch(() => {});
        throw new Error("Gemini request cancelled");
      }

      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      if (networkTTFT === undefined) {
        networkTTFT = Date.now() - startTime;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(":")) {
          continue;
        }

        if (trimmed.startsWith("data: ")) {
          const jsonStr = trimmed.slice(6);
          try {
            const parsed = JSON.parse(jsonStr) as {
              candidates?: Array<{
                content?: {
                  parts?: Array<{ text?: string }>;
                };
              }>;
            };
            const parts = parsed.candidates?.[0]?.content?.parts;
            if (Array.isArray(parts)) {
              for (const part of parts) {
                if (part.text) {
                  accumulatedText += part.text;
                  if (visibleTTFA === undefined && accumulatedText.trim()) {
                    visibleTTFA = Date.now() - startTime;
                  }
                  // Yield progressive accumulatedText chunk
                  yield { type: "chunk", accumulatedText };
                }
              }
            }
          } catch {
            // Ignore partial SSE json parsing
          }
        }
      }
    }

    const totalTime = Date.now() - startTime;

    if (process.env.NODE_ENV !== "production") {
      console.log(`[ANSWER]`);
      console.log(`questionId: ${request.questionId}`);
      console.log(`provider: ${this.providerName}`);
      console.log(`model: ${this.modelName}`);
      console.log(`networkTTFT: ${networkTTFT ?? totalTime} ms`);
      console.log(`visibleTTFA: ${visibleTTFA ?? totalTime} ms`);
      console.log(`totalGenerationTime: ${totalTime} ms`);
    }

    const finalAnswer = parseAnswerJson(accumulatedText);

    // Yield final structured answer payload
    yield { type: "finalAnswer", answer: finalAnswer };

    return finalAnswer;
  }
}
