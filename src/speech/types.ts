/**
 * The output contract for the voice-recognition pipeline.
 *
 * Everything the later stages of the product need is carried here. In particular
 * `ScoredWord.score` is what becomes the red/yellow/green colouring, and
 * `ScoredWord.diffs` is what the coaching stage turns into advice. Both only exist
 * because the recogniser keeps its frame-level CTC logits instead of decoding
 * straight to a string.
 */

/** A phoneme the acoustic model actually heard, with where and how clearly. */
export interface RecognizedPhoneme {
  /** eSpeak/IPA symbol, e.g. "ɾ". */
  symbol: string
  /** Seconds from the start of the trimmed utterance. */
  start: number
  end: number
  /** Mean softmax posterior across the frames that produced this phoneme, 0..1. */
  confidence: number
  /** Runner-up symbols for these frames, best first. Lets the matcher recover
   *  from a single bad argmax without re-running the model. */
  alternates: Array<{ symbol: string; confidence: number }>
}

export interface LanguageGuess {
  /** ISO 639-1, or "unknown". */
  code: string
  name: string
  /** Posterior after length-normalisation and priors, 0..1. */
  confidence: number
  /** Raw acoustic match before priors were applied — useful for debugging why a
   *  language won, and for telling "it fit well" apart from "it was expected". */
  acousticScore: number
}

/** One expected-vs-actual phoneme discrepancy. */
export interface PhonemeDiff {
  /** Reference phoneme, or null when the learner inserted a sound. */
  expected: string | null
  /** What they said, or null when they dropped a sound. */
  actual: string | null
  kind: 'match' | 'substitution' | 'insertion' | 'deletion'
  /** Feature-weighted cost, 0 = identical, 1 = maximally different. */
  cost: number
}

export interface ScoredWord {
  word: string
  /** Seconds, relative to the trimmed utterance. */
  start: number
  end: number
  /** 0..1. Drives the red/yellow/green colouring in step 3. */
  score: number
  diffs: PhonemeDiff[]
}

export interface RecognitionResult {
  /** Raw IPA of what was actually said, space-separated and uncorrected. */
  heard: string
  phonemes: RecognizedPhoneme[]
  /** Best guess. `code` is "unknown" when nothing fit well enough. */
  language: LanguageGuess
  /** Every candidate language, descending by confidence. */
  ranking: LanguageGuess[]
  /** True when the top two languages are too close to call. `es`/`it` will
   *  legitimately trip this; surface both rather than guessing. */
  ambiguous: boolean
  /** The candidate text they most likely meant, or null if nothing fit. */
  meant: string | null
  words: ScoredWord[]
  /** Length of the trimmed audio in milliseconds. */
  durationMs: number
  timings: {
    captureMs: number
    recognizeMs: number
    matchMs: number
  }
}

/** One phonemized entry in the lexicon we match against. */
export interface LexiconEntry {
  /** Orthographic form shown to the user. */
  text: string
  /** Reference pronunciation, space-separated phonemes. */
  phonemes: string[]
  /** Index into `phonemes` where each word starts. Single-word entries are [0]. */
  wordStarts: number[]
  /** The orthographic words, parallel to `wordStarts`. */
  words: string[]
}

export interface Lexicon {
  /** Keyed by ISO 639-1 language code. */
  [languageCode: string]: {
    name: string
    entries: LexiconEntry[]
  }
}
