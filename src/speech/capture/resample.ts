/**
 * Sample-rate conversion to the 16 kHz the recogniser expects.
 *
 * Browsers hand back whatever the hardware runs at (usually 44.1 or 48 kHz),
 * and asking for a 16 kHz AudioContext is a request, not a guarantee -- Safari
 * in particular ignores it. Feeding the model the wrong rate does not error, it
 * just quietly produces wrong phonemes, so this always checks.
 */

import { SAMPLE_RATE } from '../phonemes/recognizer'

/** Resample mono float audio to SAMPLE_RATE, using the browser's own resampler. */
export async function resampleTo16k(audio: Float32Array, fromRate: number): Promise<Float32Array> {
  if (fromRate === SAMPLE_RATE || audio.length === 0) return audio

  const targetLength = Math.max(1, Math.round((audio.length * SAMPLE_RATE) / fromRate))
  const offline = new OfflineAudioContext(1, targetLength, SAMPLE_RATE)

  const buffer = offline.createBuffer(1, audio.length, fromRate)
  // Copy into a fresh ArrayBuffer-backed view: copyToChannel will not accept a
  // possibly-shared buffer.
  buffer.copyToChannel(new Float32Array(audio), 0)

  const source = offline.createBufferSource()
  source.buffer = buffer
  source.connect(offline.destination)
  source.start()

  const rendered = await offline.startRendering()
  return rendered.getChannelData(0).slice()
}

/** Average multi-channel audio down to mono. */
export function toMono(channels: Float32Array[]): Float32Array {
  if (channels.length === 0) return new Float32Array(0)
  if (channels.length === 1) return channels[0]
  const out = new Float32Array(channels[0].length)
  for (let i = 0; i < out.length; i++) {
    let total = 0
    for (const c of channels) total += c[i] ?? 0
    out[i] = total / channels.length
  }
  return out
}

/** Join captured chunks into one contiguous buffer. */
export function concatChunks(chunks: Float32Array[]): Float32Array {
  const total = chunks.reduce((a, c) => a + c.length, 0)
  const out = new Float32Array(total)
  let at = 0
  for (const c of chunks) {
    out.set(c, at)
    at += c.length
  }
  return out
}
