export function downsample(input: Float32Array, fromRate: number, toRate: number) {
  if (fromRate === toRate) return input
  const ratio = fromRate / toRate
  const length = Math.floor(input.length / ratio)
  const output = new Float32Array(length)
  for (let index = 0; index < length; index += 1) {
    const start = Math.floor(index * ratio)
    const end = Math.max(start + 1, Math.min(input.length, Math.floor((index + 1) * ratio)))
    let sum = 0
    for (let cursor = start; cursor < end; cursor += 1) sum += input[cursor]
    output[index] = sum / (end - start)
  }
  return output
}

export function mergeSamples(chunks: Float32Array[]) {
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const merged = new Float32Array(length)
  let offset = 0
  let peak = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    for (const sample of chunk) peak = Math.max(peak, Math.abs(sample))
    offset += chunk.length
  }
  return { merged, peak }
}

export function normalizePeak(samples: Float32Array) {
  let peak = 0
  for (const sample of samples) peak = Math.max(peak, Math.abs(sample))
  if (peak < 0.001) return samples
  const gain = Math.min(8, 0.9 / peak)
  if (gain <= 1.05) return samples
  const output = new Float32Array(samples.length)
  for (let index = 0; index < samples.length; index += 1) {
    output[index] = Math.max(-1, Math.min(1, samples[index] * gain))
  }
  return output
}

export function trimSilence(samples: Float32Array, sampleRate: number) {
  const window = Math.max(1, Math.floor(sampleRate * 0.02))
  const loudAt = (index: number) => {
    const end = Math.min(samples.length, index + window)
    let peak = 0
    for (let cursor = Math.max(0, index); cursor < end; cursor += 1) peak = Math.max(peak, Math.abs(samples[cursor]))
    return peak > 0.015
  }
  let start = 0
  while (start < samples.length && !loudAt(start)) start += window
  let end = samples.length
  while (end - window > start && !loudAt(end - window)) end -= window
  const pad = Math.floor(sampleRate * 0.15)
  return samples.subarray(Math.max(0, start - pad), Math.min(samples.length, end + pad))
}

export function encodeWav(samples: Float32Array, sampleRate: number) {
  const buffer = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buffer)
  const write = (offset: number, text: string) => {
    for (let index = 0; index < text.length; index += 1) view.setUint8(offset + index, text.charCodeAt(index))
  }
  write(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  write(8, 'WAVE')
  write(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  write(36, 'data')
  view.setUint32(40, samples.length * 2, true)
  let offset = 44
  for (const sample of samples) {
    const clamped = Math.max(-1, Math.min(1, sample))
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true)
    offset += 2
  }
  return buffer
}
