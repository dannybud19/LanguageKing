/**
 * Feature-weighted substitution cost between two phonemes.
 *
 * Returns 0 for identical sounds and approaches 1 for maximally different
 * ones. The point is that cost(θ, s) must be much smaller than cost(θ, k):
 * a learner substituting a nearby sound is close to correct, one substituting
 * an unrelated sound is not.
 */

import { parsePhoneme, type Features } from './ipaFeatures'

/** Weights for comparing two consonants. Sum is the normaliser. */
const CONSONANT_WEIGHTS = {
  place: 0.3,
  continuant: 0.18,
  sonorant: 0.18,
  nasal: 0.12,
  voiced: 0.12,
  lateral: 0.1,
  rhotic: 0.1,
  strident: 0.06,
} as const

/** Weights for comparing two vowels. */
const VOWEL_WEIGHTS = {
  height: 0.35,
  back: 0.3,
  round: 0.15,
  glide: 0.12,
  rhotic: 0.08,
  long: 0.04,
  nasalized: 0.04,
} as const

/**
 * Baseline cost of swapping a vowel for a consonant. Deliberately high --
 * this is never a plausible near-miss, and letting it be cheap makes the
 * aligner produce nonsense.
 */
const SYLLABIC_MISMATCH = 0.8

/** Cost applied when a symbol is outside our inventory: neither near nor far. */
const UNKNOWN_COST = 0.5

/**
 * Normalisers. These are deliberately NOT the sum of the weights.
 *
 * No two real phonemes differ on every dimension at once, so dividing by the
 * weight sum squeezes every actual comparison into the bottom third of 0..1 --
 * ordering stays correct but the absolute numbers become useless as scores, and
 * a word with two badly wrong consonants still reads as 0.89. These values are
 * roughly the largest distance attainable between phonemes that genuinely
 * occur, which spreads real comparisons across the full range. Costs are
 * clamped to 1, so the extremes saturate rather than overflow.
 */
const CONSONANT_NORM = 0.62
const VOWEL_NORM = 0.7

/**
 * Substitution cost between two phoneme symbols, in 0..1.
 *
 * Identical symbols cost 0. Unknown symbols cost UNKNOWN_COST rather than 0 or
 * 1, so an unrecognised sound neither masks nor invents an error.
 */
export function substitutionCost(a: string, b: string): number {
  if (a === b) return 0

  const pa = parsePhoneme(a)
  const pb = parsePhoneme(b)
  if (pa.unknown || pb.unknown) return UNKNOWN_COST

  const fa = pa.features
  const fb = pb.features

  if (fa.syllabic !== fb.syllabic) {
    // Still let the residual matter a little, so [j]/[i] and [w]/[u] --
    // genuinely close pairs that straddle the divide -- score below the worst case.
    const residual = Math.abs(fa.height - fb.height) * 0.1 + Math.abs(fa.back - fb.back) * 0.1
    return Math.min(1, SYLLABIC_MISMATCH + residual)
  }

  return fa.syllabic === 1 ? vowelCost(fa, fb) : consonantCost(fa, fb)
}

function consonantCost(a: Features, b: Features): number {
  const w = CONSONANT_WEIGHTS
  let d = 0
  d += w.place * Math.abs(a.place - b.place)
  d += w.continuant * Math.abs(a.continuant - b.continuant)
  d += w.sonorant * Math.abs(a.sonorant - b.sonorant)
  d += w.nasal * Math.abs(a.nasal - b.nasal)
  d += w.voiced * Math.abs(a.voiced - b.voiced)
  d += w.lateral * Math.abs(a.lateral - b.lateral)
  d += w.rhotic * Math.abs(a.rhotic - b.rhotic)
  d += w.strident * Math.abs(a.strident - b.strident)
  return Math.min(1, d / CONSONANT_NORM)
}

function vowelCost(a: Features, b: Features): number {
  const w = VOWEL_WEIGHTS
  let d = 0
  d += w.height * Math.abs(a.height - b.height)
  d += w.back * Math.abs(a.back - b.back)
  d += w.round * Math.abs(a.round - b.round)
  d += w.rhotic * Math.abs(a.rhotic - b.rhotic)
  d += w.long * Math.abs(a.long - b.long)
  d += w.nasalized * Math.abs(a.nasalized - b.nasalized)

  // Offglide: a monophthong said as a diphthong (or vice versa) is a real but
  // modest error -- the [oʊ]-for-[o] that marks an English accent in Spanish.
  if (a.hasGlide !== b.hasGlide) {
    d += w.glide
  } else if (a.hasGlide === 1) {
    d += w.glide * (Math.abs(a.glideHeight - b.glideHeight) + Math.abs(a.glideBack - b.glideBack)) / 2
  }

  return Math.min(1, d / VOWEL_NORM)
}

/**
 * Cost of dropping or adding a sound. Set below the syllabic-mismatch cost so
 * the aligner prefers an honest deletion over a nonsense substitution, but high
 * enough that it does not delete its way to a spurious match.
 */
export function gapCost(symbol: string): number {
  const { features, unknown } = parsePhoneme(symbol)
  if (unknown) return 0.6
  // Dropping a vowel changes the syllable count, which is more damaging to
  // intelligibility than dropping a consonant.
  return features.syllabic === 1 ? 0.7 : 0.55
}

export const _internal = { CONSONANT_WEIGHTS, VOWEL_WEIGHTS, SYLLABIC_MISMATCH, UNKNOWN_COST }
