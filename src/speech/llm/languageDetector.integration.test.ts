/**
 * Live check: Gemma 4 hears real audio and names the language.
 *
 * Skipped unless LIVE_MODEL=1, and needs macOS: the clips are synthesised with
 * the system `say` voices so no audio fixtures live in the repo.
 *
 *   npm run model                       # in another terminal
 *   LIVE_MODEL=1 npx vitest run languageDetector.integration
 *
 * Synthetic voices are cleaner than learners, so a pass here is a floor, not
 * proof. What it does catch is the pipeline breaking: the server not having
 * the audio encoder loaded, thinking mode swallowing the answer, or the
 * parser no longer recognising what the model says.
 */

import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { detectLanguage } from './languageDetector'
import { DEFAULT_BASE_URL, DEFAULT_MODEL } from './localInterpreter'

const LIVE = process.env.LIVE_MODEL === '1' && process.platform === 'darwin'
const baseUrl = process.env.LOCAL_MODEL_URL ?? DEFAULT_BASE_URL
const model = process.env.LOCAL_MODEL_ID ?? DEFAULT_MODEL

const CLIPS: Array<[code: string, voice: string, text: string]> = [
  ['es', 'Monica', 'Buenos días, me gustaría un café con leche, por favor.'],
  ['fr', 'Thomas', "Bonjour, je voudrais un croissant et un café, s'il vous plaît."],
  ['de', 'Anna', 'Guten Morgen, ich hätte gern einen Kaffee mit Milch.'],
  ['it', 'Alice', 'Buongiorno, vorrei un cappuccino e un cornetto, per favore.'],
  ['ja', 'Kyoko', 'おはようございます。コーヒーを一つください。'],
  ['pt', 'Luciana', 'Bom dia, eu gostaria de um café com leite, por favor.'],
  ['en', 'Samantha', 'Good morning, I would like a coffee with milk, please.'],
]

/** Synthesise speech to 16 kHz mono float samples. */
function speak(voice: string, text: string): Float32Array {
  const dir = mkdtempSync(join(tmpdir(), 'lk-'))
  const aiff = join(dir, 'clip.aiff')
  const wav = join(dir, 'clip.wav')
  execFileSync('say', ['-v', voice, '-o', aiff, text])
  execFileSync('afconvert', ['-f', 'WAVE', '-d', 'LEI16@16000', '-c', '1', aiff, wav])
  const bytes = readFileSync(wav)
  // Find the data chunk rather than assuming a 44-byte header: afconvert
  // writes extra chunks.
  const dataAt = bytes.indexOf('data') + 8
  const pcm = new Int16Array(bytes.buffer, bytes.byteOffset + dataAt, (bytes.length - dataAt) >> 1)
  return Float32Array.from(pcm, (s) => s / 0x8000)
}

describe.runIf(LIVE)('Gemma language detection, live', () => {
  for (const [code, voice, text] of CLIPS) {
    it(`hears ${code}`, async () => {
      const detected = await detectLanguage(speak(voice, text), 16000, { baseUrl, model })
      expect(detected, 'no answer: is the server up with --mmproj?').not.toBeNull()
      expect(detected!.ranking[0].code).toBe(code)
      // "Immediately": well under the time Whisper takes.
      expect(detected!.latencyMs).toBeLessThan(3000)
    }, 20000)
  }

  it('resolves to null, not an error, when the server is down', async () => {
    const detected = await detectLanguage(new Float32Array(16000), 16000, {
      baseUrl: 'http://127.0.0.1:9',
      timeoutMs: 1000,
    })
    expect(detected).toBeNull()
  })
})
