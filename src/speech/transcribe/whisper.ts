/**
 * Open-vocabulary transcription.
 *
 * Whisper supplies the words; it does not supply the grade. Its decoder is
 * trained to emit plausible text, so it quietly repairs mispronunciations --
 * exactly the errors we exist to report. Scoring therefore stays with the
 * acoustic track, and Whisper's job is limited to "which words were these" and
 * "when was each one said".
 *
 * The decode is forced to the language the phoneme track picked. Left to
 * auto-detect, Whisper keys off accent, so a beginner attempting Spanish gets
 * transcribed as garbled English. The pipeline also cannot read Whisper's own
 * detected language -- the Transformers.js ASR pipeline returns only text and
 * chunks -- so forcing it is both more correct and the only option.
 */

import { pipeline } from '@huggingface/transformers'

export const WHISPER_MODEL_ID = 'onnx-community/whisper-large-v3-turbo'

export interface WhisperLoadOptions {
  /** q4f16 keeps the pair of models near 880 MB total; int8 is more accurate. */
  dtype?: 'q4f16' | 'int8' | 'fp16' | 'q4'
  device?: 'webgpu' | 'wasm'
  onProgress?: (fraction: number) => void
  model?: string
}

export interface TranscribedWord {
  word: string
  /** Seconds from the start of the audio passed in. */
  start: number
  end: number
}

export interface TranscriptionResult {
  text: string
  words: TranscribedWord[]
}

type Transcriber = (audio: Float32Array, options: Record<string, unknown>) => Promise<{
  text: string
  chunks?: Array<{ text: string; timestamp: [number, number] }>
}>

let loading: Promise<Transcriber> | null = null
let loadedKey = ''

/** Load and cache Whisper. Weights are fetched once, then served from cache. */
export async function loadTranscriber(options: WhisperLoadOptions = {}): Promise<Transcriber> {
  const dtype = options.dtype ?? 'q4f16'
  const model = options.model ?? WHISPER_MODEL_ID
  const key = `${model}:${dtype}:${options.device ?? 'auto'}`

  if (loading && loadedKey === key) return loading
  loadedKey = key

  loading = (async () => {
    const attempts: Array<'webgpu' | 'wasm'> = options.device ? [options.device] : ['webgpu', 'wasm']
    let lastError: unknown

    for (const device of attempts) {
      try {
        const asr = await pipeline('automatic-speech-recognition', model, {
          dtype,
          device,
          progress_callback: (p: { status?: string; progress?: number }) => {
            if (p.status === 'progress' && typeof p.progress === 'number') {
              options.onProgress?.(Math.min(1, p.progress / 100))
            }
          },
        })
        return asr as unknown as Transcriber
      } catch (error) {
        lastError = error
      }
    }
    throw lastError instanceof Error ? lastError : new Error('Could not initialise Whisper')
  })()

  return loading
}

/**
 * Transcribe audio, forced to a language, with word-level timings.
 *
 * @param audio Mono 16 kHz samples -- the same buffer given to the phoneme
 *   recogniser, so the two sets of timestamps share an origin.
 * @param language Whisper's language name, e.g. "spanish".
 */
export async function transcribe(
  audio: Float32Array,
  language: string | null,
  options: WhisperLoadOptions = {},
): Promise<TranscriptionResult> {
  if (audio.length === 0) return { text: '', words: [] }

  const transcriber = await loadTranscriber(options)
  const output = await transcriber(audio, {
    task: 'transcribe',
    return_timestamps: 'word',
    // Null asks Whisper to auto-detect, used only when the phoneme track
    // declined to name a language.
    ...(language ? { language } : {}),
  })

  const words: TranscribedWord[] = (output.chunks ?? [])
    .map((c) => ({
      word: c.text.trim(),
      start: c.timestamp?.[0] ?? 0,
      // Whisper occasionally omits the closing timestamp on the final chunk.
      end: c.timestamp?.[1] ?? c.timestamp?.[0] ?? 0,
    }))
    .filter((w) => w.word.length > 0)

  return { text: (output.text ?? '').trim(), words }
}

export function resetTranscriber(): void {
  loading = null
  loadedKey = ''
}
