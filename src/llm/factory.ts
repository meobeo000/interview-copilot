import { GroqAnswerService, readGroqAnswerConfig } from "./groqAnswerService";
import { MockAnswerService } from "./mockAnswerService";
import type { AnswerService } from "./types";

export function createAnswerService(env: Record<string, string | undefined> = process.env): AnswerService {
  const provider = env.ANSWER_PROVIDER?.trim().toLowerCase() || (env.NODE_ENV === "test" ? "mock" : "groq");

  if (provider === "mock") {
    return new MockAnswerService();
  }

  const groqConfig = readGroqAnswerConfig(env);
  return new GroqAnswerService(groqConfig);
}
