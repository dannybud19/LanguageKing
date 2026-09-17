/**
 * Language identification from the phoneme inventory actually produced.
 *
 * Free-form speech rules out matching against a word list, and the browser
 * cannot phonemise arbitrary text at runtime (piper-phonemize ships a
 * Node-only WASM build), so candidate-by-candidate comparison is unavailable
 * on this path. What remains, and what is genuinely diagnostic, is the sound
 * inventory itself: languages differ sharply in which phonemes they use.
 *
 * Spanish has [ɾ β θ x ɲ], French has nasal vowels and [ʁ y], German has
 * [ç pf ʏ], Italian has [ts dz ʎ], Japanese has [ɕ ɽ ɯ], English has
 * [ɹ ð æ ɪ ə] and its diphthongs. None of these lists is decisive alone, so
 * they are weighted evidence rather than rules.
 *
 * This keeps the original principle intact: the language is inferred from the
 * sounds the learner made, never from a language ID run on their accent.
 */

import type { LanguageGuess, RecognizedPhoneme } from '../types'

export interface LanguageProfile {
  code: string
  name: string
  flag: string
  /** BCP-47-ish tag for the UI and for speech synthesis. */
  tag: string
  /** Whisper's own language name, used to force the decode. */
  whisperName: string
  /** Phonemes that strongly indicate this language. */
  markers: string[]
  /** Phonemes consistent with the language but shared widely. */
  common: string[]
  /** Phonemes this language does not use; their presence is evidence against. */
  foreign: string[]
}

/**
 * Evidence weights. Markers carry real weight, common phonemes barely any
 * (nearly every language has [a] and [t]), and a foreign phoneme counts
 * against -- hearing [ɹ] in supposed Spanish is informative.
 */
const WEIGHT = { marker: 1, common: 0.25, foreign: -0.75, unlisted: 0 } as const

export const PROFILES: LanguageProfile[] = [
  {
    code: 'es',
    name: 'Spanish',
    flag: '🇪🇸',
    tag: 'es-ES',
    whisperName: 'spanish',
    markers: ['ɾ', 'β', 'θ', 'x', 'ɲ', 'ʎ', 'ð'],
    common: ['a', 'e', 'i', 'o', 'u', 'p', 't', 'k', 'b', 'd', 'g', 'ɡ', 'm', 'n', 's', 'l', 'r', 'f', 'tʃ', 'j', 'w'],
    foreign: ['ʃ', 'ʒ', 'z', 'ɹ', 'æ', 'ɪ', 'ʊ', 'ə', 'ø', 'y', 'ɑ̃', 'ɚ', 'oʊ', 'eɪ', 'ʌ', 'ç', 'ɕ', 'ɽ', 'ɛ', 'ɔ', 'v'],
  },
  {
    code: 'fr',
    name: 'French',
    flag: '🇫🇷',
    tag: 'fr-FR',
    whisperName: 'french',
    markers: ['ɑ̃', 'ɛ̃', 'ɔ̃', 'œ̃', 'ʁ', 'y', 'ø', 'œ', 'ɥ'],
    common: ['a', 'e', 'i', 'o', 'u', 'ɛ', 'ɔ', 'ə', 'p', 't', 'k', 'b', 'd', 'g', 'ɡ', 'm', 'n', 's', 'z', 'ʃ', 'ʒ', 'f', 'v', 'l', 'j', 'w'],
    foreign: ['θ', 'ð', 'ɾ', 'h', 'æ', 'ɪ', 'ʊ', 'ɹ', 'oʊ', 'eɪ', 'ʌ', 'ɚ', 'ç', 'ɕ', 'ɽ', 'β', 'x', 'ʎ'],
  },
  {
    code: 'de',
    name: 'German',
    flag: '🇩🇪',
    tag: 'de-DE',
    whisperName: 'german',
    markers: ['ç', 'pf', 'ʏ', 'øː', 'yː', 'ts', 'x', 'ɐ'],
    // [ɾ] belongs here, not in `foreign`: eSpeak's German voice renders <r> as
    // [ɾ], and since the acoustic model was trained on eSpeak labels it emits
    // the same. Profiles must match what the recogniser actually produces, not
    // what a textbook inventory says.
    common: ['a', 'e', 'i', 'o', 'u', 'ɛ', 'ɔ', 'ə', 'y', 'ø', 'p', 't', 'k', 'b', 'd', 'g', 'ɡ', 'm', 'n', 'ŋ', 's', 'z', 'ʃ', 'f', 'v', 'l', 'j', 'h', 'ʁ', 'ɾ'],
    foreign: ['θ', 'ð', 'w', 'ʎ', 'æ', 'ɹ', 'oʊ', 'eɪ', 'ɚ', 'ɕ', 'ɽ', 'β'],
  },
  {
    code: 'it',
    name: 'Italian',
    flag: '🇮🇹',
    tag: 'it-IT',
    whisperName: 'italian',
    markers: ['ts', 'dz', 'ʎ', 'ɲ', 'dʒ', 'tʃ'],
    common: ['a', 'e', 'i', 'o', 'u', 'ɛ', 'ɔ', 'p', 't', 'k', 'b', 'd', 'g', 'ɡ', 'm', 'n', 's', 'z', 'ʃ', 'f', 'v', 'l', 'r', 'j', 'w'],
    foreign: ['θ', 'x', 'β', 'ɹ', 'y', 'ø', 'ɑ̃', 'ʊ', 'ɪ', 'ə', 'æ', 'oʊ', 'eɪ', 'ɚ', 'ʌ', 'ç', 'ɕ', 'ɽ', 'ʁ'],
  },
  {
    code: 'ja',
    name: 'Japanese',
    flag: '🇯🇵',
    tag: 'ja-JP',
    whisperName: 'japanese',
    markers: ['ɕ', 'tɕ', 'dʑ', 'ɸ', 'ɽ', 'ɯ', 'ɰ'],
    common: ['a', 'i', 'u', 'e', 'o', 'k', 's', 't', 'n', 'h', 'm', 'j', 'ɾ', 'w', 'g', 'ɡ', 'z', 'd', 'b', 'p', 'ŋ', 'ç', 'ts'],
    foreign: ['θ', 'ð', 'v', 'l', 'ɹ', 'æ', 'ɪ', 'ʊ', 'ə', 'ɑ̃', 'y', 'ø', 'oʊ', 'eɪ', 'ɚ', 'ʌ', 'β', 'x', 'ʎ', 'ʁ', 'ɛ', 'ɔ'],
  },
  {
    code: 'en',
    name: 'English',
    flag: '🇬🇧',
    tag: 'en-US',
    whisperName: 'english',
    markers: ['ɹ', 'ð', 'æ', 'ɪ', 'ʊ', 'ɚ', 'ʌ', 'oʊ', 'eɪ', 'aɪ', 'aʊ', 'ɝ', 'ɜ'],
    common: ['ə', 'θ', 'p', 't', 'k', 'b', 'd', 'g', 'ɡ', 'm', 'n', 'ŋ', 'f', 'v', 's', 'z', 'ʃ', 'ʒ', 'tʃ', 'dʒ', 'h', 'l', 'w', 'j', 'i', 'u', 'ɛ', 'ɔ', 'ɑ'],
    foreign: ['β', 'ɾ', 'x', 'ɲ', 'ʎ', 'ç', 'ɕ', 'ɽ', 'ɑ̃', 'ɛ̃', 'y', 'ø', 'œ', 'ʁ', 'ɯ', 'pf'],
  },
]

export const PROFILE_BY_CODE = new Map(PROFILES.map((p) => [p.code, p]))

interface Lookup {
  marker: Set<string>
  common: Set<string>
  foreign: Set<string>
}

const LOOKUPS = new Map<string, Lookup>(
  PROFILES.map((p) => [
    p.code,
    { marker: new Set(p.markers), common: new Set(p.common), foreign: new Set(p.foreign) },
  ]),
)

/**
 * Raw inventory evidence for one language, normalised to 0..1.
 *
 * Each phoneme votes, weighted by how confidently it was heard -- a sound the
 * acoustic model was unsure of should not swing the language decision.
 */
export function inventoryScore(phonemes: RecognizedPhoneme[], code: string): number {
  const lookup = LOOKUPS.get(code)
  if (!lookup || phonemes.length === 0) return 0

  let evidence = 0
  let weight = 0

  for (const p of phonemes) {
    // Confidence-weighted so a mumbled sound counts for less.
    const w = Math.max(0.05, p.confidence)
    weight += w

    let vote: number = WEIGHT.unlisted
    if (lookup.marker.has(p.symbol)) vote = WEIGHT.marker
    else if (lookup.common.has(p.symbol)) vote = WEIGHT.common
    else if (lookup.foreign.has(p.symbol)) vote = WEIGHT.foreign
    else {
      // Not listed anywhere: fall back to the runner-up labels, since a
      // marker sound misheard as something unlisted is still weak evidence.
      const alt = p.alternates.find(
        (a) => lookup.marker.has(a.symbol) || lookup.common.has(a.symbol),
      )
      if (alt) vote = lookup.marker.has(alt.symbol) ? WEIGHT.marker * 0.4 : WEIGHT.common * 0.4
    }
    evidence += vote * w
  }

  if (weight === 0) return 0
  const mean = evidence / weight
  // Map [foreign .. marker] onto 0..1.
  return clamp01((mean - WEIGHT.foreign) / (WEIGHT.marker - WEIGHT.foreign))
}

export interface IdentifyOptions {
  /** Restrict to these language codes. Defaults to every profile. */
  codes?: string[]
  /**
   * Language the learner is practising, if known.
   *
   * The product is specified as zero-config, so normally nothing is known and
   * this stays unset. It exists because inventory evidence cannot recover the
   * intended language when a beginner's pronunciation is entirely in their
   * native phonetics -- there is simply no trace of the target language in the
   * sounds. Where the app does know, this prior tips marginal calls.
   *
   * It is a tie-breaker, not an override. Because scores go through
   * exp(score / temperature), a 1.8x prior is worth only about a 6% score
   * bonus -- enough to separate Spanish from Italian, nowhere near enough to
   * call something Spanish that was said entirely with English sounds. That
   * asymmetry is deliberate: a confident wrong language is worse than an
   * honest "that came out as English".
   */
  studying?: string
  studyingPrior?: number
  /** Learner's native language, kept as a candidate and mildly boosted. */
  native?: string
  nativePrior?: number
  /** Softmax temperature over inventory scores. Lower = sharper. */
  temperature?: number
  ambiguityThreshold?: number
  /** Inventory score below which we refuse to name a language. */
  minScore?: number
}

const DEFAULTS = {
  studyingPrior: 1.8,
  nativePrior: 1.1,
  temperature: 0.1,
  ambiguityThreshold: 0.12,
  minScore: 0.35,
} as const

export interface IdentifyResult {
  language: LanguageGuess
  ranking: LanguageGuess[]
  ambiguous: boolean
  profile: LanguageProfile | null
}

const UNKNOWN: LanguageGuess = { code: 'unknown', name: 'Unknown', confidence: 0, acousticScore: 0 }

/** Rank candidate languages by how well their inventory explains the sounds. */
export function identifyFromInventory(
  phonemes: RecognizedPhoneme[],
  options: IdentifyOptions = {},
): IdentifyResult {
  const opts = { ...DEFAULTS, ...options }
  const candidates = (opts.codes ? PROFILES.filter((p) => opts.codes!.includes(p.code)) : PROFILES)

  if (phonemes.length === 0 || candidates.length === 0) {
    return { language: UNKNOWN, ranking: [], ambiguous: false, profile: null }
  }

  const scored = candidates.map((p) => ({ profile: p, score: inventoryScore(phonemes, p.code) }))

  const weights = scored.map((s) => {
    const prior =
      s.profile.code === opts.studying
        ? opts.studyingPrior
        : s.profile.code === opts.native
          ? opts.nativePrior
          : 1
    return Math.exp(s.score / opts.temperature) * prior
  })
  const total = weights.reduce((a, b) => a + b, 0)

  const ranking: LanguageGuess[] = scored
    .map((s, i) => ({
      code: s.profile.code,
      name: s.profile.name,
      confidence: total > 0 ? weights[i] / total : 0,
      acousticScore: s.score,
    }))
    .sort((a, b) => b.confidence - a.confidence)

  const top = ranking[0]
  const second = ranking[1]
  const ambiguous = second ? top.confidence - second.confidence < opts.ambiguityThreshold : false

  if (top.acousticScore < opts.minScore) {
    return { language: { ...UNKNOWN, confidence: top.confidence }, ranking, ambiguous, profile: null }
  }

  return {
    language: top,
    ranking,
    ambiguous,
    profile: PROFILE_BY_CODE.get(top.code) ?? null,
  }
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)

export const _internal = { WEIGHT, DEFAULTS }
