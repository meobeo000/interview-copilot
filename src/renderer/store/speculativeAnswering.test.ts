import { beforeEach, describe, expect, it, vi } from "vitest";
import { isEligibleForSpeculativeAnswer, isSpeculativeEnabled } from "../../question-detector/speculativeConfig";
import { classifyQuestionIntent } from "../../question-detector/intentClassifier";
import { ContextAwareTranscriptCorrector } from "../../corrector/contextAwareCorrector";
import { parseStreamingAnswer } from "../../llm/parseAnswerJson";
import { VIETNAMESE_SEO_BENCHMARK_CASES } from "../../benchmark/vietnameseSeoBenchmark.data";
import { useCopilotStore } from "./useCopilotStore";

describe("Phase 2: Speculative Answering Unit Tests", () => {
  const corrector = new ContextAwareTranscriptCorrector();

  beforeEach(() => {
    vi.clearAllMocks();
    useCopilotStore.getState().pause();
  });

  it("Test A: isEligibleForSpeculativeAnswer correctly filters based on confidence and word count", () => {
    // 1. UNKNOWN intent -> rejected
    const unknownIntent = classifyQuestionIntent("Alo em nghe rõ không anh nói?");
    expect(isEligibleForSpeculativeAnswer(unknownIntent, "Alo em nghe rõ không anh nói?")).toBe(false);

    // 2. Too short / insufficient words -> rejected
    const shortIntent = classifyQuestionIntent("Site");
    expect(isEligibleForSpeculativeAnswer(shortIntent, "Site")).toBe(false);

    // 3. High confidence SEO intent with >= 4 words -> accepted
    const validIntent = classifyQuestionIntent("Site mở bot hai tuần vẫn chưa nhận keyword thì sao");
    expect(validIntent.category).toBe("NO_KEYWORD_SIGNAL");
    expect(isEligibleForSpeculativeAnswer(validIntent, "Site mở bot hai tuần vẫn chưa nhận keyword thì sao")).toBe(true);
  });

  it("Test B & Deduplication: Stable partials with same intent predict same category", () => {
    const p1 = "Site mở bot hai tuần chưa nhận keyword...";
    const p2 = "Site mở bot hai tuần chưa nhận keyword thì em xử lý...";
    const p3 = "Site mở bot hai tuần chưa nhận keyword thì em xử lý thế nào?";

    const i1 = classifyQuestionIntent(p1);
    const i2 = classifyQuestionIntent(p2);
    const i3 = classifyQuestionIntent(p3);

    expect(i1.category).toBe("NO_KEYWORD_SIGNAL");
    expect(i2.category).toBe("NO_KEYWORD_SIGNAL");
    expect(i3.category).toBe("NO_KEYWORD_SIGNAL");

    // Both are eligible for speculative answering
    expect(isEligibleForSpeculativeAnswer(i1, p1)).toBe(true);
    expect(isEligibleForSpeculativeAnswer(i2, p2)).toBe(true);
  });

  it("Test C: Intent change triggers intent transition", () => {
    const partial1 = "Site mở bot hai tuần chưa nhận keyword";
    const i1 = classifyQuestionIntent(partial1);
    expect(i1.category).toBe("NO_KEYWORD_SIGNAL");

    // Materially changes question from indexing issue to PBN timing strategy
    const continuation = "Tại sao ngày thứ 10 em mới bắt đầu đi PBN cho site mới?";
    const i2 = classifyQuestionIntent(continuation);
    expect(i2.category).toBe("PBN_TIMING");

    expect(i1.category).not.toBe(i2.category);
  });

  it("Test D: Background chatter and small-talk yields UNKNOWN and is NOT eligible", () => {
    const chatters = [
      "Alo em nghe rõ không?",
      "Chờ anh một chút nhé.",
      "Anh đang mở file CV của em.",
      "Ừ đúng rồi em.",
      "Ok để anh xem tiếp nào."
    ];

    for (const phrase of chatters) {
      const intent = classifyQuestionIntent(phrase);
      expect(intent.category).toBe("UNKNOWN");
      expect(isEligibleForSpeculativeAnswer(intent, phrase)).toBe(false);
    }
  });

  it("Test E: Text streaming protocol parses opening line and action bullets without JSON delay", () => {
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

  it("Test F: Incremental partial text stream parses single words into openingLine immediately", () => {
    const partial1 = "Em chưa tăng backlink ngay.";
    const p1 = parseStreamingAnswer(partial1);
    expect(p1.openingLine).toBe("Em chưa tăng backlink ngay.");
    expect(p1.bullets).toHaveLength(0);

    const partial2 = `Em chưa tăng backlink ngay.
- Kiểm tra GSC index và impression`;
    const p2 = parseStreamingAnswer(partial2);
    expect(p2.openingLine).toBe("Em chưa tăng backlink ngay.");
    expect(p2.bullets).toHaveLength(1);
    expect(p2.bullets[0]).toBe("Kiểm tra GSC index và impression");
  });

  it("Test G: finalizeQuestionNow commits immediately without error", () => {
    useCopilotStore.setState({
      liveTranscript: "Dự án iGaming gần nhất em từng làm là con nào?",
      status: "Listening"
    });

    useCopilotStore.getState().finalizeQuestionNow();
    expect(useCopilotStore.getState().status).toBe("Answering");
  });

  it("Test H: Feature flag isSpeculativeEnabled works with env and default", () => {
    expect(isSpeculativeEnabled()).toBe(true);
    expect(isSpeculativeEnabled({ SPECULATIVE_ANSWER_ENABLED: "false" })).toBe(false);
    expect(isSpeculativeEnabled({ SPECULATIVE_ANSWER_ENABLED: "true" })).toBe(true);
  });

  it("Test I: All 32 benchmark cases pass semantic normalization & intent classification", () => {
    expect(VIETNAMESE_SEO_BENCHMARK_CASES.length).toBeGreaterThanOrEqual(30);
    for (const bCase of VIETNAMESE_SEO_BENCHMARK_CASES) {
      const corrected = corrector.correct(bCase.rawTranscript, { domain: "seo_igaming_interview" });
      const intent = classifyQuestionIntent(corrected.correctedText, bCase.rawTranscript);
      expect(intent.category).toBe(bCase.expectedIntent);
    }
  });
});
