import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isVietnameseSentenceComplete, SmartQuestionDetector } from "./smartQuestionDetector";

describe("isVietnameseSentenceComplete heuristics", () => {
  it("rejects incomplete sentences ending in conjunctions or incomplete phrases", () => {
    expect(isVietnameseSentenceComplete("Theo em backlink")).toBe(false);
    expect(isVietnameseSentenceComplete("Nếu website đang giảm traffic thì")).toBe(false);
    expect(isVietnameseSentenceComplete("Ví dụ bên anh có một site")).toBe(false);
    expect(isVietnameseSentenceComplete("Và trường hợp")).toBe(false);
    expect(isVietnameseSentenceComplete("Theo em nếu")).toBe(false);
  });

  it("approves complete Vietnamese question patterns and question marks", () => {
    expect(isVietnameseSentenceComplete("Theo em backlink hiện tại còn quan trọng không?")).toBe(true);
    expect(
      isVietnameseSentenceComplete(
        "Nếu website giảm 40% organic traffic sau Core Update thì em sẽ kiểm tra gì trước?"
      )
    ).toBe(true);
    expect(isVietnameseSentenceComplete("Em xử lý negative SEO như thế nào?")).toBe(true);
    expect(isVietnameseSentenceComplete("Anh thấy phương án này có hợp lý không")).toBe(true);
  });
});

describe("SmartQuestionDetector turn detection timings", () => {
  let detector: SmartQuestionDetector;

  beforeEach(() => {
    vi.useFakeTimers();
    detector = new SmartQuestionDetector();
  });

  afterEach(() => {
    detector.reset();
    vi.useRealTimers();
  });

  it("does not finalize or trigger PossibleEnd on short pause (< 700ms)", () => {
    const onPossibleEnd = vi.fn();
    const onFinalize = vi.fn();

    detector.updateTranscript("Theo em backlink", onPossibleEnd, onFinalize);

    vi.advanceTimersByTime(500);

    expect(onPossibleEnd).not.toHaveBeenCalled();
    expect(onFinalize).not.toHaveBeenCalled();
  });

  it("triggers PossibleEnd at 1000ms silence but does not finalize incomplete sentence", () => {
    const onPossibleEnd = vi.fn();
    const onFinalize = vi.fn();

    detector.updateTranscript("Theo em nếu website bị giảm organic traffic và", onPossibleEnd, onFinalize);

    vi.advanceTimersByTime(1100);

    expect(onPossibleEnd).toHaveBeenCalled();
    expect(onFinalize).not.toHaveBeenCalled();
  });

  it("resumes speech after candidate silence and cancels previous timers", () => {
    const onPossibleEnd = vi.fn();
    const onFinalize = vi.fn();

    detector.updateTranscript("Theo em nếu website bị giảm", onPossibleEnd, onFinalize);
    vi.advanceTimersByTime(1100);
    expect(onPossibleEnd).toHaveBeenCalledTimes(1);

    // Speech resumes
    detector.updateTranscript(
      "Theo em nếu website bị giảm 40% organic traffic thì em kiểm tra gì trước?",
      onPossibleEnd,
      onFinalize
    );

    // Short time later
    vi.advanceTimersByTime(500);
    expect(onFinalize).not.toHaveBeenCalled();

    // 1000ms after new speech
    vi.advanceTimersByTime(600);
    expect(onFinalize).toHaveBeenCalledWith(
      expect.objectContaining({
        isComplete: true,
        text: "Theo em nếu website bị giảm 40% organic traffic thì em kiểm tra gì trước?"
      })
    );
  });

  it("finalizes complete question at candidate silence (~1000ms)", () => {
    const onPossibleEnd = vi.fn();
    const onFinalize = vi.fn();

    detector.updateTranscript(
      "Em xử lý canonical tag bị lỗi 301 như thế nào?",
      onPossibleEnd,
      onFinalize
    );

    vi.advanceTimersByTime(1100);

    expect(onPossibleEnd).toHaveBeenCalled();
    expect(onFinalize).toHaveBeenCalledWith(
      expect.objectContaining({
        isComplete: true,
        text: "Em xử lý canonical tag bị lỗi 301 như thế nào?"
      })
    );
  });

  it("hard timeout (~2800ms) eventually finalizes incomplete phrase if silence persists", () => {
    const onPossibleEnd = vi.fn();
    const onFinalize = vi.fn();

    detector.updateTranscript("Ví dụ bên anh có một site mới tạo được ba tháng", onPossibleEnd, onFinalize);

    vi.advanceTimersByTime(2900);

    expect(onFinalize).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "Ví dụ bên anh có một site mới tạo được ba tháng"
      })
    );
  });
});
