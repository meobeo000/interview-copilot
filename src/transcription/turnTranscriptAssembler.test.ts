import { describe, expect, it } from "vitest";
import {
  findWordOverlapOffset,
  mergeSegmentWithOverlap,
  TurnTranscriptAssembler
} from "./turnTranscriptAssembler";
import { SemanticEvidenceAccumulator } from "../question-detector/semanticEvidence";
import { SpeculativePrewarmPolicy } from "../question-detector/speculativePrewarmPolicy";

describe("Phase 3.5: TurnTranscriptAssembler & STT Turn Assembly Tests", () => {
  describe("Overlap Calculation & Segment Merging", () => {
    it("finds maximum word overlap offset correctly", () => {
      expect(findWordOverlapOffset("site mở bot hai tuần", "hai tuần vẫn chưa nhận keyword")).toBe(2);
      expect(findWordOverlapOffset("budget ban đầu khoảng hai mươi triệu", "khoảng hai mươi triệu em phân bổ")).toBe(4);
      expect(findWordOverlapOffset("domain A DR 55", "domain B DR 20")).toBe(0);
      expect(findWordOverlapOffset("site vệ tinh", "site vệ tinh")).toBe(3);
    });

    it("merges segments with overlap deduplication", () => {
      const seg1 = mergeSegmentWithOverlap(["site mở bot hai tuần"], "hai tuần vẫn chưa nhận keyword");
      expect(seg1.join(" ")).toBe("site mở bot hai tuần vẫn chưa nhận keyword");

      const seg2 = mergeSegmentWithOverlap(["budget ban đầu"], "budget ban đầu khoảng hai mươi triệu");
      expect(seg2.join(" ")).toBe("budget ban đầu khoảng hai mươi triệu");
    });
  });

  describe("TurnTranscriptAssembler Lifecycle", () => {
    it("Test 17: Partial snapshot replaces previous partial hypothesis without appending", () => {
      const assembler = new TurnTranscriptAssembler();

      assembler.applyPartial("budget ban đầu");
      expect(assembler.getDisplayTranscript()).toBe("budget ban đầu");

      assembler.applyPartial("budget ban đầu khoảng hai mươi");
      expect(assembler.getDisplayTranscript()).toBe("budget ban đầu khoảng hai mươi");

      assembler.applyPartial("budget ban đầu khoảng hai mươi triệu");
      expect(assembler.getDisplayTranscript()).toBe("budget ban đầu khoảng hai mươi triệu");

      // Verify no repeated phrases
      expect(assembler.getDisplayTranscript()).not.toContain("budget ban đầu budget ban đầu");
    });

    it("Test 18: Partial -> Final commits once without duplicating", () => {
      const assembler = new TurnTranscriptAssembler();

      assembler.applyPartial("budget ban đầu khoảng hai mươi triệu");
      expect(assembler.getDisplayTranscript()).toBe("budget ban đầu khoảng hai mươi triệu");

      assembler.applyFinal("budget ban đầu khoảng hai mươi triệu");
      expect(assembler.getCommittedTranscript()).toBe("budget ban đầu khoảng hai mươi triệu");
      expect(assembler.getCurrentPartial()).toBe("");
      expect(assembler.getDisplayTranscript()).toBe("budget ban đầu khoảng hai mươi triệu");
    });

    it("Test 19: Multi-segment Deepgram question assembly", () => {
      const assembler = new TurnTranscriptAssembler();

      // Final segment 1
      assembler.applyFinal("budget ban đầu khoảng hai mươi triệu");
      expect(assembler.getDisplayTranscript()).toBe("budget ban đầu khoảng hai mươi triệu");

      // Incoming partial for segment 2
      assembler.applyPartial("thì em sẽ phân bổ content");
      expect(assembler.getDisplayTranscript()).toBe("budget ban đầu khoảng hai mươi triệu thì em sẽ phân bổ content");

      // Final segment 2
      assembler.applyFinal("thì em sẽ phân bổ content Entity Guest Post và PBN");
      expect(assembler.getDisplayTranscript()).toBe("budget ban đầu khoảng hai mươi triệu thì em sẽ phân bổ content Entity Guest Post và PBN");
      expect(assembler.getCurrentPartial()).toBe("");
    });

    it("Test 20: Overlapping final segments deduplicate cleanly", () => {
      const assembler = new TurnTranscriptAssembler();

      assembler.applyFinal("site mở bot hai tuần");
      assembler.applyFinal("hai tuần vẫn chưa nhận keyword");

      expect(assembler.getDisplayTranscript()).toBe("site mở bot hai tuần vẫn chưa nhận keyword");
      expect(assembler.getDisplayTranscript()).not.toContain("hai tuần hai tuần");
    });

    it("Test 26: Live-like Deepgram evolving phonetic hypothesis maintains only latest state", () => {
      const assembler = new TurnTranscriptAssembler();

      assembler.applyPartial("bớt chết ban đầu khoảng hai mươi");
      expect(assembler.getDisplayTranscript()).toBe("bớt chết ban đầu khoảng hai mươi");

      assembler.applyPartial("betting ban đầu khoảng hai mươi triệu thì em");
      expect(assembler.getDisplayTranscript()).toBe("betting ban đầu khoảng hai mươi triệu thì em");

      assembler.applyPartial("betting ban đầu khoảng hai mươi triệu thì em sẽ phân bổ như thế");
      expect(assembler.getDisplayTranscript()).toBe("betting ban đầu khoảng hai mươi triệu thì em sẽ phân bổ như thế");

      assembler.applyPartial("betting ban đầu khoảng hai mươi triệu thì em sẽ phân bổ như thế nào cho content");
      expect(assembler.getDisplayTranscript()).toBe("betting ban đầu khoảng hai mươi triệu thì em sẽ phân bổ như thế nào cho content");

      expect(assembler.getDisplayTranscript()).not.toContain("bớt chết ban đầu khoảng hai mươi betting");
    });

    it("Test 21 & 25: Semantic evidence preserves structured facts without transcript duplication", () => {
      const assembler = new TurnTranscriptAssembler();
      const accumulator = new SemanticEvidenceAccumulator();
      const prewarmPolicy = new SpeculativePrewarmPolicy();

      // Step 1
      const t1 = assembler.applyPartial("20 triệu");
      accumulator.appendPartial(t1);

      // Step 2
      const t2 = assembler.applyPartial("20 triệu em phân bổ content");
      accumulator.appendPartial(t2);

      // Step 3
      const t3 = assembler.applyPartial("20 triệu em phân bổ content Entity Guest Post PBN");
      accumulator.appendPartial(t3);

      const state = accumulator.getState();
      expect(state.bestIntent).toBe("BUDGET_ALLOCATION");
      expect(state.moneyAmounts).toEqual(["20 triệu"]);
      expect(state.seoEntities).toContain("content");
      expect(state.seoEntities).toContain("Entity");
      expect(state.seoEntities).toContain("Guest Post");
      expect(state.seoEntities).toContain("PBN");
      expect(state.latestTranscript).toBe("20 triệu em phân bổ content Entity Guest Post PBN");

      const eligibility = prewarmPolicy.evaluate(state);
      expect(eligibility.eligible).toBe(true);
    });

    it("Test 24: Turn reset isolates turns without data leakage", () => {
      const assembler = new TurnTranscriptAssembler();
      assembler.applyFinal("20 triệu chia content PBN thế nào");
      expect(assembler.getDisplayTranscript()).toBe("20 triệu chia content PBN thế nào");

      assembler.reset();
      expect(assembler.getDisplayTranscript()).toBe("");
      expect(assembler.getCommittedTranscript()).toBe("");
      expect(assembler.getCurrentPartial()).toBe("");

      assembler.applyFinal("domain DR 55 traffic 0 có lấy không");
      expect(assembler.getDisplayTranscript()).toBe("domain DR 55 traffic 0 có lấy không");
      expect(assembler.getDisplayTranscript()).not.toContain("20 triệu");
    });

    it("Test 27: Performance benchmark executes sub-millisecond", () => {
      const assembler = new TurnTranscriptAssembler();
      const start = performance.now();

      for (let i = 0; i < 500; i++) {
        assembler.applyPartial(`budget ban đầu khoảng hai mươi triệu segment ${i}`);
      }
      assembler.applyFinal("budget ban đầu khoảng hai mươi triệu segment 500");

      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(50); // < 0.1ms per iteration
    });
  });
});
