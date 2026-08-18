import { describe, expect, it, beforeEach, vi } from "vitest";
import { useCopilotStore } from "../renderer/store/useCopilotStore";
import { AnswerMainService } from "../electron/answerMainService";
import { validateFallbackAnswer } from "./fallbackAnswerBuilder";
import { buildAnswerContract } from "./answerContract";
import { DEFAULT_CANDIDATE_PROFILE } from "../shared/candidateProfile";
import { calculatePipelineMetrics } from "../shared/telemetry";
import type { AnswerDelta, AnswerRequest, AnswerService } from "./types";
import type { SuggestedAnswer } from "../shared/types";
import type { BrowserWindow } from "electron";

// Mock Failing Answer Service for Failure Injections
class MockFaultyAnswerService implements AnswerService {
  readonly providerName = "mock-faulty";
  readonly modelName = "mock-model";
  public failureMode: "NONE" | "RATE_LIMIT" | "TIMEOUT" | "NETWORK_ERROR" | "STREAM_ERROR" | "PARTIAL_STREAM_ERROR" = "NONE";

  constructor(failureMode: "NONE" | "RATE_LIMIT" | "TIMEOUT" | "NETWORK_ERROR" | "STREAM_ERROR" | "PARTIAL_STREAM_ERROR" = "NONE") {
    this.failureMode = failureMode;
  }

  async *streamAnswer(request: AnswerRequest): AsyncGenerator<AnswerDelta, SuggestedAnswer, void> {
    if (!request.question) throw new Error("Question required");
    if (this.failureMode === "RATE_LIMIT") {
      throw new Error("Gemini Quota error (HTTP 429): Resource has been exhausted.");
    }
    if (this.failureMode === "TIMEOUT") {
      throw new Error("Gemini request timed out after 10000ms.");
    }
    if (this.failureMode === "NETWORK_ERROR") {
      throw new Error("Gemini Network error: fetch failed (ENOTFOUND).");
    }
    if (this.failureMode === "STREAM_ERROR") {
      throw new Error("Gemini stream cancelled unexpectedly before first token.");
    }
    if (this.failureMode === "PARTIAL_STREAM_ERROR") {
      yield {
        type: "chunk",
        accumulatedText: "Với case này em ưu tiên kiểm tra dữ liệu GSC."
      };
      throw new Error("Gemini stream cancelled unexpectedly midway through generation.");
    }

    const answer: SuggestedAnswer = {
      openingLine: "Thực hiện kiểm tra Search Console trước.",
      bullets: ["- Kiểm tra CTR và impression."],
      keywords: ["GSC"],
      confidence: 0.95
    };
    yield { type: "finalAnswer", answer };
    return answer;
  }
}

function createMockWindow() {
  const sentMessages: { channel: string; payload: unknown }[] = [];
  const windowMock = {
    webContents: {
      send: (channel: string, payload: unknown) => {
        sentMessages.push({ channel, payload });
      }
    }
  } as unknown as BrowserWindow;

  return { windowMock, sentMessages };
}

describe("Fallback End-To-End Failure Injection & Telemetry Audit", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useCopilotStore.setState({
      status: "Idle",
      history: [],
      candidateProfile: DEFAULT_CANDIDATE_PROFILE
    });
  });

  describe("TASK 3 — Main Service IPC End-to-End Failure Injection", () => {
    const failureModes: Array<"RATE_LIMIT" | "TIMEOUT" | "NETWORK_ERROR" | "STREAM_ERROR"> = [
      "RATE_LIMIT",
      "TIMEOUT",
      "NETWORK_ERROR",
      "STREAM_ERROR"
    ];

    failureModes.forEach((mode) => {
      it(`injects ${mode} failure into AnswerMainService and receives valid SAFE_FALLBACK`, async () => {
        const faultyService = new MockFaultyAnswerService(mode);

        const answerMainService = new AnswerMainService(() => faultyService);
        const { windowMock, sentMessages } = createMockWindow();
        const question = "Tháng đầu tiên ngân sách 27 triệu, em phân bổ tiền cho Content, Entity, Guest Post và PBN thế nào?";
        const questionId = `turn-ipc-fail-${mode}`;

        const contract = buildAnswerContract({
          question,
          intent: "BUDGET_ALLOCATION",
          candidateProfile: DEFAULT_CANDIDATE_PROFILE
        });

        await answerMainService.generateAnswer(windowMock, {
          questionId,
          question,
          rawTranscript: question,
          intent: { category: "BUDGET_ALLOCATION", confidence: 0.9, normalizedQuestion: question, evidence: [] },
          contract,
          profile: DEFAULT_CANDIDATE_PROFILE
        });

        const completeMsg = sentMessages.find((m) => m.channel === "answer:complete");
        expect(completeMsg).toBeDefined();
        expect((completeMsg?.payload as { questionId: string }).questionId).toBe(questionId);

        const ans = (completeMsg?.payload as { answer: SuggestedAnswer }).answer;
        expect(ans).toBeDefined();
        expect(ans.answerSource).toBe("SAFE_FALLBACK");
        expect(ans.providerStatus).toBe(mode);
        expect(ans.fallbackReason).toBeTruthy();

        // Contract validation assertion
        const val = validateFallbackAnswer(ans, contract);
        expect(val.isValid).toBe(true);
        expect(val.emptyAnswer).toBe(false);
        expect(val.candidateSafetyViolation).toBe(false);
        expect(val.scenarioConstraintViolation).toBe(false);
        expect(val.numericContradiction).toBe(false);
      });
    });
  });

  describe("TASK 4 — Partial Stream Safety Policy Verification", () => {
    it("preserves exposed partial answer when stream fails midway and avoids appending SAFE_FALLBACK", async () => {
      const faultyService = new MockFaultyAnswerService("PARTIAL_STREAM_ERROR");

      const answerMainService = new AnswerMainService(() => faultyService);
      const { windowMock, sentMessages } = createMockWindow();
      const question = "10 money page tụt top nhưng không có Core Update và không bị manual action, em bóc tách lỗi gì trước?";
      const questionId = "turn-partial-stream-1";

      const contract = buildAnswerContract({
        question,
        intent: "GSC_RANKING_DROP",
        candidateProfile: DEFAULT_CANDIDATE_PROFILE
      });

      await answerMainService.generateAnswer(windowMock, {
        questionId,
        question,
        rawTranscript: question,
        intent: { category: "GSC_RANKING_DROP", confidence: 0.9, normalizedQuestion: question, evidence: [] },
        contract,
        profile: DEFAULT_CANDIDATE_PROFILE
      });

      // Verify chunk arrived first
      const chunkMsgs = sentMessages.filter((m) => m.channel === "answer:chunk");
      expect(chunkMsgs.length).toBeGreaterThan(0);
      expect((chunkMsgs[0].payload as { accumulatedText: string }).accumulatedText).toBe("Với case này em ưu tiên kiểm tra dữ liệu GSC.");

      // Verify final answer completes with exposed partial text
      const completeMsg = sentMessages.find((m) => m.channel === "answer:complete");
      expect(completeMsg).toBeDefined();
      const ans = (completeMsg?.payload as { answer: SuggestedAnswer }).answer;
      expect(ans.answerSource).toBe("GEMINI");
      expect(ans.providerStatus).toBe("STREAM_ERROR");
      expect(ans.openingLine).toBe("Với case này em ưu tiên kiểm tra dữ liệu GSC.");
      // Ensure SAFE_FALLBACK template was NOT appended to partial text
      expect(ans.openingLine).not.toContain("Với quy mô và case này, em chưa có");
    });

    it("uses SAFE_FALLBACK when stream fails before any token is emitted", async () => {
      const faultyService = new MockFaultyAnswerService("STREAM_ERROR");

      const answerMainService = new AnswerMainService(() => faultyService);
      const { windowMock, sentMessages } = createMockWindow();
      const question = "10 money page tụt top nhưng không có Core Update và không bị manual action, em bóc tách lỗi gì trước?";
      const questionId = "turn-zero-token-stream-1";

      const contract = buildAnswerContract({
        question,
        intent: "GSC_RANKING_DROP",
        candidateProfile: DEFAULT_CANDIDATE_PROFILE
      });

      await answerMainService.generateAnswer(windowMock, {
        questionId,
        question,
        rawTranscript: question,
        intent: { category: "GSC_RANKING_DROP", confidence: 0.9, normalizedQuestion: question, evidence: [] },
        contract,
        profile: DEFAULT_CANDIDATE_PROFILE
      });

      const chunkMsgs = sentMessages.filter((m) => m.channel === "answer:chunk");
      expect(chunkMsgs.length).toBe(0);

      const completeMsg = sentMessages.find((m) => m.channel === "answer:complete");
      expect(completeMsg).toBeDefined();
      const ans = (completeMsg?.payload as { answer: SuggestedAnswer }).answer;
      expect(ans.answerSource).toBe("SAFE_FALLBACK");
      expect(ans.providerStatus).toBe("STREAM_ERROR");
    });
  });

  describe("TASK 5 — Production Failure Telemetry Verification", () => {
    it("emits all 10 required telemetry fields from production runtime path", async () => {
      const faultyService = new MockFaultyAnswerService("RATE_LIMIT");
      const { windowMock, sentMessages } = createMockWindow();

      let chunkListeners: Array<(payload: unknown) => void> = [];
      let completeListeners: Array<(payload: unknown) => void> = [];
      let errorListeners: Array<(payload: unknown) => void> = [];

      // Mock IPC window bridge so MainBridgeAnswerService communicates with simulated AnswerMainService
      (globalThis as unknown as { window?: Record<string, unknown> }).window = (globalThis as unknown as { window?: Record<string, unknown> }).window || {};
      const winObj = (globalThis as unknown as { window: Record<string, unknown> }).window;
      winObj.copilotWindow = {
        hide: async () => {},
        answer: {
          generateAnswer: async (req: { question: string; intent?: { category: string } }) => {
            const intentCat = (req.intent?.category as unknown as import("../question-detector/intentClassifier").QuestionIntentCategory) || "BUDGET_ALLOCATION";
            const contract = buildAnswerContract({
              question: req.question,
              intent: intentCat,
              candidateProfile: DEFAULT_CANDIDATE_PROFILE
            });
            const mainSvc = new AnswerMainService(() => faultyService);
            const fullReq: AnswerRequest = {
              questionId: (req as unknown as { questionId?: string }).questionId || "turn-test-1",
              question: req.question,
              rawTranscript: req.question,
              contract,
              profile: DEFAULT_CANDIDATE_PROFILE
            };
            await mainSvc.generateAnswer(windowMock, fullReq);

            // Dispatch sent messages to bridge listeners asynchronously
            setTimeout(() => {
              for (const msg of sentMessages) {
                if (msg.channel === "answer:chunk") {
                  chunkListeners.forEach((l) => l(msg.payload));
                } else if (msg.channel === "answer:complete") {
                  completeListeners.forEach((l) => l(msg.payload));
                } else if (msg.channel === "answer:error") {
                  errorListeners.forEach((l) => l(msg.payload));
                }
              }
            }, 10);
          },
          cancelAnswer: async () => {},
          onChunk: (cb: (payload: unknown) => void) => {
            chunkListeners.push(cb);
            return () => {
              chunkListeners = chunkListeners.filter((l) => l !== cb);
            };
          },
          onComplete: (cb: (payload: unknown) => void) => {
            completeListeners.push(cb);
            return () => {
              completeListeners = completeListeners.filter((l) => l !== cb);
            };
          },
          onError: (cb: (payload: unknown) => void) => {
            errorListeners.push(cb);
            return () => {
              errorListeners = errorListeners.filter((l) => l !== cb);
            };
          }
        }
      };

      await useCopilotStore.getState().triggerDirectQuestion("Tháng đầu tiên ngân sách 27 triệu, em phân bổ tiền cho Content, Entity, Guest Post và PBN thế nào?");

      const history = useCopilotStore.getState().history;
      expect(history.length).toBeGreaterThan(0);
      const item = history[0];

      // 1. providerStatus
      expect(item.providerStatus).toBe("RATE_LIMIT");
      // 2. answerSource
      expect(item.answerSource).toBe("SAFE_FALLBACK");
      // 3. fallbackReason
      expect(item.fallbackReason).toContain("HTTP 429");
      // 4. turnId
      expect(item.id).toBeTruthy();
      expect(typeof item.id).toBe("string");
      // 5. intent
      expect(item.intent?.category).toBe("BUDGET_ALLOCATION");
      // 6. answerType
      expect(item.contract?.answerType).toBeDefined();
      // 7. candidateExperienceAllowed
      expect(typeof item.contract?.candidateExperienceAllowed).toBe("boolean");
      // 8. requiredFacts
      expect(Array.isArray(item.contract?.requiredFacts)).toBe(true);
      expect(item.contract?.requiredFacts.length).toBeGreaterThan(0);
      // 9. scenarioConstraints
      expect(item.contract).toHaveProperty("scenarioConstraints");
      // 10. firstVisibleAnswerMs
      expect(item.timestamps).toBeDefined();
      const metrics = calculatePipelineMetrics(item.timestamps!);
      expect(metrics.speechEndToFirstVisibleAnswerMs).toBeDefined();
      expect(metrics.speechEndToFirstVisibleAnswerMs).toBeGreaterThanOrEqual(0);
    });
  });
});
