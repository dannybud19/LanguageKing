import { describe, expect, it } from 'vitest'
import { BLANK_TOKEN, decodeGreedy, toIpaString, vocabFromJson } from './ctc'

const VOCAB = [BLANK_TOKEN, '<s>', '</s>', '<unk>', 'm', 'a', 'ɾ', 'i']
const V = VOCAB.length

/** Build logits that make `ids[t]` the clear winner at frame t. */
function logitsFor(ids: number[], peak = 8): Float32Array {
  const out = new Float32Array(ids.length * V)
  ids.forEach((id, t) => {
    out[t * V + id] = peak
  })
  return out
}

const opts = { secondsPerFrame: 0.02 }

describe('decodeGreedy', () => {
  it('collapses repeated frames into one phoneme', () => {
    // m m m a a -> "m a"
    const r = decodeGreedy(logitsFor([4, 4, 4, 5, 5]), 5, V, VOCAB, opts)
    expect(r.map((p) => p.symbol)).toEqual(['m', 'a'])
  })

  it('drops blanks and other special tokens', () => {
    const r = decodeGreedy(logitsFor([0, 4, 0, 5, 1, 2, 3]), 7, V, VOCAB, opts)
    expect(r.map((p) => p.symbol)).toEqual(['m', 'a'])
  })

  it('keeps a repeated phoneme that is separated by a blank', () => {
    // This is the whole point of the CTC blank: "a <pad> a" is two sounds.
    const r = decodeGreedy(logitsFor([5, 0, 5]), 3, V, VOCAB, opts)
    expect(r.map((p) => p.symbol)).toEqual(['a', 'a'])
  })

  it('reports the time span each phoneme came from', () => {
    const r = decodeGreedy(logitsFor([4, 4, 5]), 3, V, VOCAB, opts)
    expect(r[0]).toMatchObject({ symbol: 'm', start: 0, end: 0.04 })
    expect(r[1]).toMatchObject({ symbol: 'a', start: 0.04, end: 0.06 })
  })

  it('spans are contiguous and ordered, so words can be located later', () => {
    const r = decodeGreedy(logitsFor([4, 4, 0, 5, 6, 6, 7]), 7, V, VOCAB, opts)
    for (let i = 1; i < r.length; i++) {
      expect(r[i].start).toBeGreaterThanOrEqual(r[i - 1].end)
      expect(r[i].end).toBeGreaterThan(r[i].start)
    }
  })

  it('reports high confidence for a decisive frame', () => {
    const r = decodeGreedy(logitsFor([4], 12), 1, V, VOCAB, opts)
    expect(r[0].confidence).toBeGreaterThan(0.99)
  })

  it('reports low confidence when the model is undecided', () => {
    // Two labels nearly tied: the winner should not look certain.
    const l = new Float32Array(V)
    l[4] = 1.0
    l[5] = 0.99
    const r = decodeGreedy(l, 1, V, VOCAB, opts)
    expect(r[0].confidence).toBeLessThan(0.4)
    expect(r[0].confidence).toBeGreaterThan(0.1)
  })

  it('averages confidence across the frames of one phoneme', () => {
    const l = new Float32Array(2 * V)
    l[4] = 12 // decisive, frame 0
    l[1 * V + 4] = 0.1 // barely ahead
    l[1 * V + 5] = 0.0
    const r = decodeGreedy(l, 2, V, VOCAB, opts)
    expect(r).toHaveLength(1)
    expect(r[0].confidence).toBeLessThan(1)
    expect(r[0].confidence).toBeGreaterThan(0.4)
  })

  it('offers runner-up labels, excluding special tokens', () => {
    const l = new Float32Array(V)
    l[4] = 3
    l[5] = 2.5
    l[0] = 2.9 // blank scores high but must not be offered as an alternate
    const r = decodeGreedy(l, 1, V, VOCAB, { ...opts, alternates: 2 })
    expect(r[0].alternates.length).toBeGreaterThan(0)
    expect(r[0].alternates.map((a) => a.symbol)).not.toContain(BLANK_TOKEN)
    expect(r[0].alternates[0].symbol).toBe('a')
  })

  it('returns nothing for all-blank audio', () => {
    expect(decodeGreedy(logitsFor([0, 0, 0]), 3, V, VOCAB, opts)).toEqual([])
  })
})

describe('vocabFromJson', () => {
  it('inverts a token -> id map into an id-indexed array', () => {
    expect(vocabFromJson({ '<pad>': 0, m: 1, a: 2 })).toEqual(['<pad>', 'm', 'a'])
  })

  it('places every symbol at its own id', () => {
    const map = { '<pad>': 0, '<s>': 1, x: 5, y: 2 }
    const v = vocabFromJson(map)
    expect(v).toHaveLength(6)
    expect(v[5]).toBe('x')
    expect(v[2]).toBe('y')
  })
})

describe('toIpaString', () => {
  it('renders phonemes space-separated', () => {
    const r = decodeGreedy(logitsFor([4, 5, 6, 7]), 4, V, VOCAB, opts)
    expect(toIpaString(r)).toBe('m a ɾ i')
  })

  it('renders an empty result as an empty string', () => {
    expect(toIpaString([])).toBe('')
  })
})
