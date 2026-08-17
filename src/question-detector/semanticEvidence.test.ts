import { describe, expect, it } from "vitest";
import { classifyQuestionIntent } from "./intentClassifier";
import { SemanticEvidenceAccumulator } from "./semanticEvidence";

describe("Semantic Evidence Accumulator & Phase 1 Cleanup Tests", () => {
  describe("Part A — Phase 1 Cleanup (No Brittle Phonetic Hacks)", () => {
    it("classifies 'xyz ban đầu hai mươi triệu em phân bổ content entity guest post pbn thế nào' as BUDGET_ALLOCATION based purely on semantic signals", () => {
      const transcript = "xyz ban đầu hai mươi triệu em phân bổ content entity guest post pbn thế nào";
      const res = classifyQuestionIntent(transcript);

      expect(res.category).toBe("BUDGET_ALLOCATION");
      expect(res.confidence).toBeGreaterThanOrEqual(0.90);
      expect(res.evidence.length).toBeGreaterThan(0);
    });

    it("classifies '20 triệu chia content với pbn sao' as BUDGET_ALLOCATION", () => {
      const transcript = "20 triệu chia content với pbn sao";
      const res = classifyQuestionIntent(transcript);

      expect(res.category).toBe("BUDGET_ALLOCATION");
      expect(res.confidence).toBeGreaterThanOrEqual(0.85);
    });

    it("classifies 'xyz 30 triệu dành bao nhiêu cho guest post' as BUDGET_ALLOCATION", () => {
      const transcript = "xyz 30 triệu dành bao nhiêu cho guest post";
      const res = classifyQuestionIntent(transcript);

      expect(res.category).toBe("BUDGET_ALLOCATION");
      expect(res.confidence).toBeGreaterThanOrEqual(0.85);
    });

    it("routes 'content entity pbn triển khai thế nào' to STRATEGY_PLAN when no money/budget is present", () => {
      const transcript = "content entity pbn triển khai thế nào";
      const res = classifyQuestionIntent(transcript);

      expect(res.category).toBe("STRATEGY_PLAN");
      expect(res.category).not.toBe("BUDGET_ALLOCATION");
    });
  });

  describe("Part B — Progressive Evidence Accumulation Sequence", () => {
    it("accumulates money, allocation, and SEO spend categories across partials without duplication", () => {
      const accumulator = new SemanticEvidenceAccumulator();

      // Partial 1
      const state1 = accumulator.appendPartial("20 triệu");
      expect(state1.moneyAmounts).toContain("20 triệu");
      expect(state1.confidence).toBeLessThan(0.80);

      // Partial 2
      const state2 = accumulator.appendPartial("20 triệu em phân bổ content");
      expect(state2.moneyAmounts).toEqual(["20 triệu"]);
      expect(state2.seoEntities).toContain("content");
      expect(state2.allocationSignals.length).toBeGreaterThan(0);

      // Partial 3
      const state3 = accumulator.appendPartial("20 triệu em phân bổ content Entity Guest Post PBN thế nào");
      expect(state3.bestIntent).toBe("BUDGET_ALLOCATION");
      expect(state3.confidence).toBeGreaterThanOrEqual(0.90);
      expect(state3.moneyAmounts).toEqual(["20 triệu"]);
      expect(state3.seoEntities).toEqual(expect.arrayContaining(["content", "Entity", "Guest Post", "PBN"]));

      // Verify no duplicate money amounts or entities
      expect(new Set(state3.moneyAmounts).size).toBe(state3.moneyAmounts.length);
      expect(new Set(state3.seoEntities).size).toBe(state3.seoEntities.length);
    });

    it("handles progressive domain comparison and deduplicates DR values", () => {
      const accumulator = new SemanticEvidenceAccumulator();

      // Partial 1
      accumulator.appendPartial("domain A DR 55");
      let state = accumulator.getState();
      expect(state.drValues).toEqual([55]);

      // Partial 2
      accumulator.appendPartial("domain A DR 55 traffic bằng 0");
      state = accumulator.getState();
      expect(state.drValues).toEqual([55]);
      expect(state.comparisonSignals.length).toBeGreaterThan(0);

      // Partial 3
      accumulator.appendPartial("domain A DR 55 traffic bằng 0 domain B DR 20 có traffic thật");
      state = accumulator.getState();
      expect(state.drValues).toEqual([55, 20]);
      expect(state.numbers).toEqual(expect.arrayContaining([55, 0, 20]));

      // Partial 4
      accumulator.appendPartial("domain A DR 55 traffic bằng 0 domain B DR 20 có traffic thật em chọn con nào");
      state = accumulator.getState();

      expect(state.bestIntent).toBe("DOMAIN_SELECTION");
      expect(state.confidence).toBeGreaterThanOrEqual(0.90);
      expect(state.drValues).toEqual([55, 20]);
    });

    it("accumulates GSC numerical metrics (percentages, positions, decimals) accurately", () => {
      const accumulator = new SemanticEvidenceAccumulator();

      // Partial 1
      accumulator.appendPartial("GSC impression giảm 5 phần trăm");
      let state = accumulator.getState();
      expect(state.seoEntities).toContain("GSC");
      expect(state.percentages).toContain(5);

      // Partial 2
      accumulator.appendPartial("GSC impression giảm 5 phần trăm click giảm 40 phần trăm");
      state = accumulator.getState();
      expect(state.percentages).toEqual(expect.arrayContaining([5, 40]));

      // Partial 3
      accumulator.appendPartial("GSC impression giảm 5 phần trăm click giảm 40 phần trăm average position từ 3.2 xuống 6.8");
      state = accumulator.getState();

      expect(state.bestIntent).toBe("GSC_RANKING_DROP");
      expect(state.confidence).toBeGreaterThanOrEqual(0.88);
      expect(state.positions).toEqual(expect.arrayContaining([3.2, 6.8]));
      expect(state.percentages).toEqual(expect.arrayContaining([5, 40]));
      expect(state.numbers).toEqual(expect.arrayContaining([5, 40, 3.2, 6.8]));
    });

    it("correctly identifies NO_KEYWORD_SIGNAL without modifying transcript or requiring keyword correction", () => {
      const accumulator = new SemanticEvidenceAccumulator();

      // Partial 1
      accumulator.appendPartial("site mở bot hai tuần");
      let state = accumulator.getState();
      expect(state.indexingSignals).toContain("mở bot");
      expect(state.durations).toContain("hai tuần");

      // Partial 2
      accumulator.appendPartial("site mở bot hai tuần vẫn chưa nhận cây");
      state = accumulator.getState();

      expect(state.bestIntent).toBe("NO_KEYWORD_SIGNAL");
      expect(state.confidence).toBeGreaterThanOrEqual(0.85);
      expect(state.latestTranscript).toBe("site mở bot hai tuần vẫn chưa nhận cây");
    });

    it("resets state completely between interviewer turns without leaking facts", () => {
      const accumulator = new SemanticEvidenceAccumulator();

      // Turn 1
      accumulator.appendPartial("20 triệu phân bổ content PBN thế nào");
      expect(accumulator.getState().bestIntent).toBe("BUDGET_ALLOCATION");
      expect(accumulator.getState().moneyAmounts).toContain("20 triệu");

      // Turn Reset
      accumulator.reset();
      expect(accumulator.getState().moneyAmounts).toEqual([]);
      expect(accumulator.getState().seoEntities).toEqual([]);
      expect(accumulator.getState().bestIntent).toBe("UNKNOWN");

      // Turn 2
      accumulator.appendPartial("domain DR 55 traffic 0 có lấy không");
      const turn2State = accumulator.getState();

      expect(turn2State.bestIntent).toBe("DOMAIN_SELECTION");
      expect(turn2State.drValues).toEqual([55]);
      expect(turn2State.moneyAmounts).toEqual([]);
    });

    it("protects against background chatter and keeps intent UNKNOWN with low confidence", () => {
      const chatterPhrases = [
        "Alo em nghe rõ không?",
        "Chờ anh tí.",
        "Anh mở CV nhé.",
        "Ừ đúng rồi.",
        "Ok tiếp nhé."
      ];

      for (const phrase of chatterPhrases) {
        const accumulator = new SemanticEvidenceAccumulator();
        accumulator.appendPartial(phrase);
        const state = accumulator.getState();

        expect(state.bestIntent).toBe("UNKNOWN");
        expect(state.confidence).toBeLessThan(0.5);
      }
    });

    it("executes appendPartial and scoring with sub-millisecond latency (< 5ms)", () => {
      const accumulator = new SemanticEvidenceAccumulator();
      const text = "domain A DR 55 traffic bằng 0 domain B DR 20 có traffic thật em chọn con nào";

      const start = performance.now();
      for (let i = 0; i < 50; i++) {
        accumulator.appendPartial(text);
      }
      const elapsed = (performance.now() - start) / 50;

      expect(elapsed).toBeLessThan(5);
    });
  });
});
