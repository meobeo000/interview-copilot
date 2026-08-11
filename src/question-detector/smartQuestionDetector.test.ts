import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  hasQuestionIntent,
  isSetupFragment,
  isVietnameseSentenceComplete,
  SmartQuestionDetector
} from "./smartQuestionDetector";

describe("Vietnamese question intent & setup fragment heuristics", () => {
  it("classifies setup context fragments correctly", () => {
    expect(isSetupFragment("Anh hỏi sâu hơn chút")).toBe(true);
    expect(isSetupFragment("Giả sử index canonical robots đều bình thường")).toBe(true);
    expect(isSetupFragment("Impressions chỉ giảm 5% nhưng click giảm 40%")).toBe(true);
    expect(isSetupFragment("Vị trí trung bình từ 3.2 xuống 6.8")).toBe(true);
    expect(isSetupFragment("Đối thủ chính lại tăng")).toBe(true);
    expect(isSetupFragment("Theo em nếu website")).toBe(true);
  });

  it("detects valid Vietnamese question intents and request prefixes", () => {
    expect(hasQuestionIntent("Em ưu tiên kiểm tra gì tiếp theo và vì sao?")).toBe(true);
    expect(hasQuestionIntent("Trong trường hợp đó em sẽ xử lý như thế nào?")).toBe(true);
    expect(hasQuestionIntent("Tại sao em lại chọn phương án đó?")).toBe(true);
    expect(hasQuestionIntent("Em sẽ kiểm tra cái gì trước?")).toBe(true);
    expect(hasQuestionIntent("Cho anh biết quy trình đánh giá audit site")).toBe(true);
    expect(hasQuestionIntent("Em giải thích cách xử lý disavow")).toBe(true);
    expect(hasQuestionIntent("Tại sao?")).toBe(true);
    expect(hasQuestionIntent("Vì sao?")).toBe(true);
  });

  it("requires both absence of setup fragment and presence of question intent for complete sentence", () => {
    expect(isVietnameseSentenceComplete("Anh hỏi sâu hơn chút")).toBe(false);
    expect(
      isVietnameseSentenceComplete(
        "Giả sử index canonical robots đều bình thường, em ưu tiên kiểm tra gì tiếp theo và vì sao?"
      )
    ).toBe(true);
  });
});

describe("SmartQuestionDetector multi-segment turn accumulation", () => {
  let detector: SmartQuestionDetector;

  beforeEach(() => {
    vi.useFakeTimers();
    detector = new SmartQuestionDetector();
  });

  afterEach(() => {
    detector.reset();
    vi.useRealTimers();
  });

  it("accumulates multi-segment speech into one fullTurn without prematurely finalizing setup fragments", () => {
    const onPossibleEnd = vi.fn();
    const onFinalize = vi.fn();

    // Segment 1
    const t1 = detector.appendSegment("Anh hỏi sâu hơn chút");
    detector.updateTurn(t1, onPossibleEnd, onFinalize);
    vi.advanceTimersByTime(1200);

    expect(onPossibleEnd).toHaveBeenCalled();
    expect(onFinalize).not.toHaveBeenCalled(); // Setup fragment, do NOT finalize!

    // Segment 2
    const t2 = detector.appendSegment("Giả sử index canonical robots đều bình thường");
    detector.updateTurn(t2, onPossibleEnd, onFinalize);
    vi.advanceTimersByTime(1500);

    expect(onFinalize).not.toHaveBeenCalled();

    // Segment 3: Question prompt arrives
    const t3 = detector.appendSegment("Em ưu tiên kiểm tra gì tiếp theo và vì sao?");
    detector.updateTurn(t3, onPossibleEnd, onFinalize);
    vi.advanceTimersByTime(1300);

    expect(onFinalize).toHaveBeenCalledWith(
      expect.objectContaining({
        isComplete: true,
        text: "Anh hỏi sâu hơn chút, Giả sử index canonical robots đều bình thường, Em ưu tiên kiểm tra gì tiếp theo và vì sao?"
      })
    );
  });
});
