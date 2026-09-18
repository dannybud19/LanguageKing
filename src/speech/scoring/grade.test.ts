import { describe, expect, it } from 'vitest'
import { gradeFor, gradeUtterance, percent } from './grade'
import type { RecognizedPhoneme } from '../types'

/** Evenly-paced phonemes, which read as fluent. */
function evenly(count: number, durationS = 0.08): RecognizedPhoneme[] {
  return Array.from({ length: count }, (_, i) => ({
    symbol: 'a',
    start: i * durationS,
    end: (i + 1) * durationS,
    confidence: 0.9,
    alternates: [],
  }))
}

describe('percent', () => {
  it('clamps rather than returning out-of-range values', () => {
    expect(percent(-1)).toBe(0)
    expect(percent(2)).toBe(100)
    expect(percent(Number.NaN)).toBe(0)
  })
})

describe('gradeFor', () => {
  it('bands the whole range without gaps', () => {
    expect(gradeFor(100)).toContain('A+')
    expect(gradeFor(92)).toContain('A ')
    expect(gradeFor(83)).toContain('B+')
    expect(gradeFor(74)).toContain('B ')
    expect(gradeFor(64)).toContain('C')
    expect(gradeFor(10)).toContain('D')
  })
})

describe('gradeUtterance', () => {
  const phonemes = evenly(12)

  it('never reports intonation, which the pipeline cannot measure', () => {
    expect(gradeUtterance(0.9, phonemes).intonation).toBeNull()
  })

  it('scores clear articulation above unclear articulation', () => {
    expect(gradeUtterance(0.95, phonemes).overall).toBeGreaterThan(
      gradeUtterance(0.4, phonemes).overall,
    )
  })

  it('applies strictness in the expected direction', () => {
    expect(gradeUtterance(0.8, phonemes, 'strict').overall).toBeLessThan(
      gradeUtterance(0.8, phonemes, 'lenient').overall,
    )
  })

  it('keeps strictness to a shading rather than a two-band swing', () => {
    const lenient = gradeUtterance(0.8, phonemes, 'lenient').overall
    const strict = gradeUtterance(0.8, phonemes, 'strict').overall
    expect(lenient - strict).toBeLessThanOrEqual(10)
  })

  it('stays in range at the extremes', () => {
    expect(gradeUtterance(1, phonemes, 'lenient').overall).toBeLessThanOrEqual(100)
    expect(gradeUtterance(0, phonemes, 'strict').overall).toBeGreaterThanOrEqual(0)
  })

  it('reports pauses so the fallback feedback can cite them', () => {
    const hesitant = evenly(12)
    for (let i = 6; i < hesitant.length; i++) {
      hesitant[i].start += 0.8
      hesitant[i].end += 0.8
    }
    expect(gradeUtterance(0.9, hesitant).pauses.count).toBeGreaterThan(0)
  })

  it('rates even delivery as more fluent than hesitant delivery', () => {
    const hesitant = evenly(12)
    for (let i = 6; i < hesitant.length; i++) {
      hesitant[i].start += 0.8
      hesitant[i].end += 0.8
    }
    expect(gradeUtterance(0.9, phonemes).fluency).toBeGreaterThan(
      gradeUtterance(0.9, hesitant).fluency,
    )
  })
})
