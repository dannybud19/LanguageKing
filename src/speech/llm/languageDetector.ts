/**
 * Language identification: Gemma 4 listens to the recording and names the
 * language, the moment the learner stops speaking.
 *
 * This is the one place Gemma receives audio. E2B/E4B ship an audio encoder,
 * and hearing the words is what makes this reliable where the phoneme
 * inventory is not: a sentence of Italian is Italian no matter how few of
 * Italian's marker sounds a beginner manages to produce.
 *
 * It still never scores. Naming the language is a classification the model is
 * good at; grading pronunciation is a measurement it cannot make honestly,
 * and that stays with the acoustic track.
 *
 * Three choices keep it fast and honest:
 *
 * - Thinking is disabled. Gemma 4 otherwise sometimes reasons for several
 *   hundred tokens before a one-word answer, turning 0.4 s into 10 s.
 * - The answer is free text, not a schema-constrained enum. Constraining the
 *   output to a list of codes was measured to mislabel clear Spanish as "zh":
 *   the grammar forces the first token before the model has "said" the name.
 * - Confidence comes from the token probabilities, not from the model. Asked
 *   for a confidence, it answered 0.99 for every clip, right or wrong. The
 *   first-token distribution is a real probability and gives a ranking for
 *   free: "Spanish 0.46, Portuguese 0.34" is exactly the kind of close call
 *   the UI should admit to.
 */

import { encodeWav } from '../audio/encodeWav'
import { DEFAULT_BASE_URL, DEFAULT_MODEL } from './localInterpreter'
import { profileForName, profileForPrefix } from '../language/catalog'
import type { LanguageProfile } from '../language/inventory'

export const SYSTEM_PROMPT =
  "You identify the spoken language of an audio clip. Reply with only the language's English name, one word."

export interface DetectorOptions {
  baseUrl?: string
  model?: string
  /** Language ID is on the critical path, so give up quickly and fall back. */
  timeoutMs?: number
}

export interface DetectedLanguage {
  code: string
  name: string
  /** Probability mass Gemma put on this language's first token, 0..1. */
  probability: number
}

export interface GemmaDetection {
  /** Best first, only languages the app can name. Never empty. */
  ranking: DetectedLanguage[]
  /** Gemma's literal answer, for diagnostics. */
  answer: string
  latencyMs: number
}

interface TopLogprob {
  token: string
  logprob: number
}

interface ChatResponse {
  choices?: Array<{
    message?: { content?: string }
    logprobs?: { content?: Array<{ token: string; logprob: number; top_logprobs?: TopLogprob[] }> }
  }>
}

export function buildDetectRequest(wavBase64: string, model: string) {
  return {
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [{ type: 'input_audio', input_audio: { data: wavBase64, format: 'wav' } }],
      },
    ],
    temperature: 0,
    max_tokens: 6,
    chat_template_kwargs: { enable_thinking: false },
    logprobs: true,
    top_logprobs: 8,
  }
}

/**
 * Turn a chat response into a ranked list of languages.
 *
 * The ranking comes from the first token's top-k alternatives. Fragments that
 * resolve to the same language ("Port", "Portuguese") are summed; fragments
 * that resolve to nothing ("The", "None") are dropped. The full answer is
 * then used to make sure the language Gemma actually said is in the list, even
 * if the server returned no logprobs at all -- LM Studio, for one, may not.
 */
export function parseDetection(response: ChatResponse, latencyMs = 0): GemmaDetection | null {
  const choice = response.choices?.[0]
  const answer = (choice?.message?.content ?? '').trim()
  const first = choice?.logprobs?.content?.[0]

  const mass = new Map<string, { profile: LanguageProfile; p: number }>()
  for (const alt of first?.top_logprobs ?? []) {
    const profile = profileForPrefix(alt.token)
    if (!profile) continue
    const p = Math.exp(alt.logprob)
    const prev = mass.get(profile.code)
    mass.set(profile.code, { profile, p: (prev?.p ?? 0) + p })
  }

  const said = profileForName(answer.split(/\s+/)[0] ?? '')
  if (said && !mass.has(said.code)) {
    // No usable logprobs: the answer alone is all there is. Treat it as a
    // moderate, not certain, call.
    mass.set(said.code, { profile: said, p: first ? Math.exp(first.logprob) : 0.6 })
  }

  if (mass.size === 0) return null

  const ranking = [...mass.values()]
    .map(({ profile, p }) => ({ code: profile.code, name: profile.name, probability: Math.min(1, p) }))
    .sort((a, b) => b.probability - a.probability)

  return { ranking, answer, latencyMs }
}

/** Base64 of a byte buffer, chunked so long recordings do not overflow the call stack. */
export function toBase64(bytes: Uint8Array): string {
  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

/**
 * Ask the local model which language the recording is in.
 *
 * Resolves to null rather than throwing on any failure: language ID has a
 * working fallback (the phoneme inventory), so a missing server should
 * degrade the answer, not stop the pipeline.
 */
export async function detectLanguage(
  audio: Float32Array,
  sampleRate: number,
  options: DetectorOptions = {},
): Promise<GemmaDetection | null> {
  const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '')
  const model = options.model ?? DEFAULT_MODEL
  const timeoutMs = options.timeoutMs ?? 8000

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const started = performance.now()

  try {
    const wav = new Uint8Array(await encodeWav(audio, sampleRate).arrayBuffer())
    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify(buildDetectRequest(toBase64(wav), model)),
    })
    if (!response.ok) return null
    return parseDetection((await response.json()) as ChatResponse, performance.now() - started)
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
