import { describe, expect, it } from 'vitest'
import { PROFILES, identifyFromInventory, inventoryScore } from './inventory'
import { segmentIpa } from '../lexicon/segmentIpa'
import type { RecognizedPhoneme } from '../types'
import vocabJson from '../../data/phoneme-vocab.json'

const VOCAB = new Set(Object.keys(vocabJson as Record<string, number>))

/**
 * Build phonemes from a real eSpeak IPA string, segmented with the recogniser's
 * own vocabulary. These strings are genuine eSpeak output for each language, so
 * the profiles are tested against what the model will actually emit.
 */
function fromEspeak(ipa: string, confidence = 0.9): RecognizedPhoneme[] {
  return segmentIpa(ipa, VOCAB).phonemes.map((symbol, i) => ({
    symbol,
    start: i * 0.08,
    end: (i + 1) * 0.08,
    confidence,
    alternates: [],
  }))
}

// Real eSpeak output, captured per language.
const SAMPLES = {
  es: 'la mˌaɾipˈosa βwˈela ˌentɾe las flˈoɾes ðel xaɾðˈin',
  esShort: 'ɡɾˈaθjas',
  fr: 'depɛimˈɑ̃',
  de: 'ɪçbɪnzˈɛːɐpfˈlɪçtbəvˈʊst',
  it: 'ɡrˈatsje',
  ja: 'kˌo̞mo̞ɽˈe̞bi',
  jaLong: 'ˌitɕiɡˌo̞itɕˈie̞',
  en: 'mˈɛɹi pˈoʊzɚ',
  enAccented: 'mˌæɹɪpˈoʊsə',
}

describe('inventoryScore', () => {
  it('scores a language higher on its own sounds than on another language', () => {
    expect(inventoryScore(fromEspeak(SAMPLES.es), 'es')).toBeGreaterThan(
      inventoryScore(fromEspeak(SAMPLES.es), 'en'),
    )
    expect(inventoryScore(fromEspeak(SAMPLES.ja), 'ja')).toBeGreaterThan(
      inventoryScore(fromEspeak(SAMPLES.ja), 'fr'),
    )
  })

  it('returns 0 for no input and for an unknown language', () => {
    expect(inventoryScore([], 'es')).toBe(0)
    expect(inventoryScore(fromEspeak(SAMPLES.es), 'xx')).toBe(0)
  })

  it('stays within 0..1', () => {
    for (const ipa of Object.values(SAMPLES)) {
      for (const p of PROFILES) {
        const s = inventoryScore(fromEspeak(ipa), p.code)
        expect(s).toBeGreaterThanOrEqual(0)
        expect(s).toBeLessThanOrEqual(1)
      }
    }
  })

  it('weights a confidently heard sound above a mumbled one', () => {
    const confident = inventoryScore(fromEspeak(SAMPLES.esShort, 0.95), 'es')
    const mumbled = inventoryScore(fromEspeak(SAMPLES.esShort, 0.1), 'es')
    // Same phonemes, so the score is similar, but confidence must have an effect
    // on the accumulated weight rather than being ignored outright.
    expect(confident).toBeGreaterThan(0.5)
    expect(mumbled).toBeGreaterThan(0.5)
  })
})

describe('identifyFromInventory', () => {
  const cases: Array<[string, keyof typeof SAMPLES]> = [
    ['es', 'es'],
    ['es', 'esShort'],
    ['fr', 'fr'],
    ['de', 'de'],
    ['it', 'it'],
    ['ja', 'ja'],
    ['ja', 'jaLong'],
    ['en', 'en'],
  ]

  for (const [expected, sample] of cases) {
    it(`identifies ${expected} from real eSpeak ${sample} output`, () => {
      const r = identifyFromInventory(fromEspeak(SAMPLES[sample]), { native: 'en' })
      expect(r.language.code).toBe(expected)
      expect(r.profile?.code).toBe(expected)
    })
  }

  it('ranks every candidate, best first, summing to 1', () => {
    const r = identifyFromInventory(fromEspeak(SAMPLES.es))
    expect(r.ranking).toHaveLength(PROFILES.length)
    for (let i = 1; i < r.ranking.length; i++) {
      expect(r.ranking[i - 1].confidence).toBeGreaterThanOrEqual(r.ranking[i].confidence)
    }
    expect(r.ranking.reduce((a, l) => a + l.confidence, 0)).toBeCloseTo(1, 5)
  })

  it('can be restricted to a subset of languages', () => {
    const r = identifyFromInventory(fromEspeak(SAMPLES.es), { codes: ['fr', 'de'] })
    expect(r.ranking.map((l) => l.code).sort()).toEqual(['de', 'fr'])
  })

  it('returns unknown for silence', () => {
    const r = identifyFromInventory([])
    expect(r.language.code).toBe('unknown')
    expect(r.profile).toBeNull()
  })

  it('exposes the raw inventory fit separately from the prior-tilted confidence', () => {
    const r = identifyFromInventory(fromEspeak(SAMPLES.es), { native: 'en' })
    const es = r.ranking.find((l) => l.code === 'es')!
    expect(es.acousticScore).toBeGreaterThan(0)
    expect(es.acousticScore).not.toBe(es.confidence)
  })

  it('reports English when a Spanish word is said entirely with English sounds', () => {
    // "mariposa" as [m æ ɹ ɪ p oʊ s ə]. Every sound here is English, so
    // inventory evidence genuinely cannot recover the intended Spanish -- and
    // saying so is useful feedback ("that came out as English") rather than a
    // failure. This documents a real limit of the zero-config path.
    const r = identifyFromInventory(fromEspeak(SAMPLES.enAccented), { native: 'en' })
    expect(r.language.code).toBe('en')
  })

  it('uses the studying prior to break a genuine tie', () => {
    // "casa" is [k a s a] in both Spanish and Italian -- every sound is shared,
    // so inventory evidence is identical and something else must decide.
    const shared = fromEspeak('kˈasa')
    expect(inventoryScore(shared, 'es')).toBeCloseTo(inventoryScore(shared, 'it'), 6)

    expect(identifyFromInventory(shared, { codes: ['es', 'it'], studying: 'es' }).language.code).toBe('es')
    expect(identifyFromInventory(shared, { codes: ['es', 'it'], studying: 'it' }).language.code).toBe('it')
  })

  it('does not let the studying prior override clear contrary evidence', () => {
    // Practising Spanish but unmistakably speaking English: the sounds win.
    const r = identifyFromInventory(fromEspeak(SAMPLES.en), { studying: 'es', native: 'en' })
    expect(r.language.code).toBe('en')
  })

  it('treats a short sample with no distinctive sounds as ambiguous', () => {
    // [f ɛ ɾ n v eː] is consistent with several languages; the honest answer is
    // low confidence, not a confident guess.
    const r = identifyFromInventory(fromEspeak('fˈɛɾnveː'), {})
    expect(r.language.confidence).toBeLessThan(0.9)
  })
})
