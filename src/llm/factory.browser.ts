/**
 * Browser-side factory: always delegates to MainBridgeAnswerService.
 * The real provider selection (gemini/groq/mock) happens in Electron main process.
 * This file is used by Vite renderer build; it must NOT import node-only modules.
 */
import { MainBridgeAnswerService } from "./mainBridgeAnswerService";
import type { AnswerService } from "./types";

export function createAnswerService(): AnswerService {
  return new MainBridgeAnswerService();
}
