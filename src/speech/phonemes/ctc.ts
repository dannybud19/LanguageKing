/**
 * CTC decoding that keeps what a transcript throws away.
 *
 * The acoustic model emits a distribution over 392 phoneme labels per ~20ms
 * frame. Decoding straight to a string discards the per-frame posteriors and
 * the frame indices -- which are precisely the two things needed to score
 * individual sounds and to colour individual words later. So this decoder
 * returns timings, confidences and runner-up labels alongside the symbols.
 */

import type { RecognizedPhoneme } from '../types'

/** The CTC blank. `<pad>` is id 0 in this model's vocab.json. */
export const BLANK_TOKEN = '<pad>'

const SPECIAL_TOKENS = new Set([BLANK_TOKEN, '<s>', '</s>', '<unk>'])

export interface DecodeOptions {
  /** Seconds of audio represented by one output frame. */
  secondsPerFrame: number
  /** How many runner-up labels to retain per phoneme. */
  alternates?: number
}

/**
 * Greedy CTC decode over a [frames, vocab] logit matrix.
 *
 * @param logits Flat row-major logits, length frames * vocabSize.
 * @param vocab  id -> symbol, indexed by token id.
 */
export function decodeGreedy(
  logits: Float32Array | number[],
  frames: number,
  vocabSize: number,
  vocab: string[],
  options: DecodeOptions,
): RecognizedPhoneme[] {
  const { secondsPerFrame, alternates = 2 } = options

  // Per-frame argmax plus softmax posterior of the winner.
  const best = new Int32Array(frames)
  const prob = new Float32Array(frames)
  // Runner-up ids per frame, retained so the matcher can recover from a single
  // bad argmax without re-running the model.
  const runnerUp: Array<Array<{ id: number; p: number }>> = []

  for (let t = 0; t < frames; t++) {
    const offset = t * vocabSize
    let max = -Infinity
    for (let v = 0; v < vocabSize; v++) {
      const x = logits[offset + v]
      if (x > max) max = x
    }
    // Softmax in one pass, shifted for numerical stability.
    let denom = 0
    for (let v = 0; v < vocabSize; v++) denom += Math.exp(logits[offset + v] - max)

    const scored: Array<{ id: number; p: number }> = []
    let argmax = 0
    let argmaxVal = -Infinity
    for (let v = 0; v < vocabSize; v++) {
      const x = logits[offset + v]
      if (x > argmaxVal) {
        argmaxVal = x
        argmax = v
      }
    }
    best[t] = argmax
    prob[t] = Math.exp(argmaxVal - max) / denom

    // Collect the top few excluding the winner, for `alternates`.
    if (alternates > 0) {
      for (let v = 0; v < vocabSize; v++) {
        if (v === argmax) continue
        const p = Math.exp(logits[offset + v] - max) / denom
        if (scored.length < alternates) {
          scored.push({ id: v, p })
          scored.sort((a, b) => b.p - a.p)
        } else if (p > scored[scored.length - 1].p) {
          scored[scored.length - 1] = { id: v, p }
          scored.sort((a, b) => b.p - a.p)
        }
      }
    }
    runnerUp.push(scored)
  }

  // Collapse runs of the same label, then drop blanks. Each surviving phoneme
  // remembers the frame span that produced it.
  const out: RecognizedPhoneme[] = []
  let t = 0
  while (t < frames) {
    const id = best[t]
    let end = t
    while (end + 1 < frames && best[end + 1] === id) end++

    const symbol = vocab[id]
    if (symbol !== undefined && !SPECIAL_TOKENS.has(symbol)) {
      let confidence = 0
      for (let k = t; k <= end; k++) confidence += prob[k]
      confidence /= end - t + 1

      // Take alternates from the most confident frame in the run.
      let peak = t
      for (let k = t; k <= end; k++) if (prob[k] > prob[peak]) peak = k

      out.push({
        symbol,
        start: t * secondsPerFrame,
        end: (end + 1) * secondsPerFrame,
        confidence,
        alternates: runnerUp[peak]
          .filter((a) => {
            const s = vocab[a.id]
            return s !== undefined && !SPECIAL_TOKENS.has(s)
          })
          .map((a) => ({ symbol: vocab[a.id], confidence: a.p })),
      })
    }
    t = end + 1
  }

  return out
}

/** Render decoded phonemes as the space-separated IPA string shown to the user. */
export function toIpaString(phonemes: RecognizedPhoneme[]): string {
  return phonemes.map((p) => p.symbol).join(' ')
}

/** Build the id -> symbol array the decoder needs from a vocab.json mapping. */
export function vocabFromJson(map: Record<string, number>): string[] {
  const size = Math.max(...Object.values(map)) + 1
  const vocab = new Array<string>(size)
  for (const [symbol, id] of Object.entries(map)) vocab[id] = symbol
  return vocab
}
