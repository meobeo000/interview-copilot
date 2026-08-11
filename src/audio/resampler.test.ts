import { describe, expect, it } from "vitest";
import { resampleMono } from "./resampler";

describe("resampleMono", () => {
  it("returns unchanged buffer if sample rate matches target", () => {
    const input = new Float32Array([0.1, 0.2, 0.3]);
    const resampled = resampleMono(input, 16_000, 16_000);
    expect(resampled).toBe(input);
  });

  it("downsamples 48,000 Hz to 16,000 Hz correctly (3:1 ratio)", () => {
    const input = new Float32Array(4800);
    for (let i = 0; i < input.length; i++) {
      input[i] = Math.sin((i / 4800) * Math.PI * 2);
    }

    const resampled = resampleMono(input, 48_000, 16_000);
    expect(resampled.length).toBe(1600);
    expect(resampled[0]).toBeCloseTo(input[0], 4);
  });

  it("handles empty input buffers safely", () => {
    const empty = new Float32Array(0);
    const resampled = resampleMono(empty, 48_000, 16_000);
    expect(resampled.length).toBe(0);
  });
});
