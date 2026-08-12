export const OPENAI_SOURCE_SAMPLE_RATE = 16000;
export const OPENAI_TARGET_SAMPLE_RATE = 24000;

export function resample16kTo24k(float32Data: ArrayBuffer): Float32Array {
  if (float32Data.byteLength === 0) {
    return new Float32Array(0);
  }
  if (float32Data.byteLength % Float32Array.BYTES_PER_ELEMENT !== 0) {
    throw new Error("Malformed audio frame: expected Float32Array buffer alignment.");
  }

  const input = new Float32Array(float32Data);
  if (input.length === 0) {
    return new Float32Array(0);
  }

  const ratio = OPENAI_TARGET_SAMPLE_RATE / OPENAI_SOURCE_SAMPLE_RATE; // 1.5
  const outputLength = Math.round(input.length * ratio);
  const output = new Float32Array(outputLength);

  for (let i = 0; i < outputLength; i++) {
    const srcIndex = i / ratio;
    const index0 = Math.floor(srcIndex);
    const index1 = Math.min(index0 + 1, input.length - 1);
    const fraction = srcIndex - index0;

    const sample0 = input[index0] ?? 0;
    const sample1 = input[index1] ?? 0;

    output[i] = sample0 + (sample1 - sample0) * fraction;
  }

  return output;
}

export function float32ToPcm16Base64(float32Array: Float32Array): string {
  if (float32Array.length === 0) {
    return "";
  }

  const buffer = Buffer.allocUnsafe(float32Array.length * 2);
  for (let i = 0; i < float32Array.length; i++) {
    const sample = Math.max(-1, Math.min(1, float32Array[i] ?? 0));
    const int16Sample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    buffer.writeInt16LE(Math.round(int16Sample), i * 2);
  }

  return buffer.toString("base64");
}

export function process16kFloat32To24kPcm16Base64(float32Data: ArrayBuffer): string {
  const resampled = resample16kTo24k(float32Data);
  return float32ToPcm16Base64(resampled);
}
