import { describe, expect, it } from 'vitest'
import { overallScore, scoreWords, statusFor, THRESHOLDS } from './wordClarity'
import type { RecognizedPhoneme } from '../types'

function phoneme(symbol: string, start: number, end: number, confidence: number): RecognizedPhoneme {
  return { symbol, start, end, confidence, alternates: [] }
}

describe('statusFor', () => {
  it('maps scores onto the three badge colours', () => {
    expect(statusFor(0.95)).toBe('perfect')
    expect(statusFor(THRESHOLDS.perfect)).toBe('perfect')
    expect(statusFor(0.7)).toBe('good')
    expect(statusFor(THRESHOLDS.good)).toBe('good')
    expect(statusFor(0.4)).toBe('imperfect')
    expect(statusFor(0)).toBe('imperfect')
  })
})

describe('scoreWords', () => {
  const words = [
    { word: 'hola', start: 0, end: 0.5 },
    { word: 'mundo', start: 0.5, end: 1.0 },
  ]

  it('attributes phonemes to words by time overlap', () => {
    const phonemes = [
      phoneme('o', 0.0, 0.2, 0.9),
      phoneme('l', 0.2, 0.35, 0.9),
      phoneme('a', 0.35, 0.5, 0.9),
      phoneme('m', 0.5, 0.65, 0.4),
      phoneme('u', 0.65, 0.8, 0.4),
      phoneme('n', 0.8, 1.0, 0.4),
    ]
    const scored = scoreWords(words, phonemes)
    expect(scored[0].phonemes).toEqual(['o', 'l', 'a'])
    expect(scored[1].phonemes).toEqual(['m', 'u', 'n'])
    expect(scored[0].score).toBeGreaterThan(scored[1].score)
    expect(scored[0].status).toBe('perfect')
    expect(scored[1].status).toBe('imperfect')
  })

  it('weights a long sound more than a brief one', () => {
    // A long low-confidence vowel should drag the word down further than a
    // fleeting low-confidence consonant would.
    const longBad = scoreWords([{ word: 'a', start: 0, end: 1 }], [
      phoneme('a', 0, 0.9, 0.2),
      phoneme('t', 0.9, 1.0, 1.0),
    ])
    const shortBad = scoreWords([{ word: 'a', start: 0, end: 1 }], [
      phoneme('a', 0, 0.9, 1.0),
      phoneme('t', 0.9, 1.0, 0.2),
    ])
    expect(longBad[0].score).toBeLessThan(shortBad[0].score)
  })

  it('identifies the weakest sound, which is what a tip should target', () => {
    const scored = scoreWords([{ word: 'pero', start: 0, end: 0.4 }], [
      phoneme('p', 0.0, 0.1, 0.95),
      phoneme('e', 0.1, 0.2, 0.9),
      phoneme('ɾ', 0.2, 0.3, 0.25),
      phoneme('o', 0.3, 0.4, 0.92),
    ])
    expect(scored[0].weakest?.symbol).toBe('ɾ')
  })

  it('counts a phoneme that straddles a word boundary for both words', () => {
    // Phoneme and word boundaries never line up exactly, so partial overlap
    // must still attribute rather than dropping the sound.
    const scored = scoreWords(words, [phoneme('a', 0.45, 0.55, 0.8)])
    expect(scored[0].phonemes).toEqual(['a'])
    expect(scored[1].phonemes).toEqual(['a'])
  })

  it('does not invent a grade for a word with no phonemes in its span', () => {
    const scored = scoreWords(words, [phoneme('o', 0.0, 0.4, 0.9)])
    expect(scored[1].phonemes).toEqual([])
    expect(scored[1].score).toBe(0)
    expect(scored[1].weakest).toBeNull()
  })

  it('returns nothing for no words', () => {
    expect(scoreWords([], [phoneme('a', 0, 1, 0.9)])).toEqual([])
  })
})

describe('overallScore', () => {
  it('is the duration-weighted mean of the scored words', () => {
    const scored = scoreWords(
      [
        { word: 'long', start: 0, end: 0.9 },
        { word: 'short', start: 0.9, end: 1.0 },
      ],
      [phoneme('a', 0, 0.9, 0.9), phoneme('t', 0.9, 1.0, 0.1)],
    )
    // Dominated by the long word rather than a flat average of 0.5.
    expect(overallScore(scored)).toBeGreaterThan(0.7)
  })

  it('ignores words that had no phonemes rather than scoring them zero', () => {
    const scored = scoreWords(
      [
        { word: 'said', start: 0, end: 0.5 },
        { word: 'missing', start: 0.5, end: 1.0 },
      ],
      [phoneme('a', 0, 0.5, 0.9)],
    )
    expect(overallScore(scored)).toBeCloseTo(0.9, 5)
  })

  it('is 0 when nothing was scored', () => {
    expect(overallScore([])).toBe(0)
  })
})
