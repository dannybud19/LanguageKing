import { describe, expect, it } from 'vitest'
import { formatFreeSpeechPrompt, parseReading } from './localInterpreter'
import type { LanguageGuess } from '../types'

const RANKING: LanguageGuess[] = [
  { code: 'es', name: 'Spanish', confidence: 0.72, acousticScore: 0.81 },
  { code: 'it', name: 'Italian', confidence: 0.21, acousticScore: 0.66 },
]

const VALID = JSON.stringify({
  language: { code: 'es', confidence: 0.9 },
  text: 'la mariposa',
  translation: 'the butterfly',
  words: [
    { word: 'la', ipa: 'l a' },
    { word: 'mariposa', ipa: 'm a ɾ i p o s a', note: 'The [ɾ] came out as an English [ɹ].' },
  ],
  summary: 'Close — the tap is the one sound to work on.',
})

describe('formatFreeSpeechPrompt', () => {
  it('includes the raw IPA and the acoustic ranking', () => {
    const prompt = formatFreeSpeechPrompt({ heard: 'l a m a ɾ i', ranking: RANKING })
    expect(prompt).toContain('heard: "l a m a ɾ i"')
    expect(prompt).toContain('"es"')
    expect(prompt).toContain('"it"')
  })

  it('omits studying and native when the app does not know them', () => {
    // The product is specified as zero-config, so this is the normal case.
    const prompt = formatFreeSpeechPrompt({ heard: 'l a', ranking: RANKING })
    expect(prompt).not.toContain('studying:')
    expect(prompt).not.toContain('native:')
  })

  it('includes them when they are known', () => {
    const prompt = formatFreeSpeechPrompt({
      heard: 'l a',
      ranking: RANKING,
      studying: 'es',
      native: 'en',
    })
    expect(prompt).toContain('studying: "es"')
    expect(prompt).toContain('native: "en"')
  })
})

describe('parseReading', () => {
  it('reads a well-formed response', () => {
    const reading = parseReading(VALID)
    expect(reading.language.code).toBe('es')
    expect(reading.text).toBe('la mariposa')
    expect(reading.translation).toBe('the butterfly')
    expect(reading.words).toHaveLength(2)
    expect(reading.words[1].note).toContain('[ɾ]')
  })

  it('tolerates markdown fences, which small local models add anyway', () => {
    expect(parseReading('```json\n' + VALID + '\n```').text).toBe('la mariposa')
  })

  it('tolerates commentary around the object', () => {
    expect(parseReading(`Sure! Here you go:\n${VALID}\nHope that helps.`).text).toBe('la mariposa')
  })

  it('clamps a confidence the model reported out of range', () => {
    const reading = parseReading(
      JSON.stringify({ language: { code: 'es', confidence: 4.2 }, text: 'hola', words: [] }),
    )
    expect(reading.language.confidence).toBe(1)
  })

  it('falls back to unknown rather than inventing a language', () => {
    const reading = parseReading(JSON.stringify({ text: null, words: [] }))
    expect(reading.language.code).toBe('unknown')
    expect(reading.text).toBeNull()
  })

  it('treats an empty or whitespace text as no reading at all', () => {
    expect(parseReading(JSON.stringify({ text: '   ', words: [] })).text).toBeNull()
  })

  it('drops malformed word entries instead of failing the utterance', () => {
    const reading = parseReading(
      JSON.stringify({
        language: { code: 'es', confidence: 0.8 },
        text: 'hola',
        words: [{ word: 'hola', ipa: 'o l a' }, { ipa: 'x' }, null],
      }),
    )
    expect(reading.words).toHaveLength(1)
    expect(reading.words[0].word).toBe('hola')
  })

  it('defaults a missing per-word ipa to empty rather than throwing', () => {
    const reading = parseReading(
      JSON.stringify({ language: { code: 'es' }, text: 'hola', words: [{ word: 'hola' }] }),
    )
    expect(reading.words[0].ipa).toBe('')
  })

  it('throws when there is no JSON object at all', () => {
    expect(() => parseReading('I could not work that one out, sorry.')).toThrow(/No JSON object/)
  })
})
