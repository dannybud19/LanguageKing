import { describe, expect, it } from 'vitest'
import { identifyLanguage } from './languageId'
import { LEXICON, heard } from './testFixtures'

describe('identifyLanguage', () => {
  it('identifies a well-pronounced word', () => {
    const r = identifyLanguage(heard('m a ɾ i p o s a'), LEXICON, { studying: 'es', native: 'en' })
    expect(r.language.code).toBe('es')
    expect(r.best?.entry.text).toBe('mariposa')
    expect(r.language.acousticScore).toBeCloseTo(1, 5)
  })

  it('still reaches Spanish through a thick English accent', () => {
    // The case the whole design exists for. Acoustically this is an English
    // speaker, and a conventional language-ID-then-transcribe pipeline would
    // label it English and return nonsense.
    const r = identifyLanguage(heard('m ɐ ɹ ɪ p oʊ s ə'), LEXICON, {
      studying: 'es',
      native: 'en',
    })
    expect(r.language.code).toBe('es')
    expect(r.best?.entry.text).toBe('mariposa')
  })

  it('ranks the native language highly on a heavily accented attempt', () => {
    // English should be a close runner-up rather than being discarded -- that
    // is what lets the app say "that came out as English".
    const r = identifyLanguage(heard('m ɐ ɹ ɪ p oʊ s ə'), LEXICON, {
      studying: 'es',
      native: 'en',
    })
    const en = r.ranking.find((l) => l.code === 'en')
    expect(en).toBeDefined()
    expect(r.ranking.indexOf(en!)).toBeLessThanOrEqual(1)
    expect(r.ambiguous).toBe(true)
  })

  it('does not let the study prior override a clear acoustic result', () => {
    // Unmistakably English, while supposedly studying Spanish.
    const r = identifyLanguage(heard('θ æ ŋ k j u'), LEXICON, { studying: 'es', native: 'en' })
    expect(r.language.code).toBe('en')
    expect(r.best?.entry.text).toBe('thank you')
  })

  it('distinguishes Spanish from Italian on the same spelling', () => {
    // "mariposa" exists in both fixtures; only the sounds can separate them.
    const es = identifyLanguage(heard('m a ɾ i p o s a'), LEXICON, { native: 'en' })
    expect(es.language.code).toBe('es')
    const it = identifyLanguage(heard('m a r i p ɔ z a'), LEXICON, { native: 'en' })
    expect(it.language.code).toBe('it')
  })

  it('flags a near-tie rather than sounding certain', () => {
    // Halfway between the Spanish and Italian renditions.
    const r = identifyLanguage(heard('m a ɾ i p ɔ z a'), LEXICON, { native: 'en' })
    expect(['es', 'it']).toContain(r.language.code)
    expect(r.ambiguous).toBe(true)
    expect(r.ranking.slice(0, 2).map((l) => l.code).sort()).toEqual(['es', 'it'])
  })

  it('declines to guess on gibberish instead of returning a confident wrong answer', () => {
    const r = identifyLanguage(heard('x ʈ ʘ ŋ ʐ ħ'), LEXICON, { studying: 'es', native: 'en' })
    expect(r.language.code).toBe('unknown')
    expect(r.best).toBeNull()
  })

  it('returns unknown for silence', () => {
    const r = identifyLanguage([], LEXICON, { studying: 'es', native: 'en' })
    expect(r.language.code).toBe('unknown')
    expect(r.ranking).toHaveLength(0)
    expect(r.best).toBeNull()
  })

  it('reports every candidate language, best first', () => {
    const r = identifyLanguage(heard('m a ɾ i p o s a'), LEXICON, { studying: 'es' })
    expect(r.ranking.map((l) => l.code).sort()).toEqual(['en', 'es', 'it'])
    for (let i = 1; i < r.ranking.length; i++) {
      expect(r.ranking[i - 1].confidence).toBeGreaterThanOrEqual(r.ranking[i].confidence)
    }
    expect(r.ranking.reduce((a, l) => a + l.confidence, 0)).toBeCloseTo(1, 5)
  })

  it('separates the acoustic fit from the prior-tilted confidence', () => {
    // Without this split you cannot tell "it fitted well" from "it was expected".
    const withPrior = identifyLanguage(heard('m ɐ ɹ ɪ p oʊ s ə'), LEXICON, { studying: 'es' })
    const without = identifyLanguage(heard('m ɐ ɹ ɪ p oʊ s ə'), LEXICON, {})
    const a = withPrior.ranking.find((l) => l.code === 'es')!
    const b = without.ranking.find((l) => l.code === 'es')!
    expect(a.acousticScore).toBeCloseTo(b.acousticScore, 10)
    expect(a.confidence).toBeGreaterThan(b.confidence)
  })

  it('picks the sentence entry when a sentence was spoken', () => {
    const r = identifyLanguage(heard('l a m a ɾ i p o s a b w e l a'), LEXICON, { studying: 'es' })
    expect(r.language.code).toBe('es')
    expect(r.best?.entry.text).toBe('la mariposa vuela')
    expect(r.best?.match.words.map((w) => w.word)).toEqual(['la', 'mariposa', 'vuela'])
  })
})
