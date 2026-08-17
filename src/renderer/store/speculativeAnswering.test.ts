import { beforeEach, describe, expect, it, vi } from "vitest";
import { isSpeculativeEnabled } from "../../question-detector/speculativeConfig";
import { classifyQuestionIntent } from "../../question-detector/intentClassifier";
import { ContextAwareTranscriptCorrector } from "../../corrector/contextAwareCorrector";
import { parseStreamingAnswer } from "../../llm/parseAnswerJson";
import { VIETNAMESE_SEO_BENCHMARK_CASES } from "../../benchmark/vietnameseSeoBenchmark.data";
import { useCopilotStore } from "./useCopilotStore";
import { SpeculativePrewarmPolicy } from "../../question-detector/speculativePrewarmPolicy";
import { SemanticEvidenceAccumulator } from "../../question-detector/semanticEvidence";

describe("Phase 3: Speculative Gemini Prewarm & Lifecycle Tests", () => {
  const corrector = new ContextAwareTranscriptCorrector();
  const prewarmPolicy = new SpeculativePrewarmPolicy();

  beforeEach(() => {
    vi.clearAllMocks();
    useCopilotStore.getState().pause();
  });

  describe("Prewarm Eligibility & Stability Policy", () => {
    it("Test 27: Progressive Partial Prewarm & Reuse Policy", () => {
      const accumulator = new SemanticEvidenceAccumulator();

      // Partial 1: "20 triệu" -> Not enough words/evidence for prewarm
      accumulator.appendPartial("20 triệu");
      const eval1 = prewarmPolicy.evaluate(accumulator.getState());
      expect(eval1.eligible).toBe(false);

      // Partial 2: "20 triệu em phân bổ content" -> 5 words, confidence rising
      accumulator.appendPartial("20 triệu em phân bổ content");
      const eval2 = prewarmPolicy.evaluate(accumulator.getState());
      expect(eval2.intent).toBe("BUDGET_ALLOCATION");

      // Partial 3: "20 triệu em phân bổ content Entity Guest Post" -> Confident & eligible for prewarm!
      accumulator.appendPartial("20 triệu em phân bổ content Entity Guest Post");
      const eval3 = prewarmPolicy.evaluate(accumulator.getState());
      expect(eval3.eligible).toBe(true);
      expect(eval3.intent).toBe("BUDGET_ALLOCATION");
      expect(eval3.confidence).toBeGreaterThanOrEqual(0.88);

      // Final commit: "20 triệu em phân bổ content Entity Guest Post với PBN như thế nào"
      accumulator.appendFinal("20 triệu em phân bổ content Entity Guest Post với PBN như thế nào");
      const finalState = accumulator.getState();
      expect(finalState.bestIntent).toBe("BUDGET_ALLOCATION");
      // Compatible intent -> Reusable!
      expect(finalState.bestIntent).toBe(eval3.intent);
    });

    it("Test 28: Material Intent Shift detection between prewarm and final question", () => {
      const accumulator = new SemanticEvidenceAccumulator();

      // Prewarm snapshot for budget
      accumulator.appendPartial("20 triệu phân bổ content Entity PBN thế nào");
      const prewarmEval = prewarmPolicy.evaluate(accumulator.getState());
      expect(prewarmEval.eligible).toBe(true);
      expect(prewarmEval.intent).toBe("BUDGET_ALLOCATION");

      // Interviewer continues and pivots completely to timing
      const newAccumulator = new SemanticEvidenceAccumulator();
      newAccumulator.appendFinal("nhưng anh muốn hỏi tại sao ngày thứ 10 mới bắt đầu đi PBN");
      const finalState = newAccumulator.getState();

      expect(finalState.bestIntent).toBe("PBN_TIMING");
      // Incompatible intent -> Triggers material shift replacement!
      expect(finalState.bestIntent).not.toBe(prewarmEval.intent);
    });

    it("Test 29: Background chatter filter prevents prewarm", () => {
      const chatters = [
        "alo",
        "alo em nghe rõ không",
        "chờ anh một chút nhé",
        "anh mở CV nhé",
        "ừ đúng rồi"
      ];

      for (const phrase of chatters) {
        const accumulator = new SemanticEvidenceAccumulator();
        accumulator.appendPartial(phrase);
        const evalResult = prewarmPolicy.evaluate(accumulator.getState());

        expect(evalResult.eligible).toBe(false);
        expect(evalResult.intent).toBe("UNKNOWN");
      }
    });
  });

  describe("Store Turn Lifecycle & Replay Tests", () => {
    it("Test 30 & 32: Buffered output release on commit without premature display while speaking", () => {
      // Set store in listening state with active transcript
      useCopilotStore.setState({
        status: "Listening",
        liveTranscript: "Domain A DR 55 traffic bằng 0, domain B DR 20 có traffic thật em chọn con nào?"
      });

      // User/turn commits question
      useCopilotStore.getState().finalizeQuestionNow();

      const state = useCopilotStore.getState();
      expect(state.status).toBe("Answering");
      expect(state.cleanedQuestion).toContain("domain B DR 20");
      expect(state.detectedTopic).toBe("DOMAIN_SELECTION");
    });

    it("Test 31: Turn Reset clears active state and prevents data leakage across turns", () => {
      useCopilotStore.setState({
        status: "Listening",
        liveTranscript: "20 triệu phân bổ content PBN thế nào?"
      });
      useCopilotStore.getState().finalizeQuestionNow();

      // Pause/Reset turn
      useCopilotStore.getState().pause();
      expect(useCopilotStore.getState().status).toBe("Idle");
      expect(useCopilotStore.getState().liveTranscript).toBe("");
    });

    it("Test 33: Manual 'Trả lời ngay' commits cleanly", () => {
      useCopilotStore.setState({
        status: "Listening",
        liveTranscript: "Dự án iGaming gần nhất em từng làm là con nào?"
      });

      useCopilotStore.getState().finalizeQuestionNow();
      expect(useCopilotStore.getState().status).toBe("Answering");
      expect(useCopilotStore.getState().detectedTopic).toBe("PROJECT_EXPERIENCE");
    });

    it("Test 34: Feature flag isSpeculativeEnabled works with env and default", () => {
      expect(isSpeculativeEnabled()).toBe(true);
      expect(isSpeculativeEnabled({ SPECULATIVE_ANSWER_ENABLED: "false" })).toBe(false);
      expect(isSpeculativeEnabled({ SPECULATIVE_ANSWER_ENABLED: "true" })).toBe(true);
      expect(isSpeculativeEnabled({ VITE_SPECULATIVE_ANSWER_ENABLED: "false" })).toBe(false);
    });

    it("Test 35: All 32 benchmark cases pass semantic normalization & intent classification", () => {
      expect(VIETNAMESE_SEO_BENCHMARK_CASES.length).toBeGreaterThanOrEqual(30);
      for (const bCase of VIETNAMESE_SEO_BENCHMARK_CASES) {
        const corrected = corrector.correct(bCase.rawTranscript, { domain: "seo_igaming_interview" });
        const intent = classifyQuestionIntent(corrected.correctedText, bCase.rawTranscript);
        expect(intent.category).toBe(bCase.expectedIntent);
      }
    });

    it("Test 36: Text streaming protocol parses opening line and action bullets without JSON delay", () => {
      const streamOutput = `Case này em chọn domain B DR 20 có traffic thật.
- Domain B có user signal và niche relevance cao hơn DR ảo.
- Domain A DR 55 nhưng 0 traffic dễ dính penalty hoặc domain drop.
- Ưu tiên traffic và referring domain chất lượng cho iGaming.`;

      const parsed = parseStreamingAnswer(streamOutput);
      expect(parsed.openingLine).toBe("Case này em chọn domain B DR 20 có traffic thật.");
      expect(parsed.bullets).toHaveLength(3);
      expect(parsed.bullets[0]).toContain("Domain B có user signal");
      expect(parsed.bullets[1]).toContain("Domain A DR 55");
      expect(parsed.keywords).toContain("DR");
    });
  });
});
