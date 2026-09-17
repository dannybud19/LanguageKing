/**
 * Fluency from timing.
 *
 * Derived from the phoneme timings the acoustic track already produces: how
 * fast sounds are being produced, and how much of the utterance is taken up by
 * hesitation. Both are genuine measurements, unlike pitch-based intonation,
 * which needs F0 tracking and is not attempted here.
 */

import type { RecognizedPhoneme } from '../types'

/** A gap at least this long counts as hesitation rather than normal closure. */
const PAUSE_THRESHOLD_S = 0.25

/**
 * Comfortable conversational rate, in phonemes per second. Used only to
 * recognise unusually halting speech, not to reward speed -- talking fast is
 * not the same as speaking well.
 */
const COMFORTABLE_RATE = 9

export interface FluencyResult {
  /** 0..1 */
  score: number
  phonemesPerSecond: number
  /** Total seconds spent in internal pauses. */
  pauseSeconds: number
  pauseCount: number
}

export function fluencyScore(phonemes: RecognizedPhoneme[]): FluencyResult {
  if (phonemes.length < 2) {
    return { score: 0, phonemesPerSecond: 0, pauseSeconds: 0, pauseCount: 0 }
  }

  const start = phonemes[0].start
  const end = phonemes[phonemes.length - 1].end
  const span = Math.max(1e-6, end - start)

  let pauseSeconds = 0
  let pauseCount = 0
  for (let i = 1; i < phonemes.length; i++) {
    const gap = phonemes[i].start - phonemes[i - 1].end
    if (gap >= PAUSE_THRESHOLD_S) {
      pauseSeconds += gap
      pauseCount++
    }
  }

  const phonemesPerSecond = phonemes.length / span

  // Two independent penalties: time lost to hesitation, and a rate well below
  // conversational. Speaking faster than comfortable is not penalised.
  const pausePenalty = clamp01(pauseSeconds / span)
  const ratePenalty = clamp01(1 - phonemesPerSecond / COMFORTABLE_RATE)

  const score = clamp01(1 - 0.65 * pausePenalty - 0.35 * ratePenalty)

  return { score, phonemesPerSecond, pauseSeconds, pauseCount }
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)

export const _internal = { PAUSE_THRESHOLD_S, COMFORTABLE_RATE }
