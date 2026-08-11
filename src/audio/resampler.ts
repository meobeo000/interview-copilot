/**
 * Resamples a mono Float32Array audio buffer from inputRate to targetRate using linear interpolation.
 */
export function resampleMono(input: Float32Array, inputRate: number, targetRate: number): Float32Array {
  if (inputRate === targetRate || input.length === 0) {
    return input;
  }

  const outputLength = Math.round((input.length * targetRate) / inputRate);
  if (outputLength === 0) {
    return new Float32Array(0);
  }

  const output = new Float32Array(outputLength);
  const ratio = inputRate / targetRate;

  for (let i = 0; i < outputLength; i++) {
    const index = i * ratio;
    const iFloor = Math.floor(index);
    const iCeil = Math.min(iFloor + 1, input.length - 1);
    const fraction = index - iFloor;

    output[i] = input[iFloor] * (1 - fraction) + input[iCeil] * fraction;
  }

  return output;
}
