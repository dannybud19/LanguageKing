import { afterEach, describe, expect, it, vi } from 'vitest'
import { connectLocalModel, formatCoachPrompt, parseCoaching, pickModel } from './localInterpreter'
import type { ClarityScoredWord } from '../scoring/wordClarity'

const WORDS: ClarityScoredWord[] = [
  {
    word: 'la',
    start: 0,
    end: 0.2,
    score: 0.94,
    status: 'perfect',
    phonemes: ['l', 'a'],
    weakest: null,
  },
  {
    word: 'mariposa',
    start: 0.2,
    end: 1.1,
    score: 0.54,
    status: 'imperfect',
    phonemes: ['m', 'a', 'ɾ', 'i', 'p', 'o', 's', 'a'],
    weakest: { symbol: 'ɾ', confidence: 0.31 },
  },
]

const VALID = JSON.stringify({
  translation: 'the butterfly',
  notes: [{ word: 'mariposa', note: 'The r came out like an English r — try a quick single tap.' }],
  summary: 'Close — the tap is the one sound to work on.',
})

describe('formatCoachPrompt', () => {
  const prompt = formatCoachPrompt({
    transcript: 'la mariposa',
    heard: 'l a m a ɹ i p o s a',
    language: 'Spanish',
    words: WORDS,
  })

  it('gives the model the transcript and the uncorrected IPA', () => {
    expect(prompt).toContain('transcript: "la mariposa"')
    expect(prompt).toContain('l a m a ɹ i p o s a')
  })

  it('passes the already-measured clarity through as whole percentages', () => {
    expect(prompt).toContain('clarity: 94')
    expect(prompt).toContain('clarity: 54')
  })

  it('names the least clear sound so a note can be specific', () => {
    expect(prompt).toContain('least clear sound: "ɾ" at 31%')
  })

  it('mentions ambiguity only when the language was genuinely unclear', () => {
    expect(prompt).not.toContain('not clear-cut')
    const ambiguous = formatCoachPrompt({
      transcript: 'la mariposa',
      heard: 'l a',
      language: 'Spanish',
      words: WORDS,
      ambiguous: true,
    })
    expect(ambiguous).toContain('not clear-cut')
  })
})

describe('parseCoaching', () => {
  it('reads a well-formed response', () => {
    const coaching = parseCoaching(VALID)
    expect(coaching.translation).toBe('the butterfly')
    expect(coaching.notes).toHaveLength(1)
    expect(coaching.notes[0].word).toBe('mariposa')
    expect(coaching.summary).toContain('tap')
  })

  it('tolerates markdown fences, which small local models add anyway', () => {
    expect(parseCoaching('```json\n' + VALID + '\n```').translation).toBe('the butterfly')
  })

  it('tolerates commentary around the object', () => {
    expect(parseCoaching(`Sure! Here you go:\n${VALID}\nHope that helps.`).translation).toBe(
      'the butterfly',
    )
  })

  it('treats an empty or whitespace translation as absent', () => {
    expect(parseCoaching(JSON.stringify({ translation: '   ', notes: [] })).translation).toBeNull()
  })

  it('drops malformed notes instead of failing the utterance', () => {
    const coaching = parseCoaching(
      JSON.stringify({
        translation: 'hello',
        notes: [
          { word: 'hola', note: 'Good.' },
          { word: 'x' },
          { note: 'orphan' },
          { word: 'y', note: '   ' },
          null,
        ],
      }),
    )
    expect(coaching.notes).toHaveLength(1)
    expect(coaching.notes[0].word).toBe('hola')
  })

  it('defaults a missing summary to empty rather than throwing', () => {
    expect(parseCoaching(JSON.stringify({ translation: 'hi', notes: [] })).summary).toBe('')
  })

  it('throws when there is no JSON object at all', () => {
    expect(() => parseCoaching('I could not work that one out, sorry.')).toThrow(/No JSON object/)
  })
})

describe('pickModel', () => {
  it('prefers the configured id', () => {
    expect(pickModel(['gemma-3-4b', 'gemma-4-e4b-it-qat'], 'gemma-4-e4b-it-qat')).toBe('gemma-4-e4b-it-qat')
  })

  it('accepts a Gemma served under a file path', () => {
    // llama-server without --alias reports the GGUF path as the id.
    const path = '/Users/x/.lmstudio/models/google/gemma-4-E4B-it-qat-q4_0-gguf/gemma-4-E4B_q4_0-it.gguf'
    expect(pickModel([path])).toBe(path)
  })

  it('prefers Gemma 4 over older Gemma, and never an embedding model', () => {
    expect(pickModel(['text-embedding-gemma', 'gemma3:4b', 'gemma4:e4b'])).toBe('gemma4:e4b')
    expect(pickModel(['text-embedding-nomic-embed-text-v1.5'])).toBeNull()
  })
})

describe('connectLocalModel', () => {
  afterEach(() => vi.unstubAllGlobals())

  function serve(byOrigin: Record<string, string[]>) {
    vi.stubGlobal('fetch', async (url: string) => {
      const models = byOrigin[new URL(url).origin]
      if (!models) throw new TypeError('Failed to fetch')
      return new Response(JSON.stringify({ data: models.map((id) => ({ id })) }))
    })
  }

  it('skips a server with no Gemma and finds the one that has it', async () => {
    serve({
      'http://127.0.0.1:1234': ['text-embedding-nomic-embed-text-v1.5'],
      'http://127.0.0.1:8080': ['gemma-4-e4b-it-qat'],
    })
    const { connection } = await connectLocalModel({ baseUrl: 'http://127.0.0.1:1234' })
    expect(connection).toMatchObject({ baseUrl: 'http://127.0.0.1:8080', model: 'gemma-4-e4b-it-qat' })
  })

  it('keeps the preferred endpoint when several have Gemma', async () => {
    serve({
      'http://127.0.0.1:8080': ['gemma-4-e4b-it-qat'],
      'http://127.0.0.1:11434': ['gemma4:e4b'],
    })
    const { connection } = await connectLocalModel({ baseUrl: 'http://127.0.0.1:11434/' })
    expect(connection?.baseUrl).toBe('http://127.0.0.1:11434')
  })

  it('explains each endpoint when nothing connects', async () => {
    serve({ 'http://127.0.0.1:1234': ['text-embedding-nomic-embed-text-v1.5'] })
    const { connection, report } = await connectLocalModel()
    expect(connection).toBeNull()
    expect(report.join('\n')).toMatch(/1234: server up, but no Gemma/)
    expect(report.join('\n')).toMatch(/8080: not reachable/)
  })
})
