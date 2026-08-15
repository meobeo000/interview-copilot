import { describe, expect, it } from "vitest";
import { classifyQuestionIntent } from "./intentClassifier";

describe("Question Intent Classifier", () => {
  it("classifies PROJECT_EXPERIENCE questions correctly", () => {
    const res = classifyQuestionIntent("Dự án iGaming gần nhất em làm là con nào?");
    expect(res.category).toBe("PROJECT_EXPERIENCE");
    expect(res.confidence).toBeGreaterThanOrEqual(0.85);
  });

  it("classifies BUDGET_ALLOCATION questions correctly", () => {
    const res = classifyQuestionIntent("Guest Post với PBN em chia budget thế nào?");
    expect(res.category).toBe("BUDGET_ALLOCATION");
    expect(res.confidence).toBeGreaterThanOrEqual(0.85);
  });

  it("classifies NO_KEYWORD_SIGNAL questions correctly", () => {
    const res = classifyQuestionIntent("Site mở bot hai tuần vẫn chưa nhận keyword thì em làm sao?");
    expect(res.category).toBe("NO_KEYWORD_SIGNAL");
  });

  it("classifies ONPAGE_DIAGNOSIS questions correctly", () => {
    const res = classifyQuestionIntent("Em check GSC với Ahrefs trước hay on-page trước?");
    expect(res.category).toBe("ONPAGE_DIAGNOSIS");
  });

  it("classifies PBN_TIMING questions correctly", () => {
    const res = classifyQuestionIntent("Tại sao ngày thứ 10 em mới bắt đầu đi PBN?");
    expect(res.category).toBe("PBN_TIMING");
  });

  it("classifies DOMAIN_SELECTION questions correctly", () => {
    const res = classifyQuestionIntent("Domain này DR cao nhưng organic traffic bằng 0 thì em có lấy không?");
    expect(res.category).toBe("DOMAIN_SELECTION");
  });

  it("classifies CORE_UPDATE_RECOVERY questions correctly", () => {
    const res = classifyQuestionIntent("Site bị ảnh hưởng sau Core Update thì xử lý thế nào?");
    expect(res.category).toBe("CORE_UPDATE_RECOVERY");
  });

  it("classifies GSC_RANKING_DROP questions correctly", () => {
    const res = classifyQuestionIntent("GSC tụt impression và click đột ngột thì chẩn đoán ra sao?");
    expect(res.category).toBe("GSC_RANKING_DROP");
  });

  it("classifies NEGATIVE_SEO questions correctly", () => {
    const res = classifyQuestionIntent("Bị đối thủ spam link bẩn thì xử lý sao em?");
    expect(res.category).toBe("NEGATIVE_SEO");
  });

  it("classifies REDIRECT_301 questions correctly", () => {
    const res = classifyQuestionIntent("Chuyển hướng 301 domain cũ sang domain mới giữ juice thế nào?");
    expect(res.category).toBe("REDIRECT_301");
  });

  it("classifies STRATEGY_PLAN questions correctly", () => {
    const res = classifyQuestionIntent("Em đi internal link cho money page như thế nào?");
    expect(res.category).toBe("STRATEGY_PLAN");
  });

  it("classifies background and unrelated speech as UNKNOWN", () => {
    const res = classifyQuestionIntent("Alo 1 2 3 nghe rõ không em?");
    expect(res.category).toBe("UNKNOWN");
    expect(res.confidence).toBeLessThan(0.5);
  });
});
