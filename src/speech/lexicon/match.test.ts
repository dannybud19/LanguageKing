import { describe, expect, it } from 'vitest'
import { matchEntry } from './match'
import { entry, heard } from './testFixtures'

describe('matchEntry', () => {
  const mariposa = entry('mariposa', 'm a ɾ i p o s a')

  it('scores a perfect rendition at 1', () => {
    const r = matchEntry(heard('m a ɾ i p o s a', 1), mariposa)
    expect(r.score).toBeCloseTo(1, 5)
    expect(r.cost).toBeCloseTo(0, 5)
    expect(r.diffs.every((d) => d.kind === 'match')).toBe(true)
  })

  it('scores an accented rendition high but not perfect', () => {
    const r = matchEntry(heard('m ɐ ɹ ɪ p oʊ s ə'), mariposa)
    expect(r.score).toBeGreaterThan(0.8)
    expect(r.score).toBeLessThan(0.98)
  })

  it('flags the substituted sounds rather than smoothing them over', () => {
    const r = matchEntry(heard('m a ɹ i p o s a'), mariposa)
    const subs = r.diffs.filter((d) => d.kind === 'substitution')
    expect(subs).toHaveLength(1)
    expect(subs[0]).toMatchObject({ expected: 'ɾ', actual: 'ɹ' })
  })

  it('reports a dropped sound as a deletion', () => {
    const r = matchEntry(heard('m a ɾ i p o s'), mariposa)
    const dels = r.diffs.filter((d) => d.kind === 'deletion')
    expect(dels).toHaveLength(1)
    expect(dels[0].expected).toBe('a')
    expect(dels[0].actual).toBeNull()
  })

  it('reports an added sound as an insertion', () => {
    const r = matchEntry(heard('m a ɾ i p o s a s'), mariposa)
    const ins = r.diffs.filter((d) => d.kind === 'insertion')
    expect(ins).toHaveLength(1)
    expect(ins[0].actual).toBe('s')
    expect(ins[0].expected).toBeNull()
  })

  it('scores gibberish low', () => {
    const r = matchEntry(heard('k t ʃ x ŋ'), mariposa)
    expect(r.score).toBeLessThan(0.4)
  })

  describe('word splitting', () => {
    const sentence = entry('la mariposa vuela', 'l a | m a ɾ i p o s a | b w e l a')

    it('assigns each word its own score and time span', () => {
      const r = matchEntry(heard('l a m a ɾ i p o s a b w e l a', 1), sentence)
      expect(r.words.map((w) => w.word)).toEqual(['la', 'mariposa', 'vuela'])
      for (const w of r.words) expect(w.score).toBeGreaterThan(0.95)
      // Spans must be ordered and non-overlapping for the colouring to work.
      expect(r.words[0].end).toBeLessThanOrEqual(r.words[1].start)
      expect(r.words[1].end).toBeLessThanOrEqual(r.words[2].start)
    })

    it('drops the score of only the word that was mangled', () => {
      // "vuela" said badly; the first two words are untouched.
      const r = matchEntry(heard('l a m a ɾ i p o s a k x e l a', 1), sentence)
      const [la, mariposa2, vuela] = r.words
      expect(la.score).toBeGreaterThan(0.95)
      expect(mariposa2.score).toBeGreaterThan(0.95)
      expect(vuela.score).toBeLessThan(0.75)
      expect(vuela.score).toBeLessThan(mariposa2.score)
    })

    it('scores a word that was never said at zero', () => {
      const r = matchEntry(heard('m a ɾ i p o s a', 1), entry('la mariposa', 'l a | m a ɾ i p o s a'))
      expect(r.words[0].score).toBe(0)
      expect(r.words[1].score).toBeGreaterThan(0.9)
    })
  })

  it('lowers the per-word score when the sounds were produced unclearly', () => {
    const clear = matchEntry(heard('m a ɾ i p o s a', 1), mariposa)
    const mumbled = matchEntry(heard('m a ɾ i p o s a', 0.2), mariposa)
    expect(mumbled.words[0].score).toBeLessThan(clear.words[0].score)
    // The entry-level score stays confidence-free so that language
    // identification is not swayed by how quietly someone spoke.
    expect(mumbled.score).toBeCloseTo(clear.score, 10)
  })

  it('handles an empty utterance without throwing', () => {
    const r = matchEntry([], mariposa)
    expect(r.score).toBe(0)
    expect(r.words.every((w) => w.score === 0)).toBe(true)
  })
})
