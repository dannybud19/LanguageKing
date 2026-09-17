/**
 * The voice-recognition pipeline: audio in, RecognitionResult out.
 *
 * Two tracks meet here, and the division between them is the load-bearing
 * design decision of the whole feature:
 *
 *   The acoustic track MEASURES. wav2vec2 reports the sounds actually produced
 *   and how clearly, and never corrects them.
 *
 *   The language model INTERPRETS. It decides which word was meant and, later,
 *   how to coach it. It never scores, because any LM-backed model emits
 *   plausible text rather than what was said -- score off its transcript and
 *   every learner is graded perfect.
 *
 * Language identification happens by searching each language's lexicon for the
 * best explanation of the sounds, not by classifying the audio. A beginner's
 * accent is their native language, so acoustic language ID would answer with
 * the language they already speak.
 */

import { recognizePhonemes, type LoadOptions } from './phonemes/recognizer'
import { toIpaString } from './phonemes/ctc'
import { identifyLanguage, type LanguageIdOptions } from './lexicon/languageId'
import type { Lexicon, RecognitionResult } from './types'

export interface RecognizeOptions extends LanguageIdOptions {
  lexicon: Lexicon
  model?: LoadOptions
  /** Milliseconds spent capturing, for the perf readout. */
  captureMs?: number
}

const EMPTY: RecognitionResult = {
  heard: '',
  phonemes: [],
  language: { code: 'unknown', name: 'Unknown', confidence: 0, acousticScore: 0 },
  ranking: [],
  ambiguous: false,
  meant: null,
  words: [],
  durationMs: 0,
  timings: { captureMs: 0, recognizeMs: 0, matchMs: 0 },
}

/**
 * Recognise an utterance.
 *
 * @param audio Mono 16 kHz float samples, already trimmed of silence.
 */
export async function recognize(
  audio: Float32Array,
  options: RecognizeOptions,
): Promise<RecognitionResult> {
  const { lexicon, model, captureMs = 0, ...languageOptions } = options

  if (audio.length === 0) {
    return { ...EMPTY, timings: { ...EMPTY.timings, captureMs } }
  }

  const recognizeStart = performance.now()
  const { phonemes } = await recognizePhonemes(audio, model)
  const recognizeMs = performance.now() - recognizeStart

  const matchStart = performance.now()
  const identified = identifyLanguage(phonemes, lexicon, languageOptions)
  const matchMs = performance.now() - matchStart

  const durationMs = (audio.length / 16000) * 1000

  return {
    heard: toIpaString(phonemes),
    phonemes,
    language: identified.language,
    ranking: identified.ranking,
    ambiguous: identified.ambiguous,
    // Null rather than a best guess: a confident wrong answer is worse than
    // admitting the sounds did not match anything.
    meant: identified.best?.entry.text ?? null,
    words: identified.best?.match.words ?? [],
    durationMs,
    timings: { captureMs, recognizeMs, matchMs },
  }
}

/** Convenience for building the candidate list handed to the interpreter. */
export function candidatesFor(
  result: RecognitionResult,
  lexicon: Lexicon,
  limit = 5,
): Array<{ language: string; text: string; reference: string; score: number }> {
  const out: Array<{ language: string; text: string; reference: string; score: number }> = []
  for (const guess of result.ranking.slice(0, limit)) {
    const entries = lexicon[guess.code]?.entries ?? []
    // The winning entry per language is what the interpreter needs to arbitrate.
    const best = entries.find((e) => e.text === result.meant) ?? entries[0]
    if (!best) continue
    out.push({
      language: guess.code,
      text: best.text,
      reference: best.phonemes.join(' '),
      score: guess.acousticScore,
    })
  }
  return out
}
