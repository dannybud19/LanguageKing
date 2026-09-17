/**
 * IPA symbol -> articulatory feature vector.
 *
 * This exists so that phoneme comparison can tell a near-miss from nonsense.
 * A learner who says [s] for [θ] is close; one who says [k] for [θ] is not.
 * Flat edit distance scores those identically, which is why naive matching
 * fails on beginner speech.
 *
 * Features follow the usual binary/scalar phonological set. Place is a scalar
 * along the vocal tract, manner is decomposed into binary features, and vowels
 * use height/backness/rounding. Diphthongs additionally carry their offglide,
 * so [oʊ] vs [o] registers as a real but small difference -- exactly the kind
 * of error an English speaker makes attempting Spanish.
 */

export interface Features {
  /** 1 for vowels, 0 for consonants. Weighted heavily: swapping a vowel for a
   *  consonant is never a near-miss. */
  syllabic: number
  voiced: number

  // Consonantal
  /** Position along the vocal tract, 0 = bilabial .. 1 = glottal. */
  place: number
  continuant: number
  sonorant: number
  nasal: number
  lateral: number
  rhotic: number
  strident: number

  // Vocalic
  /** 0 = close .. 1 = open. */
  height: number
  /** 0 = front .. 1 = back. */
  back: number
  round: number
  /** Offglide of a diphthong, if any. */
  hasGlide: number
  glideHeight: number
  glideBack: number

  // Suprasegmental
  long: number
  nasalized: number
}

const PLACE = {
  bilabial: 0.0,
  labiodental: 0.08,
  dental: 0.18,
  alveolar: 0.25,
  postalveolar: 0.35,
  alveolopalatal: 0.4,
  retroflex: 0.45,
  palatal: 0.55,
  labiovelar: 0.62,
  velar: 0.7,
  uvular: 0.8,
  pharyngeal: 0.9,
  glottal: 1.0,
} as const

type Place = keyof typeof PLACE
type Manner =
  | 'stop'
  | 'affricate'
  | 'fricative'
  | 'sibilant'
  | 'nasal'
  | 'trill'
  | 'tap'
  | 'approximant'
  | 'lateral'
  | 'lateralFricative'

/** Manner -> the binary features it implies. */
const MANNER: Record<Manner, Partial<Features>> = {
  stop: { continuant: 0, sonorant: 0 },
  affricate: { continuant: 0, sonorant: 0, strident: 1 },
  fricative: { continuant: 1, sonorant: 0 },
  sibilant: { continuant: 1, sonorant: 0, strident: 1 },
  nasal: { continuant: 0, sonorant: 1, nasal: 1 },
  // Taps and trills involve brief complete closure, so they are not fully
  // continuant. This is what separates a Spanish [ɾ] from an English [ɹ] --
  // without it the two cost nothing to swap and the commonest accent error in
  // the language goes unreported.
  trill: { continuant: 0.5, sonorant: 1, rhotic: 1 },
  tap: { continuant: 0.3, sonorant: 1, rhotic: 1 },
  approximant: { continuant: 1, sonorant: 1 },
  lateral: { continuant: 1, sonorant: 1, lateral: 1 },
  lateralFricative: { continuant: 1, sonorant: 0, lateral: 1 },
}

const ZERO: Features = {
  syllabic: 0,
  voiced: 0,
  place: 0,
  continuant: 0,
  sonorant: 0,
  nasal: 0,
  lateral: 0,
  rhotic: 0,
  strident: 0,
  height: 0,
  back: 0,
  round: 0,
  hasGlide: 0,
  glideHeight: 0,
  glideBack: 0,
  long: 0,
  nasalized: 0,
}

function consonant(place: Place, manner: Manner, voiced: 0 | 1): Features {
  return { ...ZERO, syllabic: 0, voiced, place: PLACE[place], ...MANNER[manner] }
}

function vowel(height: number, back: number, round: 0 | 1): Features {
  return { ...ZERO, syllabic: 1, voiced: 1, sonorant: 1, continuant: 1, height, back, round }
}

/** Base inventory, covering en / es / fr / de / it / ja plus common neighbours. */
const CONSONANTS: Record<string, Features> = {
  // Plosives
  p: consonant('bilabial', 'stop', 0),
  b: consonant('bilabial', 'stop', 1),
  t: consonant('alveolar', 'stop', 0),
  d: consonant('alveolar', 'stop', 1),
  ʈ: consonant('retroflex', 'stop', 0),
  ɖ: consonant('retroflex', 'stop', 1),
  c: consonant('palatal', 'stop', 0),
  ɟ: consonant('palatal', 'stop', 1),
  k: consonant('velar', 'stop', 0),
  g: consonant('velar', 'stop', 1),
  ɡ: consonant('velar', 'stop', 1),
  q: consonant('uvular', 'stop', 0),
  ʔ: consonant('glottal', 'stop', 0),

  // Nasals
  m: consonant('bilabial', 'nasal', 1),
  ɱ: consonant('labiodental', 'nasal', 1),
  n: consonant('alveolar', 'nasal', 1),
  ɳ: consonant('retroflex', 'nasal', 1),
  ɲ: consonant('palatal', 'nasal', 1),
  ŋ: consonant('velar', 'nasal', 1),
  ɴ: consonant('uvular', 'nasal', 1),

  // Fricatives
  ɸ: consonant('bilabial', 'fricative', 0),
  β: consonant('bilabial', 'fricative', 1),
  f: consonant('labiodental', 'fricative', 0),
  v: consonant('labiodental', 'fricative', 1),
  θ: consonant('dental', 'fricative', 0),
  ð: consonant('dental', 'fricative', 1),
  s: consonant('alveolar', 'sibilant', 0),
  z: consonant('alveolar', 'sibilant', 1),
  ʃ: consonant('postalveolar', 'sibilant', 0),
  ʒ: consonant('postalveolar', 'sibilant', 1),
  ɕ: consonant('alveolopalatal', 'sibilant', 0),
  ʑ: consonant('alveolopalatal', 'sibilant', 1),
  ʂ: consonant('retroflex', 'sibilant', 0),
  ʐ: consonant('retroflex', 'sibilant', 1),
  ç: consonant('palatal', 'fricative', 0),
  ʝ: consonant('palatal', 'fricative', 1),
  x: consonant('velar', 'fricative', 0),
  ɣ: consonant('velar', 'fricative', 1),
  χ: consonant('uvular', 'fricative', 0),
  ʁ: consonant('uvular', 'fricative', 1),
  ħ: consonant('pharyngeal', 'fricative', 0),
  ʕ: consonant('pharyngeal', 'fricative', 1),
  h: consonant('glottal', 'fricative', 0),
  ɦ: consonant('glottal', 'fricative', 1),
  ɬ: consonant('alveolar', 'lateralFricative', 0),
  ɮ: consonant('alveolar', 'lateralFricative', 1),

  // Rhotics
  ɹ: { ...consonant('alveolar', 'approximant', 1), rhotic: 1 },
  ɻ: { ...consonant('retroflex', 'approximant', 1), rhotic: 1 },
  ɾ: consonant('alveolar', 'tap', 1),
  r: consonant('alveolar', 'trill', 1),
  ʀ: consonant('uvular', 'trill', 1),
  ⱱ: consonant('labiodental', 'tap', 1),

  // Laterals and approximants
  l: consonant('alveolar', 'lateral', 1),
  ɫ: consonant('velar', 'lateral', 1),
  ɭ: consonant('retroflex', 'lateral', 1),
  ʎ: consonant('palatal', 'lateral', 1),
  ʟ: consonant('velar', 'lateral', 1),
  j: consonant('palatal', 'approximant', 1),
  ɥ: { ...consonant('palatal', 'approximant', 1), round: 1 },
  w: { ...consonant('labiovelar', 'approximant', 1), round: 1 },
  ɰ: consonant('velar', 'approximant', 1),
  ʋ: consonant('labiodental', 'approximant', 1),
  ɓ: consonant('bilabial', 'stop', 1),
}

const VOWELS: Record<string, Features> = {
  i: vowel(0.0, 0.0, 0),
  y: vowel(0.0, 0.0, 1),
  ɪ: vowel(0.15, 0.1, 0),
  ʏ: vowel(0.15, 0.1, 1),
  e: vowel(0.3, 0.0, 0),
  ø: vowel(0.3, 0.0, 1),
  ɛ: vowel(0.45, 0.05, 0),
  œ: vowel(0.45, 0.05, 1),
  æ: vowel(0.6, 0.05, 0),
  a: vowel(0.85, 0.1, 0),
  ɶ: vowel(0.85, 0.1, 1),
  ɨ: vowel(0.0, 0.5, 0),
  ʉ: vowel(0.0, 0.5, 1),
  ɘ: vowel(0.3, 0.5, 0),
  ɵ: vowel(0.3, 0.5, 1),
  ə: vowel(0.45, 0.5, 0),
  ɜ: vowel(0.5, 0.5, 0),
  ɞ: vowel(0.5, 0.5, 1),
  ɐ: vowel(0.75, 0.5, 0),
  ɯ: vowel(0.0, 1.0, 0),
  u: vowel(0.0, 1.0, 1),
  ʊ: vowel(0.15, 0.9, 1),
  ɤ: vowel(0.3, 1.0, 0),
  o: vowel(0.3, 1.0, 1),
  ʌ: vowel(0.45, 1.0, 0),
  ɔ: vowel(0.45, 1.0, 1),
  ɑ: vowel(0.9, 1.0, 0),
  ɒ: vowel(0.9, 1.0, 1),
  // Rhotacised vowels (eSpeak uses these for English)
  ɚ: { ...vowel(0.45, 0.5, 0), rhotic: 1 },
  ɝ: { ...vowel(0.5, 0.5, 0), rhotic: 1 },
}

/** Combining/modifier characters we recognise and strip before table lookup. */
const MODIFIERS = {
  LONG: ['ː', ':', 'ˑ'],
  NASALIZED: ['̃'], // combining tilde
  VOICELESS: ['̥', '̊'],
  VOICED: ['̬'],
  PALATALIZED: ['ʲ'],
  LABIALIZED: ['ʷ'],
  ASPIRATED: ['ʰ'],
  SYLLABIC: ['̩', '̍'],
  /** Stress and tie bars carry no segmental information for our purposes. */
  IGNORED: ['ˈ', 'ˌ', "'", ',', '͡', '͜', '̆', '.', '-', 'ˤ', '̚'],
} as const

/** Tone digits (eSpeak marks Mandarin tone this way); not segmental. */
const TONE = /[0-9]/g

export interface ParsedPhoneme {
  features: Features
  /** True when the symbol was not in the inventory. */
  unknown: boolean
}

const cache = new Map<string, ParsedPhoneme>()

/**
 * Parse an eSpeak/IPA phoneme symbol into articulatory features.
 *
 * Handles length, nasalisation, palatalisation, devoicing, affricates written
 * as two characters (tʃ), and diphthongs written as two vowels (oʊ).
 */
export function parsePhoneme(symbol: string): ParsedPhoneme {
  const hit = cache.get(symbol)
  if (hit) return hit
  const parsed = parseUncached(symbol)
  cache.set(symbol, parsed)
  return parsed
}

function parseUncached(symbol: string): ParsedPhoneme {
  let s = symbol.normalize('NFD').replace(TONE, '')

  const flags = {
    long: 0,
    nasalized: 0,
    devoiced: false,
    revoiced: false,
    palatalized: false,
    labialized: false,
  }

  for (const c of MODIFIERS.LONG) if (s.includes(c)) flags.long = 1
  for (const c of MODIFIERS.NASALIZED) if (s.includes(c)) flags.nasalized = 1
  for (const c of MODIFIERS.VOICELESS) if (s.includes(c)) flags.devoiced = true
  for (const c of MODIFIERS.VOICED) if (s.includes(c)) flags.revoiced = true
  for (const c of MODIFIERS.PALATALIZED) if (s.includes(c)) flags.palatalized = true
  for (const c of MODIFIERS.LABIALIZED) if (s.includes(c)) flags.labialized = true

  const strip = [
    ...MODIFIERS.LONG,
    ...MODIFIERS.NASALIZED,
    ...MODIFIERS.VOICELESS,
    ...MODIFIERS.VOICED,
    ...MODIFIERS.PALATALIZED,
    ...MODIFIERS.LABIALIZED,
    ...MODIFIERS.ASPIRATED,
    ...MODIFIERS.SYLLABIC,
    ...MODIFIERS.IGNORED,
  ]
  for (const c of strip) s = s.split(c).join('')

  const chars = [...s]
  let features: Features | null = null
  let unknown = false

  if (chars.length === 0) {
    features = { ...ZERO }
    unknown = true
  } else if (chars.length === 1) {
    features = lookup(chars[0])
    if (!features) {
      features = { ...ZERO }
      unknown = true
    }
  } else {
    // Two or more segments: diphthong (vowel + vowel) or affricate (stop + fricative).
    const first = lookup(chars[0])
    const second = lookup(chars[1])
    if (first && second && first.syllabic === 1 && second.syllabic === 1) {
      features = { ...first, hasGlide: 1, glideHeight: second.height, glideBack: second.back }
    } else if (first && second && first.syllabic === 0 && second.syllabic === 0) {
      // Affricate: place of release, occlusive onset.
      features = { ...second, ...MANNER.affricate, place: second.place, voiced: first.voiced }
    } else if (first) {
      features = { ...first }
    } else if (second) {
      features = { ...second }
    } else {
      features = { ...ZERO }
      unknown = true
    }
  }

  const f: Features = { ...features }
  f.long = Math.max(f.long, flags.long)
  f.nasalized = Math.max(f.nasalized, flags.nasalized)
  if (flags.devoiced) f.voiced = 0
  if (flags.revoiced) f.voiced = 1
  // Palatalisation drags the place of articulation toward the palate;
  // labialisation adds rounding. Both are real but small differences.
  if (flags.palatalized && f.syllabic === 0) f.place = (f.place + PLACE.palatal) / 2
  if (flags.labialized) f.round = 1

  return { features: f, unknown }
}

function lookup(ch: string): Features | null {
  return VOWELS[ch] ?? CONSONANTS[ch] ?? null
}

/** True when the symbol is a vowel (used for syllable-aware alignment). */
export function isVowel(symbol: string): boolean {
  return parsePhoneme(symbol).features.syllabic === 1
}

export const _internal = { PLACE, CONSONANTS, VOWELS, ZERO }
