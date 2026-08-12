export const AUDIO_SAMPLE_RATE = 16000;
export const AUDIO_CHANNELS = 1;
export const AUDIO_ENCODING = "LINEAR16" as const;

export function float32ToLinear16(float32Data: ArrayBuffer): Buffer {
  if (float32Data.byteLength === 0 || float32Data.byteLength % Float32Array.BYTES_PER_ELEMENT !== 0) {
    throw new Error("Malformed audio frame: expected a non-empty Float32Array buffer.");
  }

  const float32Array = new Float32Array(float32Data);
  const pcm = Buffer.allocUnsafe(float32Array.length * 2);

  for (let index = 0; index < float32Array.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, float32Array[index] ?? 0));
    const int16Sample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    pcm.writeInt16LE(Math.round(int16Sample), index * 2);
  }

  return pcm;
}
