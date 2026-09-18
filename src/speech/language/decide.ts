/**
 * The final language decision: Gemma's ear first, phoneme inventory second.
 *
 * Gemma hears the words, so it leads. The inventory is kept for two jobs it is
 * still good at: answering when the local model is unreachable, and breaking
 * a tie when Gemma itself is unsure.
 *
 * One case needs a rule rather than a vote. A heavy accent makes a genuine
 * attempt at German sound like English -- measured on a local clip: English
 * 0.61, German 0.13. Taking that at face value tells a learner their German
 * was English, which is the one answer this app should never give casually. So
 * when Gemma's top pick is the learner's own language and a foreign language
 * got real probability too, the foreign language wins and the call is marked
 * ambiguous. Someone practising who really does speak their native language
 * still gets it: that needs Gemma to be near-certain, as it was (1.00) for
 * plain English.
 */

import type { LanguageGuess } from '../types'
import type { IdentifyResult, LanguageProfile } from './inventory'
import { profileForCode } from './catalog'
import type { GemmaDetection } from '../llm/languageDetector'

export type LanguageSource = 'gemma' | 'phonemes'

export interface LanguageDecision {
  language: LanguageGuess
  ranking: LanguageGuess[]
  ambiguous: boolean
  profile: LanguageProfile | null
  source: LanguageSource
}

export const THRESHOLDS = {
  /** Below this, Gemma is unsure and the inventory helps re-rank. */
  confident: 0.7,
  /** A runner-up this close to the top is reported as ambiguous. */
  ambiguityMargin: 0.25,
  /** A foreign language needs at least this much to override the native one. */
  foreignFloor: 0.08,
  /** Native wins outright only above this. */
  nativeCertain: 0.9,
} as const

export interface DecideOptions {
  /** Learner's native language. English, unless the app is told otherwise. */
  native?: string
}

export function decideLanguage(
  gemma: GemmaDetection | null,
  inventory: IdentifyResult,
  options: DecideOptions = {},
): LanguageDecision {
  if (!gemma || gemma.ranking.length === 0) {
    return { ...inventory, source: 'phonemes' }
  }

  const native = options.native ?? 'en'
  const inventoryConfidence = new Map(inventory.ranking.map((g) => [g.code, g.confidence]))

  let ranked = gemma.ranking.map((g) => ({ ...g, score: g.probability }))
  let ambiguous = false
  const top = ranked[0]

  if (top.code === native && top.probability < THRESHOLDS.nativeCertain) {
    const foreign = ranked.filter((g) => g.code !== native && g.probability >= THRESHOLDS.foreignFloor)
    if (foreign.length > 0) {
      ranked = [...foreign, ...ranked.filter((g) => !foreign.includes(g))]
      ambiguous = true
    }
  }

  if (ranked[0].probability < THRESHOLDS.confident || ambiguous) {
    // Re-rank the contenders with the inventory as a tie-breaker. The 0.5
    // floor keeps a language with no phoneme profile (Portuguese, Korean) in
    // the running: absence of a profile is not evidence against it.
    const lead = ranked.filter((g) => g.code !== native || !ambiguous)
    const rescored = lead
      .map((g) => ({ ...g, score: g.probability * (0.5 + (inventoryConfidence.get(g.code) ?? 0)) }))
      .sort((a, b) => b.score - a.score)
    ranked = [...rescored, ...ranked.filter((g) => !lead.includes(g))]
  }

  const [first, second] = ranked
  if (second && first.probability - second.probability < THRESHOLDS.ambiguityMargin) ambiguous = true

  const ranking: LanguageGuess[] = ranked.map((g) => ({
    code: g.code,
    name: g.name,
    confidence: g.probability,
    acousticScore: inventory.ranking.find((r) => r.code === g.code)?.acousticScore ?? 0,
  }))

  return {
    language: ranking[0],
    ranking,
    ambiguous,
    profile: profileForCode(first.code),
    source: 'gemma',
  }
}
