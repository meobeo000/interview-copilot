import { describe, expect, it } from "vitest";
import { MockQuestionDetector } from "./mockQuestionDetector";

describe("MockQuestionDetector", () => {
  it("waits on incomplete Vietnamese fragments", async () => {
    const detector = new MockQuestionDetector();

    const result = await detector.analyze("Theo em backlink hiện tại");

    expect(result.isQuestion).toBe(false);
    expect(result.confidence).toBeLessThan(0.5);
  });

  it("detects a complete mixed Vietnamese and SEO English question", async () => {
    const detector = new MockQuestionDetector();

    const result = await detector.analyze(
      "Nếu GSC giảm traffic sau Core Update và Ahrefs báo mất backlink, canonical sai, redirect 301 lỗi thì xử lý thế nào?"
    );

    expect(result.isQuestion).toBe(true);
    expect(result.cleanedQuestion).toContain("Core Update");
  });
});
