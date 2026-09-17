import { describe, expect, it } from 'vitest'
import { segmentIpa, segmentPhrase } from './segmentIpa'
import vocabJson from '../../data/phoneme-vocab.json'

/** The real recogniser vocabulary -- segmentation is only correct against it. */
const VOCAB = new Set(Object.keys(vocabJson as Record<string, number>))

describe('segmentIpa', () => {
  it('keeps multi-character symbols intact', () => {
    // Splitting these per character would yield tokens the model never emits.
    expect(segmentIpa('tʃ', VOCAB).phonemes).toEqual(['tʃ'])
    expect(segmentIpa('oʊ', VOCAB).phonemes).toEqual(['oʊ'])
    expect(segmentIpa('dʒ', VOCAB).phonemes).toEqual(['dʒ'])
  })

  it('prefers the longest match', () => {
    const r = segmentIpa('ɑːɹ', VOCAB)
    expect(r.phonemes).toEqual(['ɑːɹ'])
  })

  it('strips stress marks, which are not in the vocabulary', () => {
    const withStress = segmentIpa('mˌaɾipˈosa', VOCAB)
    const without = segmentIpa('maɾiposa', VOCAB)
    expect(withStress.phonemes).toEqual(without.phonemes)
    expect(withStress.unmatched).toEqual([])
  })

  it('segments real Spanish output from eSpeak', () => {
    const r = segmentIpa('mˌaɾipˈosa', VOCAB)
    expect(r.phonemes).toEqual(['m', 'a', 'ɾ', 'i', 'p', 'o', 's', 'a'])
    expect(r.unmatched).toEqual([])
  })

  it('segments real English output from eSpeak', () => {
    const r = segmentIpa('mˌæɹɪpˈoʊsə', VOCAB)
    expect(r.phonemes).toEqual(['m', 'æ', 'ɹ', 'ɪ', 'p', 'oʊ', 's', 'ə'])
    expect(r.unmatched).toEqual([])
  })

  it('segments real Japanese output, including lowered vowels', () => {
    const r = segmentIpa('kˌo̞mo̞ɽˈe̞bi', VOCAB)
    expect(r.unmatched).toEqual([])
    expect(r.phonemes[0]).toBe('k')
    expect(r.phonemes).toContain('ɽ')
    expect(r.phonemes).toHaveLength(8)
  })

  it('segments real Italian and French output', () => {
    expect(segmentIpa('ɡrˈatsje', VOCAB).unmatched).toEqual([])
    expect(segmentIpa('depɛimˈɑ̃', VOCAB).unmatched).toEqual([])
  })

  it('falls back to the plain form when a diacritic is unknown', () => {
    // [ä] is a centralised [a]; if the vocabulary lacks it we want [a], not a hole.
    const r = segmentIpa('kˌäũpˈäi', VOCAB)
    expect(r.unmatched).toEqual([])
    expect(r.phonemes.length).toBeGreaterThan(4)
  })

  it('reports genuinely unknown characters rather than silently dropping them', () => {
    const r = segmentIpa('m§a', VOCAB)
    expect(r.phonemes).toEqual(['m', 'a'])
    expect(r.unmatched).toEqual(['§'])
  })

  it('handles an empty string', () => {
    expect(segmentIpa('', VOCAB)).toEqual({ phonemes: [], unmatched: [] })
  })

  it('never emits a token outside the vocabulary', () => {
    for (const ipa of ['mˌaɾipˈosa', 'ɡɾˈaθjas', 'fˈɛɾnveː', 'mˈɛɹi pˈoʊzɚ', 'ˌitɕiɡˌo̞itɕˈie̞']) {
      for (const p of segmentIpa(ipa, VOCAB).phonemes) {
        expect(VOCAB.has(p)).toBe(true)
      }
    }
  })
})

describe('segmentPhrase', () => {
  it('records where each word starts', () => {
    const r = segmentPhrase(['la', 'mˌaɾipˈosa'], VOCAB)
    expect(r.wordStarts).toEqual([0, 2])
    expect(r.phonemes.slice(0, 2)).toEqual(['l', 'a'])
  })

  it('starts the first word at zero even when it is empty', () => {
    expect(segmentPhrase(['', 'la'], VOCAB).wordStarts).toEqual([0, 0])
  })

  it('collects unmatched characters from every word', () => {
    expect(segmentPhrase(['m§', 'a¤'], VOCAB).unmatched).toEqual(['§', '¤'])
  })
})
