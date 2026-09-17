/**
 * Encode captured samples as a WAV blob.
 *
 * The recogniser path works in raw Float32 because that is what the models
 * need, but the UI also offers "listen back to your own voice". Rather than
 * running a second MediaRecorder capture just to get a playable file, the
 * samples we already have are wrapped in a WAV header.
 *
 * WAV rather than a compressed format on purpose: it needs no encoder, and the
 * bytes are the exact audio that was scored, so what the learner hears is what
 * the model heard.
 */

/** Wrap mono float samples in a 16-bit PCM WAV container. */
export function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const HEADER_BYTES = 44
  const buffer = new ArrayBuffer(HEADER_BYTES + samples.length * 2)
  const view = new DataView(buffer)

  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i))
  }

  const dataBytes = samples.length * 2

  writeAscii(0, 'RIFF')
  view.setUint32(4, 36 + dataBytes, true)
  writeAscii(8, 'WAVE')

  writeAscii(12, 'fmt ')
  view.setUint32(16, 16, true) // fmt chunk size
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true) // byte rate
  view.setUint16(32, 2, true) // block align
  view.setUint16(34, 16, true) // bits per sample

  writeAscii(36, 'data')
  view.setUint32(40, dataBytes, true)

  // Float [-1,1] to signed 16-bit, clamped so any overshoot does not wrap
  // around into a loud click.
  let offset = HEADER_BYTES
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true)
    offset += 2
  }

  return new Blob([buffer], { type: 'audio/wav' })
}
