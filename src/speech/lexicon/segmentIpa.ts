/**
 * Split an eSpeak IPA string into the discrete phoneme tokens the recogniser
 * uses.
 *
 * This matters more than it looks. The acoustic model emits labels drawn from a
 * fixed 392-symbol eSpeak vocabulary, 306 of which are more than one character
 * ("tʃ", "oʊ", "ɑːɹ", "e̞"). Splitting a reference pronunciation character by
 * character would produce tokens the model can never emit, so every comparison
 * would show spurious errors. Segmentation is therefore driven by the model's
 * own vocabulary, longest match first.
 *
 * The vocabulary contains no stress marks, so those are stripped rather than
 * being left to fail a lookup.
 */

/** Longest symbol in the vocabulary, in code points. */
const MAX_SYMBOL_LENGTH = 6

/** Stress, syllable and word-boundary marks: not segmental, not in the vocab. */
const NON_SEGMENTAL = /[ˈˌˑ|‖.\-_()[\]]/g

/** Combining diacritics, stripped only as a fallback when a lookup fails. */
const COMBINING = /[̀-ͯ]/g

export interface SegmentResult {
  phonemes: string[]
  /** Characters that matched nothing in the vocabulary. Non-empty means the
   *  reference is partly untrustworthy, which callers should surface, not hide. */
  unmatched: string[]
}

/**
 * Segment one IPA word into vocabulary tokens.
 *
 * @param vocabulary The recogniser's symbol set.
 */
export function segmentIpa(ipa: string, vocabulary: Set<string>): SegmentResult {
  const cleaned = ipa.replace(NON_SEGMENTAL, '')
  const chars = [...cleaned]
  const phonemes: string[] = []
  const unmatched: string[] = []

  let i = 0
  while (i < chars.length) {
    if (/\s/.test(chars[i])) {
      i++
      continue
    }

    let matched = false
    const maxLength = Math.min(MAX_SYMBOL_LENGTH, chars.length - i)

    // Longest match first: "tʃ" must win over "t", "ɑːɹ" over "ɑː".
    for (let length = maxLength; length >= 1; length--) {
      const candidate = chars.slice(i, i + length).join('')
      if (vocabulary.has(candidate)) {
        phonemes.push(candidate)
        i += length
        matched = true
        break
      }
    }
    if (matched) continue

    // Fallback: drop combining marks and retry. eSpeak emits refinements like
    // [ä] and [o̞] that the vocabulary may only carry in their plain form.
    for (let length = maxLength; length >= 1; length--) {
      const stripped = chars.slice(i, i + length).join('').normalize('NFD').replace(COMBINING, '')
      if (stripped && vocabulary.has(stripped)) {
        phonemes.push(stripped)
        i += length
        matched = true
        break
      }
    }
    if (matched) continue

    unmatched.push(chars[i])
    i++
  }

  return { phonemes, unmatched }
}

export interface SegmentedEntry {
  phonemes: string[]
  wordStarts: number[]
  unmatched: string[]
}

/**
 * Segment a whole phrase, keeping track of where each word begins.
 *
 * The word boundaries are what let the scorer attribute a mispronunciation to
 * one word rather than the whole sentence.
 */
export function segmentPhrase(ipaWords: string[], vocabulary: Set<string>): SegmentedEntry {
  const phonemes: string[] = []
  const wordStarts: number[] = []
  const unmatched: string[] = []

  for (const word of ipaWords) {
    wordStarts.push(phonemes.length)
    const segmented = segmentIpa(word, vocabulary)
    phonemes.push(...segmented.phonemes)
    unmatched.push(...segmented.unmatched)
  }

  return { phonemes, wordStarts, unmatched }
}
