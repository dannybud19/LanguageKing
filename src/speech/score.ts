/**
 * Pronunciation scoring, derived entirely from the acoustic track.
 *
 * Nothing here consults the language model. That separation is the whole point:
 * the model reads the sounds back into words, and if it also graded them it
 * would grade its own reading, which is always excellent by construction.
 *
 * Every number below traces to something wav2vec2 actually measured -- the
 * per-phoneme posteriors and the frame timings. Where a metric cannot be
 * computed from those, it is returned as null rather than filled with a
 * plausible-looking number.
 */

import type { RecognizedPhoneme } from './types'
import type { ReadWord } from './llm/localInterpreter'

export interface UtteranceScore {
  /** 0..100. Mean posterior over the utterance, curved. */
  overall: number
  /** How cleanly individual sounds were produced. 0..100. */
  articulation: number
  /** Evenness of delivery -- pauses and rate variation. 0..100. */
  fluency: number
  /**
   * Null, always, for now.
   *
   * Intonation needs an F0 contour compared against a reference, and there is
   * no pitch tracker in the pipeline. A number here would be decoration.
   */
  intonation: null
  grade: string
}

/**
 * Posterior below which a sound reads as genuinely unclear.
 *
 * CTC posteriors on a confident model cluster high, so a raw 0..1 -> 0..100 map
 * would put every learner in the nineties. This floor stretches the band that
 * actually discriminates. It is a starting point, not a calibrated curve --
 * it wants tuning against recordings of known quality before it means much.
 */
const FLOOR = 0.35

/** Map a mean posterior onto 0..100, expanding the useful range above FLOOR. */
export function curve(meanConfidence: number): number {
  if (!Number.isFinite(meanConfidence)) return 0
  const stretched = (meanConfidence - FLOOR) / (1 - FLOOR)
  return Math.round(Math.min(100, Math.max(0, stretched * 100)))
}

export type Strictness = 'lenient' | 'standard' | 'strict'

const STRICTNESS_OFFSET: Record<Strictness, number> = {
  lenient: 4,
  standard: 0,
  strict: -5,
}

function gradeFor(score: number): string {
  if (score >= 95) return 'A+ (Native Perfection)'
  if (score >= 90) return 'A (Near Native)'
  if (score >= 80) return 'B+ (Very Good)'
  if (score >= 70) return 'B (Clear Accent)'
  if (score >= 60) return 'C (Understandable)'
  return 'D (Hard to Follow)'
}

/** Mean posterior, weighted by how long each sound lasted. */
export function meanConfidence(phonemes: RecognizedPhoneme[]): number {
  if (phonemes.length === 0) return 0
  let weighted = 0
  let total = 0
  for (const p of phonemes) {
    // A 200ms vowel says more about clarity than a 20ms stop burst.
    const duration = Math.max(0.01, p.end - p.start)
    weighted += p.confidence * duration
    total += duration
  }
  return total > 0 ? weighted / total : 0
}

/**
 * Fluency from delivery evenness.
 *
 * Two things read as disfluent: long gaps between sounds, and a phoneme rate
 * that lurches. Both are visible in the timings alone.
 */
export function fluencyScore(phonemes: RecognizedPhoneme[]): number {
  if (phonemes.length < 3) return 0

  const gaps: number[] = []
  for (let i = 1; i < phonemes.length; i++) {
    gaps.push(Math.max(0, phonemes[i].start - phonemes[i - 1].end))
  }

  // Anything past ~250ms mid-utterance is a hesitation, not coarticulation.
  const hesitations = gaps.filter((g) => g > 0.25).length
  const hesitationPenalty = Math.min(40, hesitations * 12)

  const durations = phonemes.map((p) => Math.max(0.01, p.end - p.start))
  const mean = durations.reduce((a, b) => a + b, 0) / durations.length
  const variance =
    durations.reduce((acc, d) => acc + (d - mean) ** 2, 0) / durations.length
  // Coefficient of variation: scale-free, so a slow speaker is not punished.
  const cv = mean > 0 ? Math.sqrt(variance) / mean : 0
  const evennessPenalty = Math.min(35, Math.max(0, (cv - 0.5) * 50))

  return Math.round(Math.max(0, 100 - hesitationPenalty - evennessPenalty))
}

export function scoreUtterance(
  phonemes: RecognizedPhoneme[],
  strictness: Strictness = 'standard',
): UtteranceScore {
  const articulation = curve(meanConfidence(phonemes))
  const fluency = fluencyScore(phonemes)

  // Articulation dominates: this app is about how sounds came out, not pacing.
  const blended = articulation * 0.75 + fluency * 0.25
  const overall = Math.round(
    Math.min(100, Math.max(0, blended + STRICTNESS_OFFSET[strictness])),
  )

  return {
    overall,
    articulation,
    fluency,
    intonation: null,
    grade: gradeFor(overall),
  }
}

export type WordStatus = 'perfect' | 'good' | 'imperfect'

export interface ScoredReadWord {
  word: string
  ipa: string
  status: WordStatus
  /** 0..100, from the acoustic posteriors over this word's span. */
  score: number
  tip?: string
}

function statusFor(score: number): WordStatus {
  if (score >= 85) return 'perfect'
  if (score >= 65) return 'good'
  return 'imperfect'
}

const tokenize = (ipa: string) => ipa.split(/\s+/).filter(Boolean)

/**
 * Attach acoustic scores to the words the model read out of the IPA.
 *
 * The model is instructed to split the input IPA across the words in order and
 * without alteration, so token counts normally line up exactly. When they do
 * not -- a small local model will sometimes drop or merge a token -- the span is
 * apportioned by relative length instead. That is approximate, and deliberately
 * so: refusing to score at all would be worse for the learner than a word
 * boundary that is off by one sound.
 *
 * Exact per-word alignment needs the lexicon path, where reference phonemes are
 * known ahead of time.
 */
export function scoreWords(
  words: ReadWord[],
  phonemes: RecognizedPhoneme[],
): ScoredReadWord[] {
  if (words.length === 0 || phonemes.length === 0) return []

  const counts = words.map((w) => tokenize(w.ipa).length)
  const totalTokens = counts.reduce((a, b) => a + b, 0)

  let spans: Array<[number, number]>

  if (totalTokens === phonemes.length && totalTokens > 0) {
    // Exact: consume the recognised phonemes in order.
    spans = []
    let cursor = 0
    for (const count of counts) {
      spans.push([cursor, cursor + count])
      cursor += count
    }
  } else {
    // Apportion by relative IPA length, falling back to equal shares when the
    // model returned no per-word IPA at all.
    const weights = words.map((w, i) => (counts[i] > 0 ? counts[i] : w.ipa.length || 1))
    const weightTotal = weights.reduce((a, b) => a + b, 0)
    spans = []
    let cursor = 0
    weights.forEach((weight, i) => {
      const isLast = i === weights.length - 1
      const take = isLast
        ? phonemes.length - cursor
        : Math.max(1, Math.round((weight / weightTotal) * phonemes.length))
      const end = Math.min(phonemes.length, cursor + take)
      spans.push([cursor, end])
      cursor = end
    })
  }

  return words.map((word, i) => {
    const [start, end] = spans[i] ?? [0, 0]
    const span = phonemes.slice(start, end)
    const score = span.length > 0 ? curve(meanConfidence(span)) : 0
    return {
      word: word.word,
      ipa: word.ipa,
      status: statusFor(score),
      score,
      tip: word.note,
    }
  })
}

export const _internal = { FLOOR, STRICTNESS_OFFSET, tokenize }
