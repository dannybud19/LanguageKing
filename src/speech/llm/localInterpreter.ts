/**
 * The coaching stage: Gemma 4 explains what the measurements mean.
 *
 * Three things about this boundary are deliberate.
 *
 * First, this stage never receives the audio. (Language identification, in
 * `languageDetector.ts`, does -- that is a separate request.) It gets the
 * transcript Whisper already produced, the raw IPA wav2vec2 actually heard, and
 * the per-word scores the acoustic track already computed.
 *
 * Second, Gemma never transcribes. Whisper heard the audio and is far better at
 * reading it back than a language model guessing from IPA. Asking Gemma to
 * transcribe would replace a good answer with a worse one.
 *
 * Third, and most importantly, Gemma never scores. A model trained to produce
 * plausible text will render "I sink so" as "I think so", erasing the very error
 * the app exists to report. Every number the learner sees is measured upstream
 * and passed through here untouched -- this stage only puts words to it.
 *
 * What is left is the one job Gemma is genuinely best at: turning a phoneme
 * diff into a sentence a learner can act on, and translating what they said.
 */

import type { ClarityScoredWord } from '../scoring/wordClarity'

/**
 * llama-server, started by `npm run model`. It is the default because it is
 * the runtime verified to pass audio through to Gemma 4 (with the mmproj file
 * loaded), which language detection needs. LM Studio (1234) and Ollama (11434)
 * speak the same protocol and work for coaching; set the URL in settings.
 */
export const DEFAULT_BASE_URL = 'http://127.0.0.1:8080'

/**
 * Default tag.
 *
 * Deliberately E4B rather than the 26B-A4B named in `gemmaAdapter.ts`. "A4B"
 * means 4B active parameters per token, so it infers at 4B speed -- but all 26B
 * of weights must still be resident, which is 14.4 GB at q4_0. This app runs
 * wav2vec2 and Whisper in the browser at the same time, competing for the same
 * unified memory, so the large variant does not fit on a 16 GB machine.
 * Coaching from a transcript plus a phoneme diff does not need it.
 */
export const DEFAULT_MODEL = 'gemma-4-e4b-it-qat'

export interface LocalCoachOptions {
  baseUrl?: string
  model?: string
  /** Abort a request that hangs, so one bad utterance cannot wedge the UI. */
  timeoutMs?: number
}

export interface CoachInput {
  /** What Whisper heard, forced to the identified language. */
  transcript: string
  /** Raw IPA of the sounds actually produced, uncorrected. */
  heard: string
  /** Display name of the identified language, e.g. "Spanish". */
  language: string
  /** Per-word acoustic scores. Already final -- the model cannot change them. */
  words: ClarityScoredWord[]
  /** True when two languages were too close to call. */
  ambiguous?: boolean
}

export interface Coaching {
  /** English gloss of the transcript. */
  translation: string | null
  /** One short, actionable note per word that needs work. */
  notes: Array<{ word: string; note: string }>
  /** One encouraging sentence about the utterance as a whole. */
  summary: string
}

const SYSTEM_PROMPT = `You are the coaching stage of an offline pronunciation-coaching app.

You are given, for one short utterance:
- "transcript": the words the learner said, already transcribed by a speech recogniser.
- "heard": the sounds they ACTUALLY produced, in IPA, written by a language-agnostic
  phoneme recogniser that never corrects mistakes.
- "words": each word with a clarity score from 0 to 100, already measured from the audio,
  and the single least clear sound within it.

Your job is to explain, in plain English, what a learner should do differently.

Hard rules:
- Do NOT re-transcribe. The transcript is correct; use it as given.
- Do NOT score, grade, re-rate or contradict the numbers. They were measured from audio
  you did not hear. If a word scored 54, it scored 54, even if it looks fine to you.
- Write a note ONLY for words that actually need work. A word that scored well needs no
  note. Never invent a problem to fill space.
- Each note is ONE short sentence, addressed to the learner, describing what differed and
  what to do. No IPA symbols, no phonetic jargon, no academic terms. Say "the r sound",
  not "the alveolar tap".
- The translation is of the transcript, into natural English.
- Be encouraging and specific. Never condescending.
- Reply with JSON only. No markdown fences, no commentary.

Output schema:
{
  "translation": "<English meaning of the transcript, or null>",
  "notes": [ { "word": "<the word, exactly as given>", "note": "<one short sentence>" } ],
  "summary": "<one encouraging sentence about the whole utterance>"
}`

export function formatCoachPrompt(input: CoachInput): string {
  const lines = [
    `language: ${input.language}`,
    `transcript: "${input.transcript}"`,
    `heard (IPA, uncorrected): "${input.heard}"`,
    'words:',
  ]
  for (const word of input.words) {
    const weakest = word.weakest
      ? `, least clear sound: "${word.weakest.symbol}" at ${Math.round(word.weakest.confidence * 100)}%`
      : ''
    lines.push(
      `  - { word: "${word.word}", clarity: ${Math.round(word.score * 100)}${weakest} }`,
    )
  }
  if (input.ambiguous) {
    lines.push('note: the language identification was not clear-cut for this utterance.')
  }
  return lines.join('\n')
}

/**
 * Pull the coaching out of a model response.
 *
 * Tolerant of markdown fences and stray prose because a local 4B model follows
 * "JSON only" less reliably than a hosted one, and losing a whole utterance to a
 * stray backtick is a bad trade.
 */
export function parseCoaching(text: string): Coaching {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const body = (fenced ? fenced[1] : text).trim()
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start === -1 || end === -1) {
    throw new Error(`No JSON object in response: ${text.slice(0, 200)}`)
  }

  const parsed = JSON.parse(body.slice(start, end + 1)) as Partial<Coaching>
  const notes = Array.isArray(parsed.notes) ? parsed.notes : []

  return {
    translation:
      typeof parsed.translation === 'string' && parsed.translation.trim()
        ? parsed.translation.trim()
        : null,
    notes: notes
      .filter(
        (n): n is { word: string; note: string } =>
          typeof n?.word === 'string' && typeof n?.note === 'string' && n.note.trim().length > 0,
      )
      .map((n) => ({ word: n.word, note: n.note.trim() })),
    summary: typeof parsed.summary === 'string' ? parsed.summary.trim() : '',
  }
}

export interface LocalCoach {
  coach(input: CoachInput): Promise<Coaching>
}

/**
 * Talk to a local server over the OpenAI-compatible chat API.
 *
 * LM Studio, Ollama and llama-server all serve this route, which is what lets
 * the endpoint be changed in settings without a code change.
 */
export function createLocalCoach(options: LocalCoachOptions = {}): LocalCoach {
  const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '')
  const model = options.model ?? DEFAULT_MODEL
  const timeoutMs = options.timeoutMs ?? 30000

  return {
    async coach(input) {
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
              { role: 'user', content: formatCoachPrompt(input) },
            ],
            // Zero temperature: the same measurements should produce the same
            // advice twice, or learners cannot trust it.
            temperature: 0,
            response_format: { type: 'json_object' },
            // Gemma 4 may otherwise think at length before the JSON, which
            // costs seconds and adds nothing to a one-sentence note.
            chat_template_kwargs: { enable_thinking: false },
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
        return parseCoaching(content)
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
  /** Model ids the server reports having loaded. */
  models: string[]
  /** True when the configured model is among them. */
  hasModel: boolean
  message: string
}

/**
 * Check a local server is up and report what it actually has loaded.
 *
 * Listing the models matters more than a bare reachability check: "connection
 * refused" and "running, but that model was never loaded" are different problems
 * with different fixes, and the second is otherwise only discoverable by
 * recording an utterance and getting a 404 back.
 */
export async function pingLocalModel(options: LocalCoachOptions = {}): Promise<PingResult> {
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
    // Servers vary on whether the tag carries a quantisation suffix.
    const hasModel = models.some((m) => m === model || m.startsWith(`${model}:`))

    return {
      ok: true,
      latencyMs,
      models,
      hasModel,
      message: hasModel
        ? `✓ ${model} ready — ${latencyMs}ms`
        : models.length > 0
          ? `Connected (${latencyMs}ms). Loaded: ${models.join(', ')}`
          : `Connected (${latencyMs}ms), but no model is loaded.`,
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
          : `Cannot reach ${baseUrl}. Is the local server running?`,
    }
  }
}

/**
 * Where local servers usually listen: llama-server (`npm run model`), LM
 * Studio, Ollama. Probed in this order when nothing is configured.
 */
export const CANDIDATE_ENDPOINTS = [
  'http://127.0.0.1:8080',
  'http://127.0.0.1:1234',
  'http://127.0.0.1:11434',
] as const

/**
 * Choose which of a server's models to talk to.
 *
 * The configured id wins if the server has it. Otherwise any Gemma model will
 * do: servers name the same weights differently (llama-server reports the
 * file path unless started with --alias, Ollama says "gemma4:e4b"), and
 * refusing to connect over a naming difference is what made the app report
 * "offline" with the model sitting right there.
 */
export function pickModel(models: string[], preferred: string = DEFAULT_MODEL): string | null {
  const exact = models.find((m) => m === preferred || m.startsWith(`${preferred}:`))
  if (exact) return exact
  const gemma = models.filter((m) => /gemma/i.test(m) && !/embed/i.test(m))
  // Prefer a Gemma 4 build when several are loaded.
  return gemma.find((m) => /gemma[-_ ]?4/i.test(m)) ?? gemma[0] ?? null
}

export interface LocalConnection {
  baseUrl: string
  model: string
  latencyMs: number
  /** Everything the server reported, for the model picker. */
  models: string[]
}

export interface ConnectResult {
  connection: LocalConnection | null
  /** One line per endpoint tried, for when nothing connected. */
  report: string[]
}

/**
 * Find a local server that actually has Gemma loaded.
 *
 * Every candidate is probed at once, so a dead port costs one timeout, not
 * three. The preferred endpoint wins ties, so a server the learner chose in
 * settings is kept even if another happens to be running too.
 */
export async function connectLocalModel(
  preferred: { baseUrl?: string; model?: string } = {},
): Promise<ConnectResult> {
  const first = preferred.baseUrl?.replace(/\/+$/, '')
  const endpoints = [...new Set([...(first ? [first] : []), ...CANDIDATE_ENDPOINTS])]
  const pings = await Promise.all(
    endpoints.map((baseUrl) => pingLocalModel({ baseUrl, model: preferred.model })),
  )

  const report: string[] = []
  for (let i = 0; i < endpoints.length; i++) {
    const ping = pings[i]
    const model = ping.ok ? pickModel(ping.models, preferred.model) : null
    if (model) {
      return {
        connection: { baseUrl: endpoints[i], model, latencyMs: ping.latencyMs, models: ping.models },
        report,
      }
    }
    report.push(
      ping.ok
        ? `${endpoints[i]}: server up, but no Gemma model loaded` +
            (ping.models.length ? ` (has ${ping.models.join(', ')})` : '')
        : `${endpoints[i]}: not reachable`,
    )
  }
  return { connection: null, report }
}

export const _internal = { SYSTEM_PROMPT }
