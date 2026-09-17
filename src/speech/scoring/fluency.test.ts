import { describe, expect, it } from 'vitest'
import { fluencyScore } from './fluency'
import type { RecognizedPhoneme } from '../types'

/** Evenly spaced phonemes at a given rate. */
function steady(count: number, perSecond: number): RecognizedPhoneme[] {
  const step = 1 / perSecond
  return Array.from({ length: count }, (_, i) => ({
    symbol: 'a',
    start: i * step,
    end: (i + 1) * step,
    confidence: 0.9,
    alternates: [],
  }))
}

describe('fluencyScore', () => {
  it('scores steady conversational speech highly', () => {
    expect(fluencyScore(steady(30, 10)).score).toBeGreaterThan(0.9)
  })

  it('penalises halting speech', () => {
    expect(fluencyScore(steady(30, 3)).score).toBeLessThan(fluencyScore(steady(30, 10)).score)
  })

  it('does not penalise speaking faster than comfortable', () => {
    // Fast is not the same as bad; only halting speech should be marked down.
    expect(fluencyScore(steady(30, 14)).score).toBeGreaterThan(0.9)
  })

  it('detects and penalises internal pauses', () => {
    const withPause = [...steady(10, 10)]
    // Insert a one-second hesitation in the middle.
    for (let i = 5; i < withPause.length; i++) {
      withPause[i] = { ...withPause[i], start: withPause[i].start + 1, end: withPause[i].end + 1 }
    }
    const result = fluencyScore(withPause)
    expect(result.pauseCount).toBe(1)
    expect(result.pauseSeconds).toBeCloseTo(1, 1)
    expect(result.score).toBeLessThan(fluencyScore(steady(10, 10)).score)
  })

  it('ignores gaps too short to be hesitation', () => {
    expect(fluencyScore(steady(20, 10)).pauseCount).toBe(0)
  })

  it('reports the measured rate', () => {
    expect(fluencyScore(steady(20, 8)).phonemesPerSecond).toBeCloseTo(8, 1)
  })

  it('returns 0 when there is not enough to measure', () => {
    expect(fluencyScore([]).score).toBe(0)
    expect(fluencyScore(steady(1, 10)).score).toBe(0)
  })
})
