import type { BrowserWindow } from "electron";
import { createAnswerService } from "../llm/factory";
import type { AnswerRequest, AnswerService } from "../llm/types";
import type { SuggestedAnswer } from "../shared/types";
import { AnswerTraceLogger } from "../shared/answerTrace";

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

    const provider = this.activeAnswerService.providerName;
    const model = this.activeAnswerService.modelName;

    AnswerTraceLogger.startTrace(request.questionId, {
      questionId: request.questionId,
      provider,
      model,
      mode: (request as unknown as { mode?: "speculative" | "committed" | "manual" }).mode || "committed",
      requestCreated: Date.now()
    });

    let finalAnswer: SuggestedAnswer | undefined;
    let lastAccumulatedText = "";
    let firstIpcChunkSentAt: number | undefined;

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
          if (firstIpcChunkSentAt === undefined) {
            firstIpcChunkSentAt = Date.now();
            AnswerTraceLogger.record(request.questionId, {
              ipcChunkSent: firstIpcChunkSentAt
            });
          }
          window.webContents.send("answer:chunk", {
            questionId: request.questionId,
            accumulatedText: delta.accumulatedText
          });
        } else if (delta.type === "finalAnswer") {
          finalAnswer = delta.answer;
        }
      }

      // If generator yielded zero text chunks and no final answer, fail explicitly
      if (!lastAccumulatedText.trim() && !finalAnswer) {
        throw new Error("Gemini không trả về câu trả lời (Empty response stream).");
      }

      // 2. Ensure real normalized final answer survives IPC completion
      if (this.activeQuestionId === request.questionId && !this.activeAbortController.signal.aborted) {
        const payloadAnswer: SuggestedAnswer = finalAnswer || {
          openingLine: lastAccumulatedText.trim(),
          bullets: [],
          keywords: ["SEO"],
          confidence: 0.9
        };

        AnswerTraceLogger.completeTrace(request.questionId, {
          answerComplete: {
            wordCount: (payloadAnswer.openingLine + " " + payloadAnswer.bullets.join(" ")).split(/\s+/).filter(Boolean).length,
            time: Date.now()
          }
        });

        window.webContents.send("answer:complete", {
          questionId: request.questionId,
          answer: payloadAnswer
        });
      }
    } catch (error) {
      if (this.activeAbortController?.signal.aborted) {
        return;
      }
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[ANSWER ERROR] ${provider}/${model} failed for ${request.questionId}:`, errorMsg);

      if (this.activeQuestionId === request.questionId) {
        window.webContents.send("answer:error", {
          questionId: request.questionId,
          error: `Gemini không trả về câu trả lời (${errorMsg})`
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
