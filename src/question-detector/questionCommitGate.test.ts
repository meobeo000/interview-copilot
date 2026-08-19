import { describe, it, expect, vi } from "vitest";
import { QuestionCommitGate } from "./questionCommitGate";
import { SmartQuestionDetector } from "./smartQuestionDetector";
import { TurnTranscriptAssembler } from "../transcription/turnTranscriptAssembler";

describe("Phase 6.7.1: QuestionCommitGate & Natural Speech Pause Gating Suite", () => {
  // Test 1: Incomplete open workflow prompt
  it("Test 1: evaluates 'Em sẽ kiểm tra những gì, theo thứ tự nào' as HOLD_FRAGMENT", () => {
    const text = "Em sẽ kiểm tra những gì, theo thứ tự nào";
    const result = QuestionCommitGate.evaluate(text);
    expect(result.decision).toBe("HOLD_FRAGMENT");
    expect(result.isCompleteQuestion).toBe(false);
  });

  // Test 2: Full question with purpose clause
  it("Test 2: evaluates full question with purpose clause as COMMIT", () => {
    const fullText = "Anh đưa em 20 expired domain cho một money site betting mới. Em sẽ kiểm tra những gì, theo thứ tự nào, để lọc xuống còn 2–3 domain đáng test nhất?";
    const result = QuestionCommitGate.evaluate(fullText);
    expect(result.decision).toBe("COMMIT");
    expect(result.isCompleteQuestion).toBe(true);
  });

  // Test 3: Dangling conditional clause -> Continuation
  it("Test 3: holds dangling 'Nếu site không nhận keyword thì' and commits when completed with predicate", () => {
    const fragment = "Nếu site không nhận keyword thì";
    const resultFrag = QuestionCommitGate.evaluate(fragment);
    expect(resultFrag.decision).toBe("HOLD_FRAGMENT");
    expect(resultFrag.isCompleteQuestion).toBe(false);

    const completed = "Nếu site không nhận keyword thì em xử lý gì đầu tiên?";
    const resultComplete = QuestionCommitGate.evaluate(completed);
    expect(resultComplete.decision).toBe("COMMIT");
    expect(resultComplete.isCompleteQuestion).toBe(true);
  });

  // Test 4: Incomplete comparative setup -> Full comparison
  it("Test 4: holds incomplete option clause and commits when full comparative choice is given", () => {
    const part1 = "Domain A DR 55 nhưng traffic bằng 0,";
    const resultPart1 = QuestionCommitGate.evaluate(part1);
    expect(resultPart1.decision).toBe("HOLD_FRAGMENT");

    const fullQuestion = "Domain A DR 55 nhưng traffic bằng 0, Domain B DR 20 có traffic thật, em chọn con nào?";
    const resultFull = QuestionCommitGate.evaluate(fullQuestion);
    expect(resultFull.decision).toBe("COMMIT");
    expect(resultFull.isCompleteQuestion).toBe(true);
  });

  // Test 5: Concise & follow-up questions commit immediately
  it("Test 5: commits short questions and follow-ups immediately", () => {
    const shortQuestions = [
      "Tại sao?",
      "Tại sao",
      "Vì sao?",
      "Vì sao",
      "Em check gì?",
      "Check gì?",
      "Còn PBN?",
      "Khi nào đổi?",
      "Rủi ro là gì?",
      "Tín hiệu nào?",
      "Bước tiếp theo là gì?"
    ];

    for (const q of shortQuestions) {
      const result = QuestionCommitGate.evaluate(q);
      expect(result.decision).toBe("COMMIT");
      expect(result.isCompleteQuestion).toBe(true);
    }
  });

  // Test 6: Microphone simulation with multi-segment pauses (200ms, 500ms, 800ms)
  it("Test 6: simulates natural pauses (300ms–800ms) without premature speech_final commits", () => {
    const assembler = new TurnTranscriptAssembler();
    const detector = new SmartQuestionDetector();
    const candidateCallback = vi.fn();

    // Part 1
    assembler.applyFinal("Anh đưa em 20 expired domain cho một money site betting mới.");
    let currentText = assembler.getDisplayTranscript();
    detector.triggerSpeechFinal(currentText, candidateCallback);
    expect(candidateCallback).not.toHaveBeenCalled();

    // Pause 300ms -> Part 2
    assembler.applyFinal("Em sẽ kiểm tra những gì, theo thứ tự nào");
    currentText = assembler.getDisplayTranscript();
    detector.triggerSpeechFinal(currentText, candidateCallback);
    // Must NOT commit prematurely on Part 2!
    expect(candidateCallback).not.toHaveBeenCalled();

    // Pause 500ms -> Part 3
    assembler.applyFinal("để lọc xuống còn 2–3 domain đáng test nhất?");
    currentText = assembler.getDisplayTranscript();
    detector.triggerSpeechFinal(currentText, candidateCallback);

    // Now committed exactly once!
    expect(candidateCallback).toHaveBeenCalledTimes(1);
    expect(candidateCallback).toHaveBeenCalledWith(
      expect.objectContaining({
        isComplete: true,
        text: expect.stringContaining("để lọc xuống còn 2–3 domain đáng test nhất?")
      })
    );
  });

  // Test 7: Extended pause on complete question
  it("Test 7: commits when a complete question finishes and reaches pause timer", async () => {
    vi.useFakeTimers();
    const detector = new SmartQuestionDetector();
    const onFinalize = vi.fn();
    const onPossibleEnd = vi.fn();

    const completeQuestion = "Tiêu chí săn expired domain của em là gì?";
    detector.updateTurn(completeQuestion, onPossibleEnd, onFinalize);

    // Fast-forward beyond candidate pause (1200ms)
    vi.advanceTimersByTime(1300);

    expect(onPossibleEnd).toHaveBeenCalled();
    expect(onFinalize).toHaveBeenCalledTimes(1);
    expect(onFinalize).toHaveBeenCalledWith(
      expect.objectContaining({
        isComplete: true,
        text: completeQuestion
      })
    );
    vi.useRealTimers();
  });
});
