import { describe, expect, it } from 'vitest'
import { gapCost, substitutionCost } from './distance'
import { isVowel, parsePhoneme } from './ipaFeatures'

describe('substitutionCost', () => {
  it('costs nothing to leave a sound unchanged', () => {
    for (const p of ['m', 'a', 'ɾ', 'θ', 'oʊ', 'ʃ']) {
      expect(substitutionCost(p, p)).toBe(0)
    }
  })

  it('treats a near-miss as much cheaper than nonsense', () => {
    // The motivating case: saying [s] for [θ] is a lisp, saying [k] is not a
    // pronunciation error at all -- it is a different word.
    const near = substitutionCost('θ', 's')
    const far = substitutionCost('θ', 'k')
    expect(near).toBeLessThan(far)
    expect(near).toBeLessThan(0.15)
    expect(far).toBeGreaterThan(0.25)
  })

  it('charges for voicing alone, but only a little', () => {
    const voicing = substitutionCost('s', 'z')
    expect(voicing).toBeGreaterThan(0)
    expect(voicing).toBeLessThan(substitutionCost('s', 'k'))
  })

  it('separates the Spanish tap from the English approximant', () => {
    // If this costs nothing, the single most common English-accent error in
    // Spanish is invisible to the scorer.
    const cost = substitutionCost('ɾ', 'ɹ')
    expect(cost).toBeGreaterThan(0)
    expect(cost).toBeLessThan(substitutionCost('ɾ', 'k'))
  })

  it('notices a monophthong said as a diphthong', () => {
    const cost = substitutionCost('o', 'oʊ')
    expect(cost).toBeGreaterThan(0)
    // Real, but far smaller than saying an unrelated vowel.
    expect(cost).toBeLessThan(substitutionCost('o', 'i'))
  })

  it('never treats a vowel and a consonant as close', () => {
    expect(substitutionCost('a', 'k')).toBeGreaterThan(0.7)
    expect(substitutionCost('i', 's')).toBeGreaterThan(0.7)
  })

  it('scores vowel distance by height and backness', () => {
    // [i] and [ɪ] are neighbours; [i] and [ɑ] are opposite corners.
    expect(substitutionCost('i', 'ɪ')).toBeLessThan(substitutionCost('i', 'ɑ'))
  })

  it('gives an unknown symbol a middling cost rather than 0 or 1', () => {
    const cost = substitutionCost('ʘ͡ʬ', 's')
    expect(cost).toBeGreaterThan(0.2)
    expect(cost).toBeLessThan(0.8)
  })

  it('is symmetric', () => {
    for (const [a, b] of [['θ', 's'], ['a', 'i'], ['k', 'm'], ['ɾ', 'ɹ']]) {
      expect(substitutionCost(a, b)).toBeCloseTo(substitutionCost(b, a), 10)
    }
  })
})

describe('gapCost', () => {
  it('penalises dropping a vowel more than a consonant', () => {
    expect(gapCost('a')).toBeGreaterThan(gapCost('t'))
  })

  it('stays below the cost of a vowel/consonant swap', () => {
    // Otherwise the aligner invents a nonsense substitution rather than
    // admitting a sound was dropped.
    expect(gapCost('a')).toBeLessThan(substitutionCost('a', 'k'))
  })
})

describe('parsePhoneme', () => {
  it('reads length, nasalisation and palatalisation as modifiers', () => {
    expect(parsePhoneme('aː').features.long).toBe(1)
    expect(parsePhoneme('ã').features.nasalized).toBe(1)
    expect(parsePhoneme('sʲ').features.place).toBeGreaterThan(parsePhoneme('s').features.place)
  })

  it('strips tone digits rather than failing on them', () => {
    expect(parsePhoneme('a5').unknown).toBe(false)
    expect(parsePhoneme('a5').features.height).toBe(parsePhoneme('a').features.height)
  })

  it('reads an affricate as a strident stop', () => {
    const f = parsePhoneme('tʃ').features
    expect(f.syllabic).toBe(0)
    expect(f.strident).toBe(1)
    expect(f.continuant).toBe(0)
  })

  it('carries the offglide of a diphthong', () => {
    const f = parsePhoneme('oʊ').features
    expect(f.hasGlide).toBe(1)
    expect(parsePhoneme('o').features.hasGlide).toBe(0)
  })

  it('ignores stress marks', () => {
    expect(parsePhoneme('ˈa').features.height).toBe(parsePhoneme('a').features.height)
  })

  it('classifies vowels and consonants', () => {
    expect(isVowel('a')).toBe(true)
    expect(isVowel('ɔɪ')).toBe(true)
    expect(isVowel('s')).toBe(false)
  })
})
