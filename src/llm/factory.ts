import { GeminiAnswerService, readGeminiAnswerConfig } from "./geminiAnswerService";
import { GroqAnswerService, readGroqAnswerConfig } from "./groqAnswerService";
import { OpenAIAnswerService, readOpenAIAnswerConfig } from "./openaiAnswerService";
import { MainBridgeAnswerService } from "./mainBridgeAnswerService";
import { MockAnswerService } from "./mockAnswerService";
import type { AnswerService } from "./types";

type GlobalWindow = {
  copilotWindow?: {
    answer?: {
      generateAnswer?: unknown;
    };
  };
};

export function createAnswerService(env: Record<string, string | undefined> = process.env): AnswerService {
  const globalWin = (typeof globalThis !== "undefined" ? globalThis : {}) as unknown as GlobalWindow;
  if (typeof globalWin.copilotWindow?.answer?.generateAnswer === "function") {
    return new MainBridgeAnswerService();
  }

  const provider = env.ANSWER_PROVIDER?.trim().toLowerCase() || (env.NODE_ENV === "test" ? "mock" : "gemini");

  if (provider === "mock") {
    return new MockAnswerService();
  }

  if (provider === "groq") {
    const groqConfig = readGroqAnswerConfig(env);
    return new GroqAnswerService(groqConfig);
  }

  if (provider === "openai") {
    const openaiConfig = readOpenAIAnswerConfig(env);
    return new OpenAIAnswerService(openaiConfig);
  }

  // Default provider: gemini
  const geminiConfig = readGeminiAnswerConfig(env);
  return new GeminiAnswerService(geminiConfig);
}
