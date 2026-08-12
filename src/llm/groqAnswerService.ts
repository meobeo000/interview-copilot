import type { AnswerDelta, AnswerRequest, AnswerService } from "./types";
import type { SuggestedAnswer } from "../shared/types";
import { SEO_INTERVIEW_SYSTEM_PROMPT } from "./prompts/seoInterviewPrompt";

export interface GroqAnswerConfig {
  apiKey: string;
  model: string;
}

export function readGroqAnswerConfig(env: Record<string, string | undefined> = process.env): GroqAnswerConfig {
  const apiKey = env.GROQ_API_KEY?.trim() ?? "";
  const model = env.GROQ_ANSWER_MODEL?.trim() || "llama-3.3-70b-versatile";

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

export class GroqAnswerService implements AnswerService {
  readonly providerName = "groq";
  readonly modelName: string;
  private readonly apiKey: string;
  private readonly fetchFn: typeof fetch;

  constructor(
    config: GroqAnswerConfig = readGroqAnswerConfig(),
    fetchFn: typeof fetch = globalThis.fetch ? globalThis.fetch.bind(globalThis) : fetch
  ) {
    this.apiKey = config.apiKey;
    this.modelName = config.model;
    this.fetchFn = fetchFn;
  }

  async *streamAnswer(request: AnswerRequest): AsyncGenerator<AnswerDelta, SuggestedAnswer, void> {
    if (!this.apiKey) {
      throw new Error("Groq Answer generation error: GROQ_API_KEY is missing. Check .env configuration.");
    }

    const startTime = Date.now();
    let firstTokenTime: number | undefined;

    const payload = {
      model: this.modelName,
      messages: [
        { role: "system", content: SEO_INTERVIEW_SYSTEM_PROMPT },
        { role: "user", content: `Interviewer Question:\n"${request.question}"` }
      ],
      temperature: 0.3,
      stream: true,
      response_format: { type: "json_object" }
    };

    let response: Response;
    try {
      response = await this.fetchFn("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Groq connection error: ${msg.replace(this.apiKey, "[REDACTED]")}`);
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
      throw new Error(`Groq API error (${response.status}): ${detail.replace(this.apiKey, "[REDACTED]")}`);
    }

    if (!response.body) {
      throw new Error("Groq API error: response body is null");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let accumulatedText = "";
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      if (firstTokenTime === undefined) {
        firstTokenTime = Date.now();
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(":")) {
          continue;
        }
        if (trimmed === "data: [DONE]") {
          break;
        }

        if (trimmed.startsWith("data: ")) {
          const jsonStr = trimmed.slice(6);
          try {
            const parsed = JSON.parse(jsonStr) as {
              choices?: Array<{ delta?: { content?: string } }>;
            };
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              accumulatedText += content;
            }
          } catch {
            // Ignore partial SSE tokens
          }
        }
      }
    }

    const totalTime = Date.now() - startTime;
    const ttft = firstTokenTime ? firstTokenTime - startTime : totalTime;

    if (process.env.NODE_ENV !== "production") {
      console.log(`[ANSWER]`);
      console.log(`questionId: ${request.questionId}`);
      console.log(`provider: ${this.providerName}`);
      console.log(`model: ${this.modelName}`);
      console.log(`timeToFirstToken: ${ttft} ms`);
      console.log(`totalGenerationTime: ${totalTime} ms`);
    }

    const finalAnswer = parseAnswerJson(accumulatedText);

    // Yield progressive chunks
    yield { type: "openingLine", value: finalAnswer.openingLine };
    for (const bullet of finalAnswer.bullets) {
      yield { type: "bullet", value: bullet };
    }
    yield { type: "keywords", value: finalAnswer.keywords };
    yield { type: "confidence", value: finalAnswer.confidence ?? 0.95 };

    return finalAnswer;
  }
}
