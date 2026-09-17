/**
 * Per-word pronunciation scores, without a reference pronunciation.
 *
 * Free-form speech means there is no expected text to align against, and the
 * browser cannot phonemise Whisper's output at runtime. What is available is
 * the acoustic model's own confidence over time: wav2vec2 was trained on
 * canonical eSpeak phonemes, so where a learner produces a sound cleanly it
 * commits to a label, and where they produce something between two phonemes it
 * hedges. Averaged across a word's time span, that confidence is a usable
 * measure of how clearly the word was articulated.
 *
 * The limitation is worth being explicit about: this measures CLARITY, not
 * CORRECTNESS. A learner who fluently says the wrong word scores well. Full
 * expected-versus-actual scoring needs a reference pronunciation, which arrives
 * with the phoneme aligner already built in `lexicon/match.ts` once
 * phonemisation is available (a desktop shell, or a prompted-reference mode).
 */

import type { RecognizedPhoneme } from '../types'
import type { TranscribedWord } from '../transcribe/whisper'

export type WordStatus = 'perfect' | 'good' | 'imperfect'

/** Score thresholds for the three badge colours. */
export const THRESHOLDS = { perfect: 0.82, good: 0.6 } as const

export interface ClarityScoredWord {
  word: string
  start: number
  end: number
  /** 0..1 */
  score: number
  status: WordStatus
  /** Phonemes that fell inside this word's span. */
  phonemes: string[]
  /** The least confident sound in the word, which is what a tip should target. */
  weakest: { symbol: string; confidence: number } | null
}

export function statusFor(score: number): WordStatus {
  if (score >= THRESHOLDS.perfect) return 'perfect'
  if (score >= THRESHOLDS.good) return 'good'
  return 'imperfect'
}

/**
 * Attribute phoneme confidences to words by time overlap.
 *
 * Whisper word timings and the phoneme timings share an origin because both
 * models receive the same buffer.
 */
export function scoreWords(
  words: TranscribedWord[],
  phonemes: RecognizedPhoneme[],
): ClarityScoredWord[] {
  return words.map((w) => {
    const inside = phonemes.filter((p) => overlaps(p, w))

    if (inside.length === 0) {
      // No phonemes landed in this span. Report it as unscored-but-present
      // rather than inventing a grade.
      return {
        word: w.word,
        start: w.start,
        end: w.end,
        score: 0,
        status: 'imperfect' as WordStatus,
        phonemes: [],
        weakest: null,
      }
    }

    // Duration-weighted mean: a long, badly-produced vowel should count for
    // more than a passing consonant.
    let weighted = 0
    let totalDuration = 0
    for (const p of inside) {
      const duration = Math.max(1e-6, p.end - p.start)
      weighted += p.confidence * duration
      totalDuration += duration
    }
    const mean = weighted / totalDuration

    const weakest = inside.reduce((a, b) => (b.confidence < a.confidence ? b : a))

    return {
      word: w.word,
      start: w.start,
      end: w.end,
      score: clamp01(mean),
      status: statusFor(clamp01(mean)),
      phonemes: inside.map((p) => p.symbol),
      weakest: { symbol: weakest.symbol, confidence: weakest.confidence },
    }
  })
}

/** Overall score, duration-weighted across words. */
export function overallScore(words: ClarityScoredWord[]): number {
  const scored = words.filter((w) => w.phonemes.length > 0)
  if (scored.length === 0) return 0
  let weighted = 0
  let total = 0
  for (const w of scored) {
    const duration = Math.max(1e-6, w.end - w.start)
    weighted += w.score * duration
    total += duration
  }
  return clamp01(weighted / total)
}

function overlaps(p: RecognizedPhoneme, w: TranscribedWord): boolean {
  // Any overlap counts; phoneme and word boundaries never line up exactly.
  return p.end > w.start && p.start < w.end
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)
