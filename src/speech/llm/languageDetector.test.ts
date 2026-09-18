import { describe, expect, it } from 'vitest'
import { buildDetectRequest, parseDetection, toBase64 } from './languageDetector'

/** A response shaped like llama-server's, first-token alternatives included. */
function response(content: string, tops: Array<[string, number]>) {
  return {
    choices: [
      {
        message: { content },
        logprobs: {
          content: [
            {
              token: tops[0][0],
              logprob: Math.log(tops[0][1]),
              top_logprobs: tops.map(([token, p]) => ({ token, logprob: Math.log(p) })),
            },
          ],
        },
      },
    ],
  }
}

describe('parseDetection', () => {
  it('ranks languages by first-token probability', () => {
    // Captured from Gemma 4 E4B on a synthesised Spanish clip.
    const detected = parseDetection(
      response('Spanish', [
        ['Spanish', 0.46],
        ['Portuguese', 0.34],
        ['Catal', 0.054],
        ['Ind', 0.028],
        ['French', 0.025],
      ]),
    )!
    expect(detected.ranking.map((r) => r.code)).toEqual(['es', 'pt', 'ca', 'id', 'fr'])
    expect(detected.ranking[0].probability).toBeCloseTo(0.46)
  })

  it('drops fragments that could be several languages', () => {
    // "Ind" can only be Indonesian; "I" could be any of several.
    const detected = parseDetection(response('Italian', [['Italian', 0.97], ['I', 0.02], ['Ind', 0.01]]))!
    expect(detected.ranking.map((r) => r.code)).toEqual(['it', 'id'])
  })

  it('sums fragments of the same language', () => {
    const detected = parseDetection(
      response('Portuguese', [['Portuguese', 0.9], ['Port', 0.05], ['French', 0.02]]),
    )!
    expect(detected.ranking[0]).toMatchObject({ code: 'pt' })
    expect(detected.ranking[0].probability).toBeCloseTo(0.95)
  })

  it('ignores tokens that are not languages', () => {
    const detected = parseDetection(response('English', [['English', 0.99], ['None', 0.005], ['The', 0.005]]))!
    expect(detected.ranking.map((r) => r.code)).toEqual(['en'])
  })

  it('falls back to the answer text when the server sends no logprobs', () => {
    const detected = parseDetection({ choices: [{ message: { content: 'German.' } }] })!
    expect(detected.ranking).toHaveLength(1)
    expect(detected.ranking[0].code).toBe('de')
    // Unknown certainty is reported as moderate, never as certain.
    expect(detected.ranking[0].probability).toBeLessThan(0.7)
  })

  it('accepts native names and scripts', () => {
    expect(parseDetection({ choices: [{ message: { content: '日本語' } }] })!.ranking[0].code).toBe('ja')
  })

  it('returns null when nothing names a language', () => {
    expect(parseDetection({ choices: [{ message: { content: 'I cannot tell.' } }] })).toBeNull()
    expect(parseDetection({})).toBeNull()
  })
})

describe('buildDetectRequest', () => {
  const body = buildDetectRequest('AAAA', 'gemma-4-e4b-it-qat')

  it('sends the audio as an OpenAI input_audio part', () => {
    const user = body.messages[1] as { content: Array<{ type: string; input_audio: { format: string } }> }
    expect(user.content[0].type).toBe('input_audio')
    expect(user.content[0].input_audio.format).toBe('wav')
  })

  it('disables thinking and asks for token probabilities', () => {
    expect(body.chat_template_kwargs.enable_thinking).toBe(false)
    expect(body.logprobs).toBe(true)
    expect(body.max_tokens).toBeLessThanOrEqual(8)
  })

  it('does not constrain the answer to a schema', () => {
    // A schema-constrained enum was measured to mislabel Spanish as "zh".
    expect(body).not.toHaveProperty('response_format')
  })
})

describe('toBase64', () => {
  it('matches the platform encoder, including past one chunk', () => {
    const bytes = new Uint8Array(70000).map((_, i) => (i * 31) % 256)
    expect(toBase64(bytes)).toBe(Buffer.from(bytes).toString('base64'))
  })
})
