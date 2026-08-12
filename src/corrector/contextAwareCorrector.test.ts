import { describe, expect, it } from "vitest";
import { ContextAwareTranscriptCorrector } from "./contextAwareCorrector";

describe("ContextAwareTranscriptCorrector", () => {
  const corrector = new ContextAwareTranscriptCorrector();

  it("corrects 'nhận sai' to 'nhận site' in SEO context", () => {
    const input = "em nói cho anh từ lúc nhận sai đến lúc keyword bắt đầu lên";
    const result = corrector.correct(input);

    expect(result.correctedText).toBe("em nói cho anh từ lúc nhận site đến lúc keyword bắt đầu lên");
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0].from).toBe("nhận sai");
    expect(result.changes[0].to).toBe("nhận site");
    expect(result.changes[0].confidence).toBe(0.94);
  });

  it("corrects phonetic forms for Ahrefs and GSC", () => {
    const input = "anh kiểm tra ai rép và g s c trước";
    const result = corrector.correct(input);

    expect(result.correctedText).toBe("anh kiểm tra Ahrefs và GSC trước");
    expect(result.changes.some((c) => c.to === "Ahrefs")).toBe(true);
    expect(result.changes.some((c) => c.to === "GSC")).toBe(true);
  });

  it("corrects phonetic forms for PBN", () => {
    const input = "ngày thứ 10 em bắt đầu đi pi bi en";
    const result = corrector.correct(input);

    expect(result.correctedText).toBe("ngày thứ 10 em bắt đầu đi PBN");
    expect(result.changes.some((c) => c.to === "PBN")).toBe(true);
  });

  it("corrects 'co update' to 'Core Update'", () => {
    const input = "site bị ảnh hưởng sau co update";
    const result = corrector.correct(input);

    expect(result.correctedText).toBe("site bị ảnh hưởng sau Core Update");
    expect(result.changes.some((c) => c.to === "Core Update")).toBe(true);
  });

  it("leaves already-correct SEO terms unchanged", () => {
    const input = "em kiểm tra referring domain và anchor text";
    const result = corrector.correct(input);

    expect(result.correctedText).toBe("em kiểm tra referring domain và anchor text");
    expect(result.changes).toHaveLength(0);
  });

  it("PROTECTS FALSE POSITIVE: 'anh nói sai chỗ này' must NOT be converted to site", () => {
    const input = "anh nói sai chỗ này";
    const result = corrector.correct(input);

    expect(result.correctedText).toBe("anh nói sai chỗ này");
    expect(result.changes).toHaveLength(0);
  });

  it("PROTECTS FALSE POSITIVE: 'em làm sai thì sửa lại' must NOT be converted to site", () => {
    const input = "em làm sai thì sửa lại";
    const result = corrector.correct(input);

    expect(result.correctedText).toBe("em làm sai thì sửa lại");
    expect(result.changes).toHaveLength(0);
  });

  it("PROTECTS FALSE POSITIVE: 'em xây sai cấu trúc site' must NOT be converted to site", () => {
    const input = "em xây sai cấu trúc site";
    const result = corrector.correct(input);

    expect(result.correctedText).toBe("em xây sai cấu trúc site");
    expect(result.changes).toHaveLength(0);
  });

  it("PROTECTS FALSE POSITIVE: 'em chạy sai campaign' must NOT be converted to site", () => {
    const input = "em chạy sai campaign";
    const result = corrector.correct(input);

    expect(result.correctedText).toBe("em chạy sai campaign");
    expect(result.changes).toHaveLength(0);
  });

  it("PROTECTS FALSE POSITIVE: 'em mở sai trang' must NOT be converted to site", () => {
    const input = "em mở sai trang";
    const result = corrector.correct(input);

    expect(result.correctedText).toBe("em mở sai trang");
    expect(result.changes).toHaveLength(0);
  });

  it("PROTECTS FALSE POSITIVE: 'em chọn sai domain' must NOT be converted to site", () => {
    const input = "em chọn sai domain";
    const result = corrector.correct(input);

    expect(result.correctedText).toBe("em chọn sai domain");
    expect(result.changes).toHaveLength(0);
  });

  it("PROTECTS FALSE POSITIVE: 'em setup sai canonical' must NOT be converted to site", () => {
    const input = "em setup sai canonical";
    const result = corrector.correct(input);

    expect(result.correctedText).toBe("em setup sai canonical");
    expect(result.changes).toHaveLength(0);
  });

  it("PROTECTS FALSE POSITIVE: 'sai canonical', 'sai cấu hình', 'sai dữ liệu' must NOT be converted to site", () => {
    const inputs = [
      "sai canonical",
      "sai cấu hình",
      "sai dữ liệu",
      "tính sai thông số"
    ];

    for (const input of inputs) {
      const result = corrector.correct(input);
      expect(result.correctedText).toBe(input);
      expect(result.changes).toHaveLength(0);
    }
  });

  it("leaves 'site hiện tại vẫn ổn' unchanged", () => {
    const input = "site hiện tại vẫn ổn";
    const result = corrector.correct(input);

    expect(result.correctedText).toBe("site hiện tại vẫn ổn");
    expect(result.changes).toHaveLength(0);
  });

  it("leaves 'keyword giảm ranking' unchanged", () => {
    const input = "keyword giảm ranking";
    const result = corrector.correct(input);

    expect(result.correctedText).toBe("keyword giảm ranking");
    expect(result.changes).toHaveLength(0);
  });
});
