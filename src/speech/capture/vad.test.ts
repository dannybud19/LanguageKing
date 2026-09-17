import { describe, expect, it } from 'vitest'
import { frameEnergies, isTrailingSilence, noiseFloor, rms, trimSilence } from './vad'

const SR = 16000

/** A tone, standing in for speech. */
function tone(seconds: number, amplitude = 0.3, freq = 220): Float32Array {
  const n = Math.round(SR * seconds)
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) out[i] = amplitude * Math.sin((2 * Math.PI * freq * i) / SR)
  return out
}

function quiet(seconds: number, amplitude = 0.0005): Float32Array {
  const n = Math.round(SR * seconds)
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) out[i] = (Math.random() * 2 - 1) * amplitude
  return out
}

function concat(...parts: Float32Array[]): Float32Array {
  const out = new Float32Array(parts.reduce((a, p) => a + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

describe('rms', () => {
  it('is zero for silence', () => {
    expect(rms(new Float32Array(100))).toBe(0)
  })

  it('is about A/sqrt(2) for a sine wave', () => {
    expect(rms(tone(0.1, 0.5))).toBeCloseTo(0.5 / Math.SQRT2, 2)
  })

  it('returns 0 for an empty or inverted range', () => {
    expect(rms(new Float32Array(0))).toBe(0)
    expect(rms(tone(0.1), 500, 100)).toBe(0)
  })
})

describe('frameEnergies', () => {
  it('produces one value per 20ms frame', () => {
    expect(frameEnergies(tone(1), SR)).toHaveLength(50)
  })

  it('tracks where the energy is', () => {
    const e = frameEnergies(concat(quiet(0.2), tone(0.2)), SR)
    expect(e[0]).toBeLessThan(e[e.length - 1])
  })
})

describe('noiseFloor', () => {
  it('reports the quiet part, not the average', () => {
    // Mostly loud with a quiet head: a mean would be misleadingly high.
    const e = frameEnergies(concat(quiet(0.2), tone(0.8)), SR)
    expect(noiseFloor(e)).toBeLessThan(0.01)
  })

  it('is zero for an empty signal', () => {
    expect(noiseFloor(new Float32Array(0))).toBe(0)
  })
})

describe('trimSilence', () => {
  it('removes silence either side of speech', () => {
    const audio = concat(quiet(0.5), tone(0.4), quiet(0.5))
    const r = trimSilence(audio, { sampleRate: SR })
    expect(r.hasSpeech).toBe(true)
    // Roughly the speech plus padding, well short of the 1.4s original.
    expect(r.audio.length / SR).toBeGreaterThan(0.35)
    expect(r.audio.length / SR).toBeLessThan(0.75)
  })

  it('reports how much was removed from the front', () => {
    const r = trimSilence(concat(quiet(0.5), tone(0.3)), { sampleRate: SR })
    expect(r.offsetSeconds).toBeGreaterThan(0.3)
    expect(r.offsetSeconds).toBeLessThan(0.5)
  })

  it('keeps padding so the first consonant is not clipped', () => {
    const r = trimSilence(concat(quiet(0.3), tone(0.2)), { sampleRate: SR, padMs: 60 })
    // Speech starts at 0.3s; trimming must begin a little before that.
    expect(r.offsetSeconds).toBeLessThan(0.3)
  })

  it('reports no speech for a silent recording', () => {
    const r = trimSilence(quiet(1), { sampleRate: SR })
    expect(r.hasSpeech).toBe(false)
    expect(r.audio).toHaveLength(0)
  })

  it('handles empty input', () => {
    const r = trimSilence(new Float32Array(0), { sampleRate: SR })
    expect(r.hasSpeech).toBe(false)
  })

  it('leaves speech that fills the whole recording almost untouched', () => {
    const audio = tone(0.5)
    const r = trimSilence(audio, { sampleRate: SR })
    expect(r.audio.length).toBeGreaterThan(audio.length * 0.9)
  })
})

describe('isTrailingSilence', () => {
  it('is true once the speaker has stopped', () => {
    expect(isTrailingSilence(concat(tone(0.6), quiet(1)), { sampleRate: SR, silenceMs: 800 })).toBe(
      true,
    )
  })

  it('is false while they are still talking', () => {
    expect(isTrailingSilence(concat(quiet(0.3), tone(1)), { sampleRate: SR, silenceMs: 800 })).toBe(
      false,
    )
  })

  it('is false before any speech has happened', () => {
    // Otherwise recording would stop the instant it started.
    expect(isTrailingSilence(quiet(2), { sampleRate: SR, silenceMs: 800 })).toBe(false)
  })

  it('is false when there is not yet enough audio to judge', () => {
    expect(isTrailingSilence(tone(0.1), { sampleRate: SR, silenceMs: 800 })).toBe(false)
  })
})
