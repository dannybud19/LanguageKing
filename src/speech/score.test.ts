import { describe, expect, it } from 'vitest'
import { curve, fluencyScore, meanConfidence, scoreUtterance, scoreWords } from './score'
import type { RecognizedPhoneme } from './types'

/** Evenly-paced phonemes at a fixed confidence. */
function evenly(symbols: string[], confidence = 0.9, durationS = 0.08): RecognizedPhoneme[] {
  return symbols.map((symbol, i) => ({
    symbol,
    start: i * durationS,
    end: (i + 1) * durationS,
    confidence,
    alternates: [],
  }))
}

describe('meanConfidence', () => {
  it('is zero for an empty utterance', () => {
    expect(meanConfidence([])).toBe(0)
  })

  it('weights longer sounds more heavily', () => {
    const phonemes: RecognizedPhoneme[] = [
      { symbol: 'a', start: 0, end: 0.4, confidence: 1, alternates: [] },
      { symbol: 't', start: 0.4, end: 0.42, confidence: 0, alternates: [] },
    ]
    // An unweighted mean would be 0.5; the long confident vowel should dominate.
    expect(meanConfidence(phonemes)).toBeGreaterThan(0.9)
  })
})

describe('curve', () => {
  it('clamps rather than returning out-of-range scores', () => {
    expect(curve(0)).toBe(0)
    expect(curve(1)).toBe(100)
    expect(curve(-5)).toBe(0)
    expect(curve(Number.NaN)).toBe(0)
  })

  it('separates confident speech from mumbling', () => {
    expect(curve(0.95)).toBeGreaterThan(curve(0.6))
  })
})

describe('fluencyScore', () => {
  it('rates even delivery above hesitant delivery', () => {
    const even = evenly(['m', 'a', 'ɾ', 'i', 'p', 'o', 's', 'a'])

    const hesitant = evenly(['m', 'a', 'ɾ', 'i', 'p', 'o', 's', 'a'])
    // Open a 600ms gap in the middle.
    for (let i = 4; i < hesitant.length; i++) {
      hesitant[i].start += 0.6
      hesitant[i].end += 0.6
    }

    expect(fluencyScore(even)).toBeGreaterThan(fluencyScore(hesitant))
  })

  it('declines to score an utterance too short to judge', () => {
    expect(fluencyScore(evenly(['a']))).toBe(0)
  })
})

describe('scoreUtterance', () => {
  it('never reports intonation, which the pipeline cannot measure', () => {
    expect(scoreUtterance(evenly(['a', 'b', 'c'])).intonation).toBeNull()
  })

  it('scores clear speech above unclear speech', () => {
    const clear = scoreUtterance(evenly(['m', 'a', 'ɾ', 'i'], 0.97))
    const unclear = scoreUtterance(evenly(['m', 'a', 'ɾ', 'i'], 0.45))
    expect(clear.overall).toBeGreaterThan(unclear.overall)
  })

  it('applies strictness as an offset in the expected direction', () => {
    const phonemes = evenly(['m', 'a', 'ɾ', 'i'], 0.8)
    expect(scoreUtterance(phonemes, 'strict').overall).toBeLessThan(
      scoreUtterance(phonemes, 'lenient').overall,
    )
  })

  it('keeps scores in range even at the extremes', () => {
    const perfect = scoreUtterance(evenly(['a', 'b', 'c'], 1), 'lenient')
    expect(perfect.overall).toBeLessThanOrEqual(100)
    const silent = scoreUtterance(evenly(['a', 'b', 'c'], 0), 'strict')
    expect(silent.overall).toBeGreaterThanOrEqual(0)
  })
})

describe('scoreWords', () => {
  const phonemes = evenly(['m', 'a', 'ɾ', 'i', 'p', 'o', 's', 'a'])

  it('returns nothing when there is nothing to align', () => {
    expect(scoreWords([], phonemes)).toEqual([])
    expect(scoreWords([{ word: 'hola', ipa: 'o l a' }], [])).toEqual([])
  })

  it('aligns exactly when the token counts match', () => {
    const scored = scoreWords(
      [
        { word: 'mari', ipa: 'm a ɾ i' },
        { word: 'posa', ipa: 'p o s a' },
      ],
      phonemes,
    )
    expect(scored).toHaveLength(2)
    expect(scored.map((w) => w.word)).toEqual(['mari', 'posa'])
    expect(scored.every((w) => w.score > 0)).toBe(true)
  })

  it('scores the word containing the unclear sounds lower', () => {
    const mixed = evenly(['m', 'a', 'ɾ', 'i', 'p', 'o', 's', 'a'])
    for (let i = 4; i < mixed.length; i++) mixed[i].confidence = 0.4

    const scored = scoreWords(
      [
        { word: 'mari', ipa: 'm a ɾ i' },
        { word: 'posa', ipa: 'p o s a' },
      ],
      mixed,
    )
    expect(scored[0].score).toBeGreaterThan(scored[1].score)
    expect(scored[1].status).not.toBe('perfect')
  })

  it('still covers every phoneme when the model returns a mismatched split', () => {
    // A local model dropping tokens must not silently drop audio from scoring.
    const scored = scoreWords(
      [
        { word: 'mari', ipa: 'm a' },
        { word: 'posa', ipa: 'p o' },
      ],
      phonemes,
    )
    expect(scored).toHaveLength(2)
    expect(scored.every((w) => w.score > 0)).toBe(true)
  })

  it('carries the model note through as the learner-facing tip', () => {
    const scored = scoreWords(
      [{ word: 'gracias', ipa: 'ɡ ɾ a s j a s', note: 'Said with [s] where [θ] was expected.' }],
      evenly(['ɡ', 'ɾ', 'a', 's', 'j', 'a', 's']),
    )
    expect(scored[0].tip).toBe('Said with [s] where [θ] was expected.')
  })
})
