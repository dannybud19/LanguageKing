import { describe, expect, it } from 'vitest'
import { decideLanguage } from './decide'
import type { IdentifyResult } from './inventory'
import type { GemmaDetection } from '../llm/languageDetector'
import type { LanguageGuess } from '../types'

const NAMES: Record<string, string> = {
  en: 'English', es: 'Spanish', fr: 'French', de: 'German', it: 'Italian', ja: 'Japanese', pt: 'Portuguese',
}

function gemma(...ranking: Array<[string, number]>): GemmaDetection {
  return {
    ranking: ranking.map(([code, probability]) => ({ code, name: NAMES[code], probability })),
    answer: NAMES[ranking[0][0]],
    latencyMs: 400,
  }
}

function inventory(...ranking: Array<[string, number]>): IdentifyResult {
  const guesses: LanguageGuess[] = ranking.map(([code, confidence]) => ({
    code, name: NAMES[code], confidence, acousticScore: confidence,
  }))
  return { language: guesses[0], ranking: guesses, ambiguous: false, profile: null }
}

const FLAT = inventory(['es', 0.2], ['it', 0.2], ['fr', 0.2], ['de', 0.2], ['en', 0.2])

describe('decideLanguage', () => {
  it('uses the phoneme inventory when Gemma did not answer', () => {
    const inv = inventory(['it', 0.8], ['es', 0.2])
    const decided = decideLanguage(null, inv)
    expect(decided.source).toBe('phonemes')
    expect(decided.language.code).toBe('it')
  })

  it('trusts a confident Gemma over the inventory', () => {
    // Beginner Italian with few Italian marker sounds: the inventory leans
    // Spanish, but Gemma heard the words.
    const decided = decideLanguage(gemma(['it', 0.97], ['en', 0.01]), inventory(['es', 0.7], ['it', 0.3]))
    expect(decided).toMatchObject({ source: 'gemma', ambiguous: false })
    expect(decided.language.code).toBe('it')
    expect(decided.profile?.whisperName).toBe('italian')
  })

  it('names languages that have no phoneme profile', () => {
    const decided = decideLanguage(gemma(['pt', 0.99]), FLAT)
    expect(decided.language.code).toBe('pt')
    expect(decided.profile?.whisperName).toBe('portuguese')
  })

  it('does not tell an accented learner their German was English', () => {
    // Measured: an English voice reading German came back English 0.61,
    // French 0.15, German 0.13.
    const decided = decideLanguage(
      gemma(['en', 0.61], ['fr', 0.15], ['de', 0.13]),
      inventory(['de', 0.5], ['fr', 0.2], ['en', 0.3]),
    )
    expect(decided.language.code).toBe('de')
    expect(decided.ambiguous).toBe(true)
  })

  it('still answers English when English is near-certain', () => {
    const decided = decideLanguage(gemma(['en', 0.995], ['fr', 0.002]), FLAT)
    expect(decided.language.code).toBe('en')
    expect(decided.ambiguous).toBe(false)
  })

  it('reports a close call as ambiguous', () => {
    const decided = decideLanguage(gemma(['es', 0.46], ['pt', 0.34]), FLAT)
    expect(decided.language.code).toBe('es')
    expect(decided.ambiguous).toBe(true)
    expect(decided.ranking[1].code).toBe('pt')
  })

  it('lets the inventory break a tie Gemma could not', () => {
    const decided = decideLanguage(gemma(['es', 0.42], ['it', 0.4]), inventory(['it', 0.9], ['es', 0.1]))
    expect(decided.language.code).toBe('it')
    expect(decided.ambiguous).toBe(true)
  })

  it('respects a different native language', () => {
    const decided = decideLanguage(gemma(['es', 0.6], ['en', 0.3]), FLAT, { native: 'es' })
    expect(decided.language.code).toBe('en')
  })
})
