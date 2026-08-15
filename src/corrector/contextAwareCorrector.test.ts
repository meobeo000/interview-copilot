import { describe, expect, it } from "vitest";
import { ContextAwareTranscriptCorrector } from "./contextAwareCorrector";

describe("Safe Lexical Normalizer (ContextAwareTranscriptCorrector)", () => {
  const corrector = new ContextAwareTranscriptCorrector();

  it("normalizes compound words 'back link' and 'key word'", () => {
    const input = "em tối ưu back link và key word cho site";
    const result = corrector.correct(input);

    expect(result.correctedText).toBe("em tối ưu backlink và keyword cho site");
    expect(result.changes).toHaveLength(2);
    expect(result.changes.some((c) => c.to === "backlink")).toBe(true);
    expect(result.changes.some((c) => c.to === "keyword")).toBe(true);
  });

  it("normalizes 'internal links' to 'internal link'", () => {
    const input = "em đi internal links cho money page";
    const result = corrector.correct(input);

    expect(result.correctedText).toBe("em đi internal link cho money page");
    expect(result.changes.some((c) => c.to === "internal link")).toBe(true);
  });

  it("normalizes brand capitalization for iGaming and Guest Post", () => {
    const input = "dự án igaming và đi guestpost";
    const result = corrector.correct(input);

    expect(result.correctedText).toBe("dự án iGaming và đi Guest Post");
    expect(result.changes.some((c) => c.to === "iGaming")).toBe(true);
    expect(result.changes.some((c) => c.to === "Guest Post")).toBe(true);
  });

  it("leaves ambiguous phonetic words untouched in display transcript (raw preserved)", () => {
    const input = "em nói từ lúc nhận sai đến lúc keyword lên";
    const result = corrector.correct(input);

    // Raw transcript preserved untouched
    expect(result.rawText).toBe(input);
    expect(result.correctedText).toBe(input);
  });

  it("preserves 'làm sai', 'nói sai', 'sai canonical' untouched", () => {
    const inputs = [
      "anh nói sai chỗ này",
      "em làm sai thì sửa lại",
      "setup sai canonical"
    ];

    for (const input of inputs) {
      const result = corrector.correct(input);
      expect(result.correctedText).toBe(input);
    }
  });
});
