import { describe, expect, it } from "vitest";
import {
  float32ToPcm16Base64,
  process16kFloat32To24kPcm16Base64,
  resample16kTo24k
} from "./audioEncoding24k";

describe("audioEncoding24k", () => {
  it("resamples 16kHz Float32 buffer to 24kHz Float32 buffer with 1.5x output length", () => {
    const inputSamples = new Float32Array([0, 0.5, 1.0, 0.5, 0, -0.5, -1.0, -0.5]);
    const resampled = resample16kTo24k(inputSamples.buffer);

    expect(resampled.length).toBe(12); // 8 * 1.5 = 12
    expect(resampled[0]).toBeCloseTo(0);
    expect(resampled[resampled.length - 1]).toBeCloseTo(-0.5);
  });

  it("handles empty or misaligned buffers cleanly", () => {
    expect(resample16kTo24k(new ArrayBuffer(0)).length).toBe(0);
    expect(float32ToPcm16Base64(new Float32Array(0))).toBe("");

    expect(() => resample16kTo24k(new ArrayBuffer(3))).toThrow(
      "Malformed audio frame: expected Float32Array buffer alignment."
    );
  });

  it("converts 24kHz Float32Array to 16-bit PCM LE Base64 string", () => {
    const samples = new Float32Array([0, 1.0, -1.0]);
    const base64 = float32ToPcm16Base64(samples);

    expect(typeof base64).toBe("string");
    expect(base64.length).toBeGreaterThan(0);

    const buffer = Buffer.from(base64, "base64");
    expect(buffer.length).toBe(6); // 3 samples * 2 bytes = 6 bytes
    expect(buffer.readInt16LE(0)).toBe(0);
    expect(buffer.readInt16LE(2)).toBe(32767);
    expect(buffer.readInt16LE(4)).toBe(-32768);
  });

  it("processes 16k Float32 buffer to 24k PCM16 Base64 in one step", () => {
    const samples = new Float32Array([0.1, 0.2, 0.3, 0.4]);
    const base64 = process16kFloat32To24kPcm16Base64(samples.buffer);

    const buffer = Buffer.from(base64, "base64");
    expect(buffer.length).toBe(12); // Math.round(4 * 1.5) = 6 samples * 2 bytes = 12 bytes
  });
});
