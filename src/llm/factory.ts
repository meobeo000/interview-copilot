import { GroqAnswerService, readGroqAnswerConfig } from "./groqAnswerService";
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

  const provider = env.ANSWER_PROVIDER?.trim().toLowerCase() || (env.NODE_ENV === "test" ? "mock" : "groq");

  if (provider === "mock") {
    return new MockAnswerService();
  }

  const groqConfig = readGroqAnswerConfig(env);
  return new GroqAnswerService(groqConfig);
}
