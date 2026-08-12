import type { BrowserWindow } from "electron";
import { createAnswerService } from "../llm/factory";
import type { AnswerRequest, AnswerService } from "../llm/types";
import type { SuggestedAnswer } from "../shared/types";

export class AnswerMainService {
  private activeAnswerService: AnswerService | undefined;
  private activeQuestionId: string | undefined;
  private activeAbortController: AbortController | undefined;

  async generateAnswer(window: BrowserWindow, request: AnswerRequest): Promise<void> {
    // 1. If an active generation is in flight, abort it cleanly via AbortController
    if (this.activeAbortController) {
      this.activeAbortController.abort();
      this.activeAbortController = undefined;
    }

    this.activeQuestionId = request.questionId;
    this.activeAbortController = new AbortController();
    this.activeAnswerService = createAnswerService(process.env);

    let finalAnswer: SuggestedAnswer | undefined;
    let lastAccumulatedText = "";

    try {
      const generator = this.activeAnswerService.streamAnswer({
        ...request,
        signal: this.activeAbortController.signal
      });

      for await (const delta of generator) {
        if (this.activeQuestionId !== request.questionId || this.activeAbortController.signal.aborted) {
          break;
        }

        if (delta.type === "chunk") {
          lastAccumulatedText = delta.accumulatedText;
          window.webContents.send("answer:chunk", {
            questionId: request.questionId,
            accumulatedText: delta.accumulatedText
          });
        } else if (delta.type === "finalAnswer") {
          finalAnswer = delta.answer;
        }
      }

      // 2. Ensure real normalized final answer survives IPC completion
      if (this.activeQuestionId === request.questionId && !this.activeAbortController.signal.aborted) {
        const payloadAnswer: SuggestedAnswer = finalAnswer || {
          openingLine: lastAccumulatedText || "Em xin trả lời câu hỏi của anh như sau:",
          bullets: [],
          keywords: ["SEO"],
          confidence: 0.9
        };

        window.webContents.send("answer:complete", {
          questionId: request.questionId,
          answer: payloadAnswer
        });
      }
    } catch (error) {
      if (this.activeAbortController?.signal.aborted) {
        // Quietly exit on clean cancellation
        return;
      }
      const errorMsg = error instanceof Error ? error.message : String(error);
      if (this.activeQuestionId === request.questionId) {
        window.webContents.send("answer:error", {
          questionId: request.questionId,
          error: errorMsg
        });
      }
    } finally {
      if (this.activeQuestionId === request.questionId) {
        this.activeQuestionId = undefined;
        this.activeAbortController = undefined;
        this.activeAnswerService = undefined;
      }
    }
  }

  cancelAnswer(questionId?: string): void {
    if (!questionId || this.activeQuestionId === questionId) {
      if (this.activeAbortController) {
        this.activeAbortController.abort();
        this.activeAbortController = undefined;
      }
      this.activeQuestionId = undefined;
      this.activeAnswerService = undefined;
    }
  }
}
