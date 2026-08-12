import type { BrowserWindow } from "electron";
import { createAnswerService } from "../llm/factory";
import type { AnswerRequest, AnswerService } from "../llm/types";
import type { SuggestedAnswer } from "../shared/types";

export class AnswerMainService {
  private activeAnswerService: AnswerService | undefined;
  private activeQuestionId: string | undefined;

  async generateAnswer(window: BrowserWindow, request: AnswerRequest): Promise<void> {
    this.activeQuestionId = request.questionId;
    this.activeAnswerService = createAnswerService(process.env);

    let accumulatedText = "";
    let finalAnswer: SuggestedAnswer | undefined;

    try {
      const generator = this.activeAnswerService.streamAnswer(request);

      for await (const delta of generator) {
        if (this.activeQuestionId !== request.questionId) {
          // Cancelled or superseded by a new question request
          break;
        }

        if (delta.type === "openingLine") {
          accumulatedText = delta.value;
          window.webContents.send("answer:chunk", {
            questionId: request.questionId,
            deltaText: delta.value,
            accumulatedText
          });
        }
      }

      if (this.activeQuestionId === request.questionId) {
        // Complete event with normalized structured answer
        finalAnswer = {
          openingLine: accumulatedText || "Em xin trả lời câu hỏi của anh như sau:",
          bullets: [],
          keywords: ["SEO", "Strategy"],
          confidence: 0.95
        };

        window.webContents.send("answer:complete", {
          questionId: request.questionId,
          answer: finalAnswer
        });
      }
    } catch (error) {
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
        this.activeAnswerService = undefined;
      }
    }
  }

  cancelAnswer(questionId?: string): void {
    if (!questionId || this.activeQuestionId === questionId) {
      this.activeQuestionId = undefined;
      this.activeAnswerService = undefined;
    }
  }
}
