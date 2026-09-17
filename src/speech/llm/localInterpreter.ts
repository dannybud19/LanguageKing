/**
 * Interpretation against a local OpenAI-compatible server (Ollama, llama-server,
 * LM Studio). No API key, no cloud, no data leaving the machine.
 *
 * This is the free-speech counterpart to `gemmaAdapter.ts`. That module assumes a
 * lexicon supplies candidate words and instructs the model to choose among them.
 * The product is specified as "speak freely -- no forced scripts", so on this path
 * there are no candidates and the model must go from IPA to words directly.
 *
 * That inverts one of the original rules ("never invent a word") because there is
 * no list to choose from. The rule that actually protects the product is the other
 * one, and it is preserved absolutely: the model NEVER scores. Pronunciation
 * quality comes from the acoustic confidences in `score.ts` and nothing the model
 * returns can change a single point of it. The model only names what was said.
 */

import type { LanguageGuess } from '../types'

/** Ollama's default. Also where llama-server and LM Studio are usually pointed. */
export const DEFAULT_BASE_URL = 'http://127.0.0.1:11434'

/**
 * Default tag. Deliberately a small, widely-published Gemma rather than the
 * 26B MoE named in `gemmaAdapter.ts`: this one actually pulls and responds in
 * about a second on a laptop. Override it in settings -- `listLocalModels`
 * reports what the server really has installed.
 */
export const DEFAULT_MODEL = 'gemma3:4b'

export interface LocalInterpreterOptions {
  baseUrl?: string
  model?: string
  /** Abort a request that hangs, so one bad utterance cannot wedge the UI. */
  timeoutMs?: number
}

export interface FreeSpeechInput {
  /** Raw IPA of what was actually said, uncorrected. */
  heard: string
  /** Inventory-based language ranking from the acoustic track. */
  ranking: LanguageGuess[]
  /** Language being practised, if the app happens to know. Usually unset. */
  studying?: string
  /** Learner's native language. */
  native?: string
}

/** One orthographic word the model believes it found in the IPA stream. */
export interface ReadWord {
  word: string
  /** The slice of `heard` the model attributes to this word, space-separated. */
  ipa: string
  /** Plain-English note, only when something was off. */
  note?: string
}

export interface FreeSpeechReading {
  language: { code: string; confidence: number }
  /** What the learner appears to have said, or null if it could not be read. */
  text: string | null
  /** English gloss, for the learner. */
  translation: string | null
  words: ReadWord[]
  summary: string
}

const SYSTEM_PROMPT = `You are the interpretation stage of an offline pronunciation-coaching app.

A language-agnostic phoneme recogniser has already listened to the learner and written
down the sounds they ACTUALLY made, in IPA. It does not know what language they were
attempting, and it never corrects mistakes. A separate acoustic stage has ranked which
languages those sounds are consistent with.

Your job:
1. Decide which language the learner was attempting. The supplied ranking is evidence,
   not an answer -- it comes from phoneme inventory alone and it can be wrong.
2. Read the IPA back into ordinary written words in that language.
3. Split the IPA across those words, so each word carries the sounds it accounts for.
4. Translate what they said into English.

Hard rules:
- NEVER silently fix pronunciation. If they said [s] where a dental fricative belongs,
  write the word they were reaching for and say so in that word's note. Do not pretend
  the sounds were correct, and do not rewrite the IPA to what it should have been.
- The "ipa" you assign to each word must be taken from the input, in order, with nothing
  added or substituted. Concatenated in order, the words' ipa must reproduce the input.
- Do NOT score, grade, rate or judge how good the pronunciation was. You did not hear the
  audio. Another stage measures that. Notes describe WHAT differed, never HOW WELL.
- If the sounds do not read as any real utterance, return language "unknown", text null,
  and an empty words array. An honest blank beats a confident invention.
- Reply with JSON only. No markdown fences, no commentary.

Output schema:
{
  "language":    { "code": "<iso639-1 or 'unknown'>", "confidence": <0..1> },
  "text":        "<what they said, in normal orthography, or null>",
  "translation": "<English gloss, or null>",
  "words": [
    { "word": "<orthographic word>", "ipa": "<its slice of the input ipa>",
      "note": "<optional: one short plain-English sentence on what differed>" }
  ],
  "summary": "<one encouraging sentence for the learner>"
}`

export function formatFreeSpeechPrompt(input: FreeSpeechInput): string {
  const lines = [`heard: "${input.heard}"`]
  if (input.studying) lines.push(`studying: "${input.studying}"`)
  if (input.native) lines.push(`native: "${input.native}"`)
  lines.push('acoustic language ranking (inventory evidence only):')
  for (const guess of input.ranking.slice(0, 4)) {
    lines.push(`  - { code: "${guess.code}", name: "${guess.name}", score: ${guess.acousticScore.toFixed(2)} }`)
  }
  return lines.join('\n')
}

const clamp01 = (x: number) => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0)

/**
 * Pull the reading out of a model response.
 *
 * Tolerant of markdown fences and stray prose because a local 4B model follows
 * "JSON only" less reliably than a hosted one, and losing a whole utterance to a
 * stray backtick is a bad trade.
 */
export function parseReading(text: string): FreeSpeechReading {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const body = (fenced ? fenced[1] : text).trim()
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start === -1 || end === -1) {
    throw new Error(`No JSON object in response: ${text.slice(0, 200)}`)
  }

  const parsed = JSON.parse(body.slice(start, end + 1)) as Partial<FreeSpeechReading>
  const words = Array.isArray(parsed.words) ? parsed.words : []

  return {
    language: {
      code: parsed.language?.code ?? 'unknown',
      confidence: clamp01(parsed.language?.confidence ?? 0),
    },
    text: typeof parsed.text === 'string' && parsed.text.trim() ? parsed.text : null,
    translation:
      typeof parsed.translation === 'string' && parsed.translation.trim()
        ? parsed.translation
        : null,
    words: words
      .filter((w): w is ReadWord => typeof w?.word === 'string')
      .map((w) => ({
        word: w.word,
        ipa: typeof w.ipa === 'string' ? w.ipa : '',
        note: typeof w.note === 'string' && w.note.trim() ? w.note : undefined,
      })),
    summary: typeof parsed.summary === 'string' ? parsed.summary : '',
  }
}

export interface FreeSpeechInterpreter {
  read(input: FreeSpeechInput): Promise<FreeSpeechReading>
}

/**
 * Talk to a local server over the OpenAI-compatible chat API.
 *
 * Ollama serves this at /v1/chat/completions alongside its native API; so do
 * llama-server and LM Studio. Using it rather than Ollama's native /api/chat is
 * what lets the endpoint be swapped in settings without a code change.
 */
export function createLocalInterpreter(
  options: LocalInterpreterOptions = {},
): FreeSpeechInterpreter {
  const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '')
  const model = options.model ?? DEFAULT_MODEL
  const timeoutMs = options.timeoutMs ?? 30000

  return {
    async read(input) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)

      try {
        const response = await fetch(`${baseUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: SYSTEM_PROMPT },
              { role: 'user', content: formatFreeSpeechPrompt(input) },
            ],
            // Zero temperature: this is a reading task, not a creative one, and
            // a resampled reading of the same sounds should not change.
            temperature: 0,
            response_format: { type: 'json_object' },
          }),
        })

        if (!response.ok) {
          const detail = await response.text()
          throw new Error(`Local model request failed (${response.status}): ${detail.slice(0, 300)}`)
        }

        const json = (await response.json()) as {
          choices?: Array<{ message?: { content?: string } }>
        }
        const content = json.choices?.[0]?.message?.content
        if (!content) throw new Error('Local model returned no content')
        return parseReading(content)
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') {
          throw new Error(`Local model did not respond within ${timeoutMs}ms`)
        }
        throw e
      } finally {
        clearTimeout(timer)
      }
    },
  }
}

export interface PingResult {
  ok: boolean
  /** Round-trip time in milliseconds. */
  latencyMs: number
  /** Model tags the server reports having installed. */
  models: string[]
  /** True when the configured model is among them. */
  hasModel: boolean
  message: string
}

/**
 * Check a local server is up and report what it actually has installed.
 *
 * Listing the models matters more than a bare reachability check: "connection
 * refused" and "connected, but that model was never pulled" are different
 * problems with different fixes, and the second one is otherwise only
 * discoverable by recording an utterance and getting a 404.
 */
export async function pingLocalModel(
  options: LocalInterpreterOptions = {},
): Promise<PingResult> {
  const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '')
  const model = options.model ?? DEFAULT_MODEL
  const started = performance.now()

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 4000)
    const response = await fetch(`${baseUrl}/v1/models`, { signal: controller.signal })
    clearTimeout(timer)

    const latencyMs = Math.round(performance.now() - started)

    if (!response.ok) {
      return {
        ok: false,
        latencyMs,
        models: [],
        hasModel: false,
        message: `${response.status} from ${baseUrl}`,
      }
    }

    const json = (await response.json()) as { data?: Array<{ id?: string }> }
    const models = (json.data ?? []).map((m) => m.id ?? '').filter(Boolean)
    // Ollama reports "gemma3:4b"; a bare "gemma3" in settings should still count.
    const hasModel = models.some((m) => m === model || m.startsWith(`${model}:`))

    return {
      ok: true,
      latencyMs,
      models,
      hasModel,
      message: hasModel
        ? `✓ ${model} ready — ${latencyMs}ms`
        : `Connected (${latencyMs}ms), but ${model} is not installed. Run: ollama pull ${model}`,
    }
  } catch (e) {
    return {
      ok: false,
      latencyMs: Math.round(performance.now() - started),
      models: [],
      hasModel: false,
      message:
        e instanceof Error && e.name === 'AbortError'
          ? `No response from ${baseUrl}`
          : `Cannot reach ${baseUrl}. Is the server running?`,
    }
  }
}

export const _internal = { SYSTEM_PROMPT }
