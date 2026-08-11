import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  hasQuestionIntent,
  isSetupFragment,
  isVietnameseSentenceComplete,
  SmartQuestionDetector
} from "./smartQuestionDetector";

describe("Refined Vietnamese question intent detection", () => {
  const positiveQuestionExamples = [
    "Dự án gần nhất em làm top là con nào",
    "Site mở bot rồi không có tín hiệu thì em làm sao",
    "Anh cho em budget 20 triệu thì em chia kiểu gì",
    "Em chọn domain nào",
    "Em làm bước nào trước",
    "Nếu cách đó không hiệu quả thì em xử lý ra sao",
    "Em sẽ bắt đầu ở đâu",
    "Bao lâu thì em biết strategy đó hiệu quả",
    "Khi nào em quyết định 301",
    "Có nên disavow ngay không",
    "Có cần thay domain không",
    "Cách nào em dùng để kiểm tra",
    "Anh đưa 20 domain thì em chọn cái nào",
    "Nếu domain DR 50 nhưng traffic bằng 0 thì sao"
  ];

  const negativeSetupExamples = [
    "Dự án gần nhất em làm top",
    "Anh cho em budget 20 triệu",
    "Site mở bot rồi không có tín hiệu",
    "Nếu cách đó không hiệu quả",
    "Anh đưa em 20 domain",
    "Vị trí trung bình giảm từ 3 xuống 6",
    "Đối thủ chính đang tăng"
  ];

  positiveQuestionExamples.forEach((text) => {
    it(`detects positive question: "${text}"`, () => {
      expect(hasQuestionIntent(text)).toBe(true);
      expect(isVietnameseSentenceComplete(text)).toBe(true);
    });
  });

  negativeSetupExamples.forEach((text) => {
    it(`rejects negative setup: "${text}"`, () => {
      expect(hasQuestionIntent(text)).toBe(false);
      expect(isSetupFragment(text)).toBe(true);
      expect(isVietnameseSentenceComplete(text)).toBe(false);
    });
  });
});

describe("SmartQuestionDetector turn evaluation", () => {
  let detector: SmartQuestionDetector;

  beforeEach(() => {
    vi.useFakeTimers();
    detector = new SmartQuestionDetector();
  });

  afterEach(() => {
    detector.reset();
    vi.useRealTimers();
  });

  it("finalizes positive question at candidate pause (~1200ms)", () => {
    const onPossibleEnd = vi.fn();
    const onFinalize = vi.fn();

    detector.updateTurn(
      "Dự án gần nhất em làm top là con nào",
      onPossibleEnd,
      onFinalize
    );

    vi.advanceTimersByTime(1300);

    expect(onPossibleEnd).toHaveBeenCalled();
    expect(onFinalize).toHaveBeenCalledWith(
      expect.objectContaining({
        isComplete: true,
        text: "Dự án gần nhất em làm top là con nào"
      })
    );
  });

  it("does NOT finalize setup statement even after hard timeout (~2800ms)", () => {
    const onPossibleEnd = vi.fn();
    const onFinalize = vi.fn();

    detector.updateTurn(
      "Site mở bot rồi không có tín hiệu",
      onPossibleEnd,
      onFinalize
    );

    vi.advanceTimersByTime(3000);

    expect(onPossibleEnd).toHaveBeenCalled();
    expect(onFinalize).not.toHaveBeenCalled();
  });
});
