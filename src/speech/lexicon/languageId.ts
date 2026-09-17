/**
 * Language identification by search rather than by acoustics.
 *
 * Conventional acoustic language ID keys off phonetic inventory and accent --
 * and a beginner's accent is their native language, so an English speaker
 * attempting "mariposa" gets classified as English and transcribed as
 * nonsense. Instead we ask, of each candidate language: how well does your
 * vocabulary explain the sounds this person actually made?
 *
 * Priors then tilt the answer toward the language being studied, without
 * letting it override a clear acoustic result.
 */

import { matchEntry, type MatchResult } from './match'
import type { LanguageGuess, Lexicon, LexiconEntry, RecognizedPhoneme } from '../types'

export interface LanguageIdOptions {
  /** The language the learner is practising. Gets a prior boost. */
  studying?: string
  /** The learner's native language. Always kept as a candidate so the app can
   *  say "that came out as English" instead of forcing a study language. */
  native?: string
  /** Multiplier on the studying language's prior. */
  studyingPrior?: number
  /** Multiplier on the native language's prior. */
  nativePrior?: number
  /** Softmax temperature over acoustic scores. Lower = sharper decisions. */
  temperature?: number
  /** Confidence gap below which the top two languages are "too close to call". */
  ambiguityThreshold?: number
  /** Acoustic score below which we decline to guess at all. */
  minAcousticScore?: number
}

const DEFAULTS = {
  studyingPrior: 1.6,
  nativePrior: 1.15,
  temperature: 0.12,
  ambiguityThreshold: 0.15,
  minAcousticScore: 0.45,
} as const

export interface LanguageIdResult {
  language: LanguageGuess
  ranking: LanguageGuess[]
  ambiguous: boolean
  /** The winning entry and its alignment, or null when nothing fit. */
  best: { code: string; entry: LexiconEntry; match: MatchResult } | null
}

interface Candidate {
  code: string
  name: string
  entry: LexiconEntry
  match: MatchResult
}

const UNKNOWN: LanguageGuess = { code: 'unknown', name: 'Unknown', confidence: 0, acousticScore: 0 }

/**
 * Score every language's lexicon against the recognised phonemes and rank them.
 */
export function identifyLanguage(
  recognized: RecognizedPhoneme[],
  lexicon: Lexicon,
  options: LanguageIdOptions = {},
): LanguageIdResult {
  const opts = { ...DEFAULTS, ...options }

  if (recognized.length === 0) {
    return { language: UNKNOWN, ranking: [], ambiguous: false, best: null }
  }

  const perLanguage: Candidate[] = []
  for (const [code, { name, entries }] of Object.entries(lexicon)) {
    const best = bestEntry(recognized, entries)
    if (best) perLanguage.push({ code, name, entry: best.entry, match: best.match })
  }

  if (perLanguage.length === 0) {
    return { language: UNKNOWN, ranking: [], ambiguous: false, best: null }
  }

  // Softmax over acoustic scores, tilted by priors.
  const weights = perLanguage.map((c) => {
    const prior =
      c.code === opts.studying
        ? opts.studyingPrior
        : c.code === opts.native
          ? opts.nativePrior
          : 1
    return Math.exp(c.match.score / opts.temperature) * prior
  })
  const total = weights.reduce((a, b) => a + b, 0)

  const ranking: LanguageGuess[] = perLanguage
    .map((c, i) => ({
      code: c.code,
      name: c.name,
      confidence: total > 0 ? weights[i] / total : 0,
      acousticScore: c.match.score,
    }))
    .sort((a, b) => b.confidence - a.confidence)

  const top = ranking[0]
  const runnerUp = ranking[1]

  // Two languages can be genuinely indistinguishable -- es/it will trip this
  // legitimately. Report it rather than picking one and sounding certain.
  const ambiguous = runnerUp
    ? top.confidence - runnerUp.confidence < opts.ambiguityThreshold ||
      Math.abs(top.acousticScore - runnerUp.acousticScore) < 0.05
    : false

  // Nothing fit well enough: say so instead of returning a confident wrong answer.
  if (top.acousticScore < opts.minAcousticScore) {
    return {
      language: { ...UNKNOWN, confidence: top.confidence * top.acousticScore },
      ranking,
      ambiguous,
      best: null,
    }
  }

  const winner = perLanguage.find((c) => c.code === top.code)!
  return {
    language: top,
    ranking,
    ambiguous,
    best: { code: winner.code, entry: winner.entry, match: winner.match },
  }
}

/**
 * Best-matching entry within one language.
 *
 * Entries whose length is wildly different from what was said are skipped --
 * they cannot win, and skipping them keeps a multi-thousand-word lexicon fast.
 */
function bestEntry(
  recognized: RecognizedPhoneme[],
  entries: LexiconEntry[],
): { entry: LexiconEntry; match: MatchResult } | null {
  const spokenLength = recognized.length
  let best: { entry: LexiconEntry; match: MatchResult } | null = null

  for (const entry of entries) {
    const longer = Math.max(entry.phonemes.length, spokenLength)
    if (Math.abs(entry.phonemes.length - spokenLength) > 0.6 * longer) continue

    const match = matchEntry(recognized, entry)
    if (!best || match.score > best.match.score) best = { entry, match }
  }

  return best
}

export const _internal = { DEFAULTS, bestEntry }
