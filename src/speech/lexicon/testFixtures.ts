/** Shared fixtures for the matcher and language-ID tests. */

import type { Lexicon, LexiconEntry, RecognizedPhoneme } from '../types'

/** Build recognised phonemes from a space-separated IPA string. */
export function heard(ipa: string, confidence = 0.9): RecognizedPhoneme[] {
  return ipa
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((symbol, i) => ({
      symbol,
      start: i * 0.08,
      end: (i + 1) * 0.08,
      confidence,
      alternates: [],
    }))
}

export function entry(text: string, ipa: string): LexiconEntry {
  const words = text.split(/\s+/)
  const perWord = ipa.split(' | ').map((w) => w.trim().split(/\s+/).filter(Boolean))
  const phonemes: string[] = []
  const wordStarts: number[] = []
  for (const w of perWord) {
    wordStarts.push(phonemes.length)
    phonemes.push(...w)
  }
  return { text, phonemes, wordStarts, words }
}

/**
 * A deliberately confusable lexicon: the same word exists in Spanish and
 * Italian, and an English phrase happens to sound like a learner's attempt.
 */
export const LEXICON: Lexicon = {
  es: {
    name: 'Spanish',
    entries: [
      entry('mariposa', 'm a ɾ i p o s a'),
      entry('gracias', 'g ɾ a θ i a s'),
      entry('la mariposa vuela', 'l a | m a ɾ i p o s a | b w e l a'),
    ],
  },
  it: {
    name: 'Italian',
    entries: [entry('mariposa', 'm a r i p ɔ z a'), entry('grazie', 'g r a t s j e')],
  },
  en: {
    name: 'English',
    entries: [entry('mary poser', 'm ɛ ɹ i | p oʊ z ɚ'), entry('thank you', 'θ æ ŋ k | j u')],
  },
}
