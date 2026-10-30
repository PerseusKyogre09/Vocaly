export function resamplePcm16(input, fromRate, toRate) {
  if (fromRate === toRate) return input;
  if (input.length % 2 !== 0) throw new Error('PCM16 payload must contain complete samples.');
  const inputSamples = new Int16Array(input.buffer, input.byteOffset, input.byteLength / 2);
  const outputLength = Math.max(1, Math.round(inputSamples.length * toRate / fromRate));
  const output = Buffer.alloc(outputLength * 2);
  for (let index = 0; index < outputLength; index += 1) {
    const position = index * fromRate / toRate;
    const left = Math.floor(position);
    const right = Math.min(left + 1, inputSamples.length - 1);
    const weight = position - left;
    const sample = Math.round(inputSamples[left] * (1 - weight) + inputSamples[right] * weight);
    output.writeInt16LE(Math.max(-32768, Math.min(32767, sample)), index * 2);
  }
  return output;
}
