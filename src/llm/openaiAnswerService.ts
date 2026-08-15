import type { AnswerDelta, AnswerRequest, AnswerService } from "./types";
import type { SuggestedAnswer } from "../shared/types";
import { SEO_INTERVIEW_SYSTEM_PROMPT } from "./prompts/seoInterviewPrompt";
import { parseAnswerJson } from "./parseAnswerJson";

export interface OpenAIAnswerConfig {
  apiKey: string;
  model: string;
}

export function readOpenAIAnswerConfig(env: Record<string, string | undefined> = process.env): OpenAIAnswerConfig {
  const apiKey = env.OPENAI_API_KEY?.trim() ?? "";
  const model = env.OPENAI_ANSWER_MODEL?.trim() || "gpt-4o-mini";
  return { apiKey, model };
}

export class OpenAIAnswerService implements AnswerService {
  readonly providerName = "openai";
  readonly modelName: string;
  private readonly apiKey: string;
  private readonly fetchFn: typeof fetch;

  constructor(
    config: OpenAIAnswerConfig = readOpenAIAnswerConfig(),
    fetchFn: typeof fetch = globalThis.fetch ? globalThis.fetch.bind(globalThis) : fetch
  ) {
    this.apiKey = config.apiKey;
    this.modelName = config.model;
    this.fetchFn = fetchFn;
  }

  async *streamAnswer(request: AnswerRequest): AsyncGenerator<AnswerDelta, SuggestedAnswer, void> {
    if (!this.apiKey) {
      throw new Error("OpenAI Answer generation error: OPENAI_API_KEY is missing. Check .env configuration.");
    }

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
      response = await this.fetchFn("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload),
        signal: request.signal
      });
    } catch (err) {
      if (request.signal?.aborted) {
        throw new Error("OpenAI request cancelled");
      }
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`OpenAI connection error: ${msg.replace(this.apiKey, "[REDACTED]")}`);
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
      throw new Error(`OpenAI API error (${response.status}): ${detail.replace(this.apiKey, "[REDACTED]")}`);
    }

    if (!response.body) {
      throw new Error("OpenAI API error: response body is null");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let accumulatedText = "";
    let buffer = "";

    while (true) {
      if (request.signal?.aborted) {
        await reader.cancel().catch(() => {});
        throw new Error("OpenAI request cancelled");
      }

      const { done, value } = await reader.read();
      if (done) {
        break;
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
              choices?: Array<{
                delta?: { content?: string };
              }>;
            };
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              accumulatedText += content;
              yield { type: "chunk", accumulatedText };
            }
          } catch {
            // Ignore incomplete streaming chunks
          }
        }
      }
    }

    const finalAnswer = parseAnswerJson(accumulatedText);
    yield { type: "finalAnswer", answer: finalAnswer };
    return finalAnswer;
  }
}
