import { describe, expect, it } from 'vitest'
import { encodeWav } from './encodeWav'

/** Read the header fields back out so the container is verified, not assumed. */
async function header(blob: Blob) {
  const view = new DataView(await blob.arrayBuffer())
  const ascii = (offset: number, length: number) =>
    String.fromCharCode(...Array.from({ length }, (_, i) => view.getUint8(offset + i)))
  return {
    riff: ascii(0, 4),
    wave: ascii(8, 4),
    fmt: ascii(12, 4),
    format: view.getUint16(20, true),
    channels: view.getUint16(22, true),
    sampleRate: view.getUint32(24, true),
    bitsPerSample: view.getUint16(34, true),
    data: ascii(36, 4),
    dataBytes: view.getUint32(40, true),
    riffSize: view.getUint32(4, true),
    sampleAt: (i: number) => view.getInt16(44 + i * 2, true),
  }
}

describe('encodeWav', () => {
  it('writes a valid mono 16-bit PCM header', async () => {
    const h = await header(encodeWav(new Float32Array(100), 16000))
    expect(h.riff).toBe('RIFF')
    expect(h.wave).toBe('WAVE')
    expect(h.fmt).toBe('fmt ')
    expect(h.data).toBe('data')
    expect(h.format).toBe(1)
    expect(h.channels).toBe(1)
    expect(h.sampleRate).toBe(16000)
    expect(h.bitsPerSample).toBe(16)
  })

  it('declares the correct sizes', async () => {
    const h = await header(encodeWav(new Float32Array(100), 16000))
    expect(h.dataBytes).toBe(200)
    expect(h.riffSize).toBe(236) // 36 + data
  })

  it('reports audio/wav so an <audio> element will play it', () => {
    expect(encodeWav(new Float32Array(10), 16000).type).toBe('audio/wav')
  })

  it('converts full-scale samples without wrapping', async () => {
    const h = await header(encodeWav(Float32Array.from([1, -1, 0]), 16000))
    expect(h.sampleAt(0)).toBe(32767)
    expect(h.sampleAt(1)).toBe(-32768)
    expect(h.sampleAt(2)).toBe(0)
  })

  it('clamps overshoot instead of letting it wrap into a click', async () => {
    const h = await header(encodeWav(Float32Array.from([1.8, -2.5]), 16000))
    expect(h.sampleAt(0)).toBe(32767)
    expect(h.sampleAt(1)).toBe(-32768)
  })

  it('handles empty audio', async () => {
    const blob = encodeWav(new Float32Array(0), 16000)
    expect(blob.size).toBe(44)
    expect((await header(blob)).dataBytes).toBe(0)
  })

  it('preserves the sample rate it is given', async () => {
    expect((await header(encodeWav(new Float32Array(4), 44100))).sampleRate).toBe(44100)
  })
})
