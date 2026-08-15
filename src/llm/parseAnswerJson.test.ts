import { describe, expect, it } from "vitest";
import { parseAnswerJson, parsePartialAnswerJson } from "./parseAnswerJson";

describe("parsePartialAnswerJson", () => {
  it("returns empty fields when rawJsonText is early json start without values", () => {
    const res = parsePartialAnswerJson("{\n  ");
    expect(res.openingLine).toBe("");
    expect(res.bullets).toEqual([]);
    expect(res.keywords).toEqual([]);
  });

  it("extracts openingLine progressively while streaming before quote is closed or bullets start", () => {
    const res = parsePartialAnswerJson('{\n  "openingLine": "Dự án iGaming gần nhất em làm là');
    expect(res.openingLine).toBe("Dự án iGaming gần nhất em làm là");
    expect(res.bullets).toEqual([]);
  });

  it("extracts openingLine and bullets progressively as array items arrive", () => {
    const streamChunk = `{\n  "openingLine": "Dự án iGaming gần nhất em làm là [TÊN SITE]",\n  "bullets": [\n    "Tối ưu On-page và Entity",\n    "Xây dựng PBN và Guest Post"`;
    const res = parsePartialAnswerJson(streamChunk);
    expect(res.openingLine).toBe("Dự án iGaming gần nhất em làm là [TÊN SITE]");
    expect(res.bullets).toEqual([
      "Tối ưu On-page và Entity",
      "Xây dựng PBN và Guest Post"
    ]);
  });

  it("parses complete valid JSON correctly", () => {
    const jsonStr = JSON.stringify({
      openingLine: "Cách làm SEO cho site mới...",
      bullets: ["Nghiên cứu từ khóa", "Viết bài chuẩn SEO"],
      keywords: ["SEO", "Content"]
    });
    const res = parseAnswerJson(jsonStr);
    expect(res.openingLine).toBe("Cách làm SEO cho site mới...");
    expect(res.bullets).toEqual(["Nghiên cứu từ khóa", "Viết bài chuẩn SEO"]);
    expect(res.keywords).toEqual(["SEO", "Content"]);
  });

  it("handles non-JSON plain text fallback cleanly", () => {
    const plain = "Em xin trả lời như sau:\n- Bước 1: Audit site\n- Bước 2: Tối ưu";
    const res = parseAnswerJson(plain);
    expect(res.openingLine).toBe("Em xin trả lời như sau:");
    expect(res.bullets).toEqual(["Bước 1: Audit site", "Bước 2: Tối ưu"]);
  });
});
