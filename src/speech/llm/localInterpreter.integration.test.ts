/**
 * Live check against a real local server.
 *
 * Skipped unless LIVE_MODEL=1, because it needs LM Studio (or Ollama, or
 * llama-server) running with the model loaded, and a unit suite that depends on
 * a background service is a unit suite that fails for the wrong reasons.
 *
 *   LIVE_MODEL=1 npx vitest run localInterpreter.integration
 *
 * What it is really testing is the contract the prompt relies on: that a small
 * local model returns parseable JSON, keeps to the words it was given, and does
 * not quietly re-score the utterance. Those are the failure modes that would
 * corrupt the product rather than merely break it.
 */

import { describe, expect, it } from 'vitest'
import { createLocalCoach, pingLocalModel, DEFAULT_BASE_URL, DEFAULT_MODEL } from './localInterpreter'
import type { ClarityScoredWord } from '../scoring/wordClarity'

const LIVE = process.env.LIVE_MODEL === '1'
const baseUrl = process.env.LOCAL_MODEL_URL ?? DEFAULT_BASE_URL
const model = process.env.LOCAL_MODEL_ID ?? DEFAULT_MODEL

/** A learner saying "la mariposa" with an English r instead of a Spanish tap. */
const WORDS: ClarityScoredWord[] = [
  { word: 'la', start: 0, end: 0.2, score: 0.94, status: 'perfect', phonemes: ['l', 'a'], weakest: null },
  {
    word: 'mariposa',
    start: 0.2,
    end: 1.1,
    score: 0.54,
    status: 'imperfect',
    phonemes: ['m', 'a', 'ɹ', 'i', 'p', 'o', 's', 'a'],
    weakest: { symbol: 'ɹ', confidence: 0.31 },
  },
]

describe.runIf(LIVE)('local model, live', () => {
  it('is reachable and has the model loaded', async () => {
    const ping = await pingLocalModel({ baseUrl, model })
    // eslint-disable-next-line no-console
    console.log('ping:', ping.message, '| loaded:', ping.models.join(', ') || '(none)')
    expect(ping.ok).toBe(true)
  }, 20000)

  it('returns usable coaching for a mispronounced Spanish phrase', async () => {
    const coaching = await createLocalCoach({ baseUrl, model, timeoutMs: 120000 }).coach({
      transcript: 'la mariposa',
      heard: 'l a m a ɹ i p o s a',
      language: 'Spanish',
      words: WORDS,
    })

    // eslint-disable-next-line no-console
    console.log(JSON.stringify(coaching, null, 2))

    expect(coaching.translation).toBeTruthy()
    expect(coaching.translation?.toLowerCase()).toContain('butterfly')
    expect(coaching.summary.length).toBeGreaterThan(0)

    // The note must land on the word that actually scored badly, not the clean one.
    const words = coaching.notes.map((n) => n.word.toLowerCase())
    expect(words).toContain('mariposa')
    expect(words).not.toContain('la')
  }, 180000)

  it('stays quiet when every word was produced cleanly', async () => {
    const clean: ClarityScoredWord[] = WORDS.map((w) => ({
      ...w,
      score: 0.95,
      status: 'perfect',
      weakest: null,
    }))

    const coaching = await createLocalCoach({ baseUrl, model, timeoutMs: 120000 }).coach({
      transcript: 'la mariposa',
      heard: 'l a m a ɾ i p o s a',
      language: 'Spanish',
      words: clean,
    })

    // eslint-disable-next-line no-console
    console.log('clean utterance notes:', JSON.stringify(coaching.notes))

    // Inventing a fault in clean speech is the failure that would most damage
    // trust in the grade, so it is asserted rather than merely hoped for.
    expect(coaching.notes.length).toBe(0)
  }, 180000)
})
