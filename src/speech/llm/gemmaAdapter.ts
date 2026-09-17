/**
 * The interpretation stage: Gemma 4 decides what the learner meant.
 *
 * Two things about this boundary are deliberate.
 *
 * First, Gemma never receives the audio. It gets the IPA string and the
 * candidate words as text. That is why `gemma-4-26b-a4b-it` -- which has no
 * audio encoder, unlike the E2B/E4B/12B variants -- is a perfectly good choice
 * here, and why its MoE shape (25.2B total, ~3.8B active per token) makes it
 * fast for its size.
 *
 * Second, Gemma never scores pronunciation. The acoustic track does that. A
 * model trained to produce plausible text will render "I sink so" as "I think
 * so", erasing the very error the app exists to report.
 *
 * The cloud implementation below is for development. It is a network call per
 * utterance, which contradicts the offline premise, so a local llama.cpp or MLX
 * implementation replaces it behind this same interface before shipping --
 * 4-bit quants of this model are published for both.
 */

export interface Candidate {
  language: string
  text: string
  /** Reference pronunciation, space-separated phonemes. */
  reference: string
  score: number
}

export interface InterpretInput {
  /** Raw IPA of what was actually said. */
  heard: string
  candidates: Candidate[]
  /** Language being practised. */
  studying: string
  /** Learner's native language. */
  native: string
}

export interface Difference {
  expected: string
  actual: string
  position: number
  severity: 'minor' | 'moderate' | 'severe'
  note: string
}

export interface Interpretation {
  language: { code: string; confidence: number }
  meant: string | null
  ambiguous: boolean
  differences: Difference[]
  summary: string
}

export interface Interpreter {
  interpret(input: InterpretInput): Promise<Interpretation>
}

export const MODEL_ID = 'gemma-4-26b-a4b-it'

/** Kept in sync with prompts/interpret.md, which is also pasteable into AI Studio. */
const SYSTEM_PROMPT = `You are the interpretation stage of an offline pronunciation-coaching app.

A language-agnostic phoneme recogniser has already listened to the learner's speech and
written down the sounds they ACTUALLY made, in IPA. It does not know what language they
were attempting, and it never corrects mistakes.

Your job:
1. Decide which language the learner was ATTEMPTING. Weigh the acoustic match against
   \`studying\`, but do not blindly assume it - a genuine attempt at another language must
   win if the sounds clearly favour it.
2. Decide which candidate they MEANT.
3. Report what differed between \`heard\` and that candidate's reference IPA.

Hard rules:
- Choose only from \`candidates\`. Never invent a word. If nothing fits, return language
  "unknown" and confidence below 0.3.
- NEVER silently fix pronunciation. If they said [s] where a dental fricative was expected,
  that is the finding - not something to smooth over.
- Do not score the audio yourself. You did not hear it. Only compare the given strings.
- Reply with JSON only. No markdown fences, no commentary.

Output schema:
{
  "language":   { "code": "<iso639-1 or 'unknown'>", "confidence": <0..1> },
  "meant":      "<chosen candidate text, or null>",
  "ambiguous":  <true if the top two candidates are close>,
  "differences": [
    { "expected": "<ipa>", "actual": "<ipa>", "position": <int>,
      "severity": "minor" | "moderate" | "severe",
      "note": "<one short plain-English sentence>" }
  ],
  "summary": "<one encouraging sentence for the learner>"
}`

export function formatUserPrompt(input: InterpretInput): string {
  const lines = [
    `heard: "${input.heard}"`,
    `studying: "${input.studying}"`,
    `native: "${input.native}"`,
    'candidates:',
    ...input.candidates.map(
      (c) =>
        `  - { language: "${c.language}", text: "${c.text}", reference: "${c.reference}", score: ${c.score.toFixed(2)} }`,
    ),
  ]
  return lines.join('\n')
}

/**
 * Pull the JSON object out of a model response.
 *
 * Instructed not to use markdown fences, models sometimes do anyway, so this
 * tolerates them rather than failing the whole utterance.
 */
export function parseInterpretation(text: string): Interpretation {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const body = (fenced ? fenced[1] : text).trim()
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error(`No JSON object in response: ${text.slice(0, 200)}`)

  const parsed = JSON.parse(body.slice(start, end + 1)) as Partial<Interpretation>
  return {
    language: {
      code: parsed.language?.code ?? 'unknown',
      confidence: clamp01(parsed.language?.confidence ?? 0),
    },
    meant: parsed.meant ?? null,
    ambiguous: parsed.ambiguous ?? false,
    differences: Array.isArray(parsed.differences) ? parsed.differences : [],
    summary: typeof parsed.summary === 'string' ? parsed.summary : '',
  }
}

const clamp01 = (x: number) => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0)

export interface CloudInterpreterOptions {
  apiKey: string
  model?: string
  /** Endpoint override, so a local llama-server can be pointed at later. */
  baseUrl?: string
}

/**
 * Development implementation against the hosted API.
 *
 * Uses plain fetch rather than @google/genai so the same code path works for a
 * local OpenAI-compatible server (llama-server, LM Studio) by changing baseUrl.
 * No tools are enabled: web search would be both useless here and another
 * network dependency.
 */
export function createCloudInterpreter(options: CloudInterpreterOptions): Interpreter {
  const model = options.model ?? MODEL_ID
  const baseUrl =
    options.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'

  return {
    async interpret(input) {
      const response = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${options.apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: formatUserPrompt(input) },
          ],
          temperature: 0,
          response_format: { type: 'json_object' },
        }),
      })

      if (!response.ok) {
        throw new Error(`Interpreter request failed (${response.status}): ${await response.text()}`)
      }

      const json = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>
      }
      const content = json.choices?.[0]?.message?.content
      if (!content) throw new Error('Interpreter returned no content')
      return parseInterpretation(content)
    },
  }
}

/**
 * Stand-in used when no interpreter is configured. Reports the acoustic track's
 * own answer unchanged, so the pipeline stays usable without a model.
 */
export function createPassthroughInterpreter(): Interpreter {
  return {
    async interpret(input) {
      const best = input.candidates[0]
      return {
        language: { code: best?.language ?? 'unknown', confidence: best?.score ?? 0 },
        meant: best?.text ?? null,
        ambiguous: input.candidates.length > 1 && Math.abs((input.candidates[0]?.score ?? 0) - (input.candidates[1]?.score ?? 0)) < 0.05,
        differences: [],
        summary: '',
      }
    },
  }
}

export const _internal = { SYSTEM_PROMPT }
