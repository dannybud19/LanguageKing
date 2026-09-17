/**
 * Aligns what the learner actually said against a reference pronunciation.
 *
 * This is where the per-word scores and the expected-vs-actual diffs come from.
 * Alignment is a weighted global alignment (Needleman-Wunsch) using the
 * articulatory substitution cost, so a near-miss costs little and nonsense
 * costs a lot. The backtrace tells us which sounds belong to which word, which
 * is what makes per-word colouring possible at all.
 */

import { gapCost, substitutionCost } from '../features/distance'
import type { LexiconEntry, PhonemeDiff, RecognizedPhoneme, ScoredWord } from '../types'

export interface MatchResult {
  /** Length-normalised similarity in 0..1; 1 is a perfect match. */
  score: number
  words: ScoredWord[]
  diffs: PhonemeDiff[]
  /** Raw alignment cost, before normalisation. Useful for debugging. */
  cost: number
}

type Op = 'match' | 'substitution' | 'insertion' | 'deletion'

interface AlignedOp {
  op: Op
  /** Index into the recognised phonemes, or -1 for a deletion. */
  actualIndex: number
  /** Index into the reference phonemes, or -1 for an insertion. */
  refIndex: number
  /** Cost used to choose the alignment path. */
  cost: number
  /**
   * Cost charged when scoring, which is not the same thing.
   *
   * Alignment wants a moderate gap cost so it prefers an honest deletion over a
   * nonsense substitution. Scoring wants the opposite: a sound you never said
   * is fully wrong. Sharing one number means silence scores 0.375 against every
   * word in every language, so the two are kept separate.
   */
  penalty: number
}

/** Scoring penalty for a sound that was dropped or added outright. */
const GAP_PENALTY = 1

/** A substitution this cheap is treated as correct rather than flagged. */
const MATCH_THRESHOLD = 0.08

/**
 * How much the acoustic model's own confidence contributes to a word's score.
 * Kept small: the phoneme match is the signal, confidence only distinguishes a
 * clearly-produced sound from a mumbled one.
 */
const CONFIDENCE_WEIGHT = 0.15

/** Align recognised phonemes against one lexicon entry. */
export function matchEntry(recognized: RecognizedPhoneme[], entry: LexiconEntry): MatchResult {
  const actual = recognized.map((p) => p.symbol)
  const ref = entry.phonemes
  const ops = align(actual, ref)

  const cost = ops.reduce((a, o) => a + o.cost, 0)
  const penalty = ops.reduce((a, o) => a + o.penalty, 0)
  const norm = Math.max(actual.length, ref.length, 1)
  // Normalising by the longer side stops a short candidate winning cheaply
  // against a long utterance.
  //
  // Note this score intentionally excludes acoustic confidence: language
  // identification must not conclude that a quiet speaker switched language.
  // Confidence is applied per word instead, where it means "mumbled".
  const score = clamp01(1 - penalty / norm)

  const diffs: PhonemeDiff[] = ops.map((o) => ({
    expected: o.refIndex >= 0 ? ref[o.refIndex] : null,
    actual: o.actualIndex >= 0 ? actual[o.actualIndex] : null,
    kind: o.op,
    cost: o.cost,
  }))

  return { score, words: scoreWords(ops, recognized, entry), diffs, cost }
}

/**
 * Weighted global alignment. Costs come from `substitutionCost`/`gapCost`, so
 * the aligner prefers an honest deletion over a nonsense substitution.
 */
function align(actual: string[], ref: string[]): AlignedOp[] {
  const n = actual.length
  const m = ref.length
  const d: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))

  for (let i = 1; i <= n; i++) d[i][0] = d[i - 1][0] + gapCost(actual[i - 1])
  for (let j = 1; j <= m; j++) d[0][j] = d[0][j - 1] + gapCost(ref[j - 1])

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const sub = d[i - 1][j - 1] + substitutionCost(actual[i - 1], ref[j - 1])
      const ins = d[i - 1][j] + gapCost(actual[i - 1])
      const del = d[i][j - 1] + gapCost(ref[j - 1])
      d[i][j] = Math.min(sub, ins, del)
    }
  }

  // Backtrace, recomputing each candidate to pick the move that was taken.
  const ops: AlignedOp[] = []
  let i = n
  let j = m
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0) {
      const c = substitutionCost(actual[i - 1], ref[j - 1])
      if (nearly(d[i][j], d[i - 1][j - 1] + c)) {
        ops.push({
          op: c <= MATCH_THRESHOLD ? 'match' : 'substitution',
          actualIndex: i - 1,
          refIndex: j - 1,
          cost: c,
          penalty: c,
        })
        i--
        j--
        continue
      }
    }
    if (i > 0) {
      const c = gapCost(actual[i - 1])
      if (nearly(d[i][j], d[i - 1][j] + c)) {
        ops.push({ op: 'insertion', actualIndex: i - 1, refIndex: -1, cost: c, penalty: GAP_PENALTY })
        i--
        continue
      }
    }
    // Remaining case: deletion.
    const c = gapCost(ref[j - 1])
    ops.push({ op: 'deletion', actualIndex: -1, refIndex: j - 1, cost: c, penalty: GAP_PENALTY })
    j--
  }

  return ops.reverse()
}

/**
 * Split the alignment into words using the entry's word boundaries, and give
 * each word a score and a time span.
 */
function scoreWords(
  ops: AlignedOp[],
  recognized: RecognizedPhoneme[],
  entry: LexiconEntry,
): ScoredWord[] {
  const wordOf = wordIndexByRefPosition(entry)
  const buckets: AlignedOp[][] = entry.words.map(() => [])

  // Insertions have no reference index, so they attach to whichever word the
  // alignment was in the middle of.
  let current = 0
  for (const op of ops) {
    if (op.refIndex >= 0) current = wordOf[op.refIndex] ?? current
    buckets[current]?.push(op)
  }

  return entry.words.map((word, w) => {
    const bucket = buckets[w] ?? []
    const refCount = bucket.filter((o) => o.refIndex >= 0).length
    const norm = Math.max(refCount, bucket.length, 1)
    const cost = bucket.reduce((a, o) => a + o.penalty, 0)
    const errors = bucket.filter((o) => o.penalty > MATCH_THRESHOLD).length

    // Intelligibility falls off faster than the average error does. One
    // slightly-off sound in ten leaves a word perfectly understandable; two
    // badly-off sounds in five does not, yet a plain mean rates that 0.79 --
    // green, for a word nobody could follow. Weighting the mean by how much of
    // the word went wrong keeps the per-word verdict in line with what a
    // listener would actually perceive.
    //
    // The entry-level score above deliberately skips this: ranking languages
    // wants a smooth comparative measure, not a perceptual verdict.
    const errorRate = errors / norm
    const similarity = clamp01(1 - (cost / norm) * (1 + errorRate))

    const spoken = bucket
      .filter((o) => o.actualIndex >= 0)
      .map((o) => recognized[o.actualIndex])
      .filter(Boolean)

    const meanConfidence = spoken.length
      ? spoken.reduce((a, p) => a + p.confidence, 0) / spoken.length
      : 0

    // A word nobody actually said scores zero regardless of alignment bookkeeping.
    const score = spoken.length
      ? clamp01(similarity * (1 - CONFIDENCE_WEIGHT + CONFIDENCE_WEIGHT * meanConfidence))
      : 0

    return {
      word,
      start: spoken.length ? Math.min(...spoken.map((p) => p.start)) : 0,
      end: spoken.length ? Math.max(...spoken.map((p) => p.end)) : 0,
      score,
      diffs: bucket.map((o) => ({
        expected: o.refIndex >= 0 ? entry.phonemes[o.refIndex] : null,
        actual: o.actualIndex >= 0 ? recognized[o.actualIndex]?.symbol ?? null : null,
        kind: o.op,
        cost: o.cost,
      })),
    }
  })
}

/** Reference phoneme index -> word index. */
function wordIndexByRefPosition(entry: LexiconEntry): number[] {
  const out = new Array<number>(entry.phonemes.length).fill(0)
  for (let p = 0; p < entry.phonemes.length; p++) {
    let w = 0
    for (let k = 0; k < entry.wordStarts.length; k++) {
      if (entry.wordStarts[k] <= p) w = k
      else break
    }
    out[p] = w
  }
  return out
}

const EPSILON = 1e-9
const nearly = (a: number, b: number) => Math.abs(a - b) < EPSILON
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)

export const _internal = { align, MATCH_THRESHOLD, CONFIDENCE_WEIGHT }
