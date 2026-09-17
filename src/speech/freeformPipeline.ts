/**
 * The free-form recognition pipeline: recorded blob in, UI-ready result out.
 *
 * Order matters here, and it encodes the core design decision.
 *
 *   1. wav2vec2 reports the sounds ACTUALLY produced, with no language
 *      assumed and no language model tidying them up.
 *   2. The language is inferred from that phoneme inventory. Not from an
 *      acoustic language classifier, which keys off accent and would answer
 *      with the language the learner already speaks.
 *   3. Whisper transcribes, FORCED to the language step 2 chose, and returns
 *      word timings.
 *   4. Word scores come from the acoustic track's confidence over each word's
 *      span -- never from Whisper, which has already smoothed the errors away.
 */

import { decodeRecording } from './audio/decodeBlob'
import { recognizePhonemes, type LoadOptions } from './phonemes/recognizer'
import { toIpaString } from './phonemes/ctc'
import { identifyFromInventory, type IdentifyOptions, type LanguageProfile } from './language/inventory'
import { transcribe, type WhisperLoadOptions } from './transcribe/whisper'
import { overallScore, scoreWords, type ClarityScoredWord } from './scoring/wordClarity'
import type { LanguageGuess, RecognizedPhoneme } from './types'

export interface FreeformOptions extends IdentifyOptions {
  phonemeModel?: LoadOptions
  whisperModel?: WhisperLoadOptions
  /** Skip transcription, e.g. to test language detection alone. */
  skipTranscription?: boolean
}

export interface FreeformResult {
  /** Raw IPA of what was said. Internal/diagnostic -- the product forbids
   *  showing IPA to learners. */
  heard: string
  phonemes: RecognizedPhoneme[]
  language: LanguageGuess
  ranking: LanguageGuess[]
  ambiguous: boolean
  profile: LanguageProfile | null
  /** Empty when nothing intelligible was said. */
  transcript: string
  words: ClarityScoredWord[]
  score: number
  durationMs: number
  hasSpeech: boolean
  timings: { decodeMs: number; phonemeMs: number; languageMs: number; transcribeMs: number }
}

const UNKNOWN: LanguageGuess = { code: 'unknown', name: 'Unknown', confidence: 0, acousticScore: 0 }

const EMPTY: FreeformResult = {
  heard: '',
  phonemes: [],
  language: UNKNOWN,
  ranking: [],
  ambiguous: false,
  profile: null,
  transcript: '',
  words: [],
  score: 0,
  durationMs: 0,
  hasSpeech: false,
  timings: { decodeMs: 0, phonemeMs: 0, languageMs: 0, transcribeMs: 0 },
}

/** Run the whole pipeline on a recorded blob. */
export async function analyseRecording(
  blob: Blob,
  options: FreeformOptions = {},
): Promise<FreeformResult> {
  const decodeStart = performance.now()
  const decoded = await decodeRecording(blob)
  const decodeMs = performance.now() - decodeStart

  if (!decoded.hasSpeech || decoded.audio.length === 0) {
    return { ...EMPTY, timings: { ...EMPTY.timings, decodeMs } }
  }

  return analyseAudio(decoded.audio, decoded.durationMs, options, decodeMs)
}

/**
 * Run the pipeline on already-decoded audio.
 *
 * Exposed separately so tests can feed synthesised audio without going through
 * a Blob and the Web Audio decoder.
 */
export async function analyseAudio(
  audio: Float32Array,
  durationMs: number,
  options: FreeformOptions = {},
  decodeMs = 0,
): Promise<FreeformResult> {
  const { phonemeModel, whisperModel, skipTranscription, ...identifyOptions } = options

  // 1. What sounds were actually made.
  const phonemeStart = performance.now()
  const { phonemes } = await recognizePhonemes(audio, phonemeModel)
  const phonemeMs = performance.now() - phonemeStart

  if (phonemes.length === 0) {
    return {
      ...EMPTY,
      durationMs,
      timings: { ...EMPTY.timings, decodeMs, phonemeMs },
    }
  }

  // 2. Which language those sounds belong to.
  const languageStart = performance.now()
  const identified = identifyFromInventory(phonemes, identifyOptions)
  const languageMs = performance.now() - languageStart

  // 3. Which words, forced to that language.
  const transcribeStart = performance.now()
  const transcription = skipTranscription
    ? { text: '', words: [] }
    : await transcribe(audio, identified.profile?.whisperName ?? null, whisperModel)
  const transcribeMs = performance.now() - transcribeStart

  // 4. How well each word was produced -- from the acoustic track only.
  const words = scoreWords(transcription.words, phonemes)

  return {
    heard: toIpaString(phonemes),
    phonemes,
    language: identified.language,
    ranking: identified.ranking,
    ambiguous: identified.ambiguous,
    profile: identified.profile,
    transcript: transcription.text,
    words,
    score: overallScore(words),
    durationMs,
    hasSpeech: true,
    timings: { decodeMs, phonemeMs, languageMs, transcribeMs },
  }
}
