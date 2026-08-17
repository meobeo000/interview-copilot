import type { AnswerDelta, AnswerRequest, AnswerService } from "./types";
import type { SuggestedAnswer } from "../shared/types";
import { AnswerTraceLogger } from "../shared/answerTrace";

type GlobalWindow = {
  copilotWindow?: {
    answer?: {
      generateAnswer: (req: {
        questionId: string;
        question: string;
        rawTranscript: string;
        questionCommittedAt?: number;
        speechLastActivityAt?: number;
        speechEndedAt?: number;
        questionIntentReadyAt?: number;
        profile?: unknown;
        intent?: unknown;
      }) => Promise<void>;
      cancelAnswer: (questionId?: string) => Promise<void>;
      onChunk: (cb: (payload: { questionId: string; accumulatedText: string }) => void) => () => void;
      onComplete: (cb: (payload: { questionId: string; answer: unknown }) => void) => () => void;
      onError: (cb: (payload: { questionId: string; error: string }) => void) => () => void;
    };
  };
};

export class MainBridgeAnswerService implements AnswerService {
  readonly providerName = "gemini";
  readonly modelName = "main-process-model";

  async *streamAnswer(request: AnswerRequest): AsyncGenerator<AnswerDelta, SuggestedAnswer, void> {
    const globalWin = (typeof globalThis !== "undefined" ? globalThis : {}) as unknown as GlobalWindow;
    const answerApi = globalWin.copilotWindow?.answer;

    if (!answerApi?.generateAnswer) {
      throw new Error("MainBridgeAnswerService is only available when running in Electron with IPC bridge.");
    }

    let resolveCompleted: (ans: SuggestedAnswer) => void;
    let rejectError: (err: Error) => void;

    const completionPromise = new Promise<SuggestedAnswer>((resolve, reject) => {
      resolveCompleted = resolve;
      rejectError = reject;
    });

    const pendingDeltas: AnswerDelta[] = [];
    let notifyNext: (() => void) | undefined;
    let firstRendererChunkReceivedAt: number | undefined;

    const pushDelta = (delta: AnswerDelta) => {
      pendingDeltas.push(delta);
      if (notifyNext) {
        const cb = notifyNext;
        notifyNext = undefined;
        cb();
      }
    };

    const cleanupChunk = answerApi.onChunk((payload: { questionId: string; accumulatedText: string }) => {
      if (payload.questionId === request.questionId) {
        if (firstRendererChunkReceivedAt === undefined) {
          firstRendererChunkReceivedAt = Date.now();
          AnswerTraceLogger.record(request.questionId, {
            rendererChunkReceived: firstRendererChunkReceivedAt
          });
        }
        pushDelta({ type: "chunk", accumulatedText: payload.accumulatedText });
      }
    });

    const cleanupComplete = answerApi.onComplete((payload: { questionId: string; answer: unknown }) => {
      if (payload.questionId === request.questionId) {
        const finalAns = payload.answer as SuggestedAnswer;
        pushDelta({ type: "finalAnswer", answer: finalAns });
        resolveCompleted(finalAns);
        if (notifyNext) {
          const cb = notifyNext;
          notifyNext = undefined;
          cb();
        }
      }
    });

    const cleanupError = answerApi.onError((payload: { questionId: string; error: string }) => {
      if (payload.questionId === request.questionId) {
        rejectError(new Error(payload.error));
        if (notifyNext) {
          const cb = notifyNext;
          notifyNext = undefined;
          cb();
        }
      }
    });

    const abortHandler = () => {
      answerApi.cancelAnswer(request.questionId);
    };

    if (request.signal) {
      request.signal.addEventListener("abort", abortHandler, { once: true });
    }

    try {
      void answerApi.generateAnswer({
        questionId: request.questionId,
        question: request.question,
        rawTranscript: request.rawTranscript,
        questionCommittedAt: request.questionCommittedAt,
        speechLastActivityAt: request.speechLastActivityAt,
        speechEndedAt: request.speechEndedAt,
        questionIntentReadyAt: request.questionIntentReadyAt,
        profile: request.profile,
        intent: request.intent
      });

      let isDone = false;

      void completionPromise
        .then(() => {
          isDone = true;
        })
        .catch(() => {
          isDone = true;
        });

      while (!isDone || pendingDeltas.length > 0) {
        if (request.signal?.aborted) {
          throw new Error("Answer request cancelled");
        }
        if (pendingDeltas.length > 0) {
          const delta = pendingDeltas.shift()!;
          yield delta;
        } else {
          await new Promise<void>((r) => {
            notifyNext = r;
          });
        }
      }

      const res = await completionPromise;
      return res;
    } finally {
      if (request.signal) {
        request.signal.removeEventListener("abort", abortHandler);
      }
      cleanupChunk();
      cleanupComplete();
      cleanupError();
    }
  }
}
