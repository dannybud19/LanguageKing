/**
 * Turning measurements into the number and letter the learner sees.
 *
 * Kept apart from the measuring code because this is the presentation end: the
 * blend weights and the band boundaries are product decisions that will be
 * argued about and tuned, whereas the acoustic scores underneath them are not.
 */

import { fluencyScore } from './fluency'
import type { RecognizedPhoneme } from '../types'

export type Strictness = 'lenient' | 'standard' | 'strict'

/**
 * Applied to the 0..1 articulation score before blending.
 *
 * Deliberately small. Strictness should shade a borderline grade, not move a
 * learner two bands, or the score stops meaning anything measurable.
 */
const STRICTNESS_ADJUST: Record<Strictness, number> = {
  lenient: 0.06,
  standard: 0,
  strict: -0.06,
}

/**
 * Articulation dominates: this app is about how sounds came out, not pacing.
 * Fluency still counts, because a word-perfect utterance delivered in halting
 * pieces is not yet fluent speech.
 */
const ARTICULATION_WEIGHT = 0.7

export const clamp01 = (x: number) => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0)
export const percent = (x: number) => Math.round(clamp01(x) * 100)

export function gradeFor(score: number): string {
  if (score >= 95) return 'A+ (Native Perfection)'
  if (score >= 90) return 'A (Near Native)'
  if (score >= 80) return 'B+ (Very Good)'
  if (score >= 70) return 'B (Clear Accent)'
  if (score >= 60) return 'C (Understandable)'
  return 'D (Keep Practising)'
}

export interface GradeResult {
  /** 0..100. */
  overall: number
  articulation: number
  fluency: number
  /**
   * Always null. Intonation needs an F0 contour compared against a reference,
   * and there is no pitch tracker in the pipeline. A number here would be
   * decoration, and a decorative number in a grading UI is a lie.
   */
  intonation: null
  grade: string
  /** Pause detail, for the plain-language feedback. */
  pauses: { count: number; seconds: number }
}

/**
 * @param articulation 0..1, from the acoustic word scores.
 */
export function gradeUtterance(
  articulation: number,
  phonemes: RecognizedPhoneme[],
  strictness: Strictness = 'standard',
): GradeResult {
  const adjusted = clamp01(articulation + STRICTNESS_ADJUST[strictness])
  const fluency = fluencyScore(phonemes)
  const overall = clamp01(
    adjusted * ARTICULATION_WEIGHT + fluency.score * (1 - ARTICULATION_WEIGHT),
  )

  return {
    overall: percent(overall),
    articulation: percent(adjusted),
    fluency: percent(fluency.score),
    intonation: null,
    grade: gradeFor(percent(overall)),
    pauses: { count: fluency.pauseCount, seconds: fluency.pauseSeconds },
  }
}

export const _internal = { STRICTNESS_ADJUST, ARTICULATION_WEIGHT }
