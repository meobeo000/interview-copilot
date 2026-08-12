import { describe, expect, it } from "vitest";
import { float32ToLinear16 } from "./audioEncoding";

describe("STT audio encoding", () => {
  it("converts normalized float PCM to little-endian LINEAR16", () => {
    const input = new Float32Array([-1, -0.5, 0, 0.5, 1]);
    const pcm = float32ToLinear16(input.buffer);

    expect(pcm.length).toBe(input.length * 2);
    expect([...pcm]).toEqual([0, 128, 0, 192, 0, 0, 0, 64, 255, 127]);
  });

  it("rejects malformed or empty audio buffers", () => {
    expect(() => float32ToLinear16(new ArrayBuffer(0))).toThrow("Malformed audio frame");
    expect(() => float32ToLinear16(new Uint8Array([1]).buffer)).toThrow("Malformed audio frame");
  });
});
