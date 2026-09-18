/**
 * Language-agnostic phoneme recognition.
 *
 * Runs wav2vec2 fine-tuned on eSpeak phoneme labels, which transcribes the
 * sounds the speaker actually produced with no language model to tidy them up.
 * That absence is the feature: any model that emits plausible *text* silently
 * repairs mispronunciations, and a repaired transcript cannot be scored.
 *
 * Deliberately uses AutoModelForCTC rather than the `automatic-speech-recognition`
 * pipeline. The pipeline returns a decoded string and discards the logits, and
 * the logits are what carry per-sound timing and confidence.
 */

import { AutoFeatureExtractor, AutoModelForCTC, env } from '@huggingface/transformers'
import type { RecognizedPhoneme } from '../types'
import { decodeGreedy, vocabFromJson } from './ctc'
import vocabJson from '../../data/phoneme-vocab.json'
import { byteProgress } from '../modelProgress'

export const MODEL_ID = 'onnx-community/wav2vec2-lv-60-espeak-cv-ft-ONNX'

/** The model is trained at 16 kHz; feeding it anything else silently degrades output. */
export const SAMPLE_RATE = 16000

/**
 * Quantisation. `q8` is the default at ~318 MB; `fp16` (~632 MB) is available
 * when quality matters more than download size. `q4` is deliberately not
 * offered -- 4-bit on a CTC acoustic model erodes exactly the fine distinctions
 * between similar phonemes that this whole feature rests on.
 */
export type ModelPrecision = 'q8' | 'fp16' | 'fp32'

export interface LoadOptions {
  precision?: ModelPrecision
  /** Receives 0..1 while the weights download. */
  onProgress?: (fraction: number) => void
  /** Force a backend. Defaults to WebGPU with a WASM fallback. */
  device?: 'webgpu' | 'wasm'
}

interface Loaded {
  model: Awaited<ReturnType<typeof AutoModelForCTC.from_pretrained>>
  featureExtractor: Awaited<ReturnType<typeof AutoFeatureExtractor.from_pretrained>>
  vocab: string[]
  device: string
}

let loading: Promise<Loaded> | null = null
let loadedKey = ''

/**
 * Load and cache the recogniser. Safe to call repeatedly; the weights are
 * fetched once and then served from the browser's cache, which is what makes
 * the app work offline after first run.
 */
export async function loadRecognizer(options: LoadOptions = {}): Promise<Loaded> {
  const precision = options.precision ?? 'q8'
  const key = `${precision}:${options.device ?? 'auto'}`

  if (loading && loadedKey === key) return loading
  loadedKey = key

  loading = (async () => {
    // Allow remote fetch on first run, then rely on the HTTP cache.
    env.allowRemoteModels = true

    const vocab = vocabFromJson(vocabJson as Record<string, number>)
    const featureExtractor = await AutoFeatureExtractor.from_pretrained(MODEL_ID)

    const attempts: Array<'webgpu' | 'wasm'> = options.device
      ? [options.device]
      : ['webgpu', 'wasm']

    let lastError: unknown
    for (const device of attempts) {
      try {
        const model = await AutoModelForCTC.from_pretrained(MODEL_ID, {
          dtype: precision,
          device,
          progress_callback: byteProgress(options.onProgress),
        })
        return { model, featureExtractor, vocab, device }
      } catch (error) {
        // WebGPU is unavailable in plenty of environments; fall through to WASM
        // rather than failing the whole feature.
        lastError = error
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error('Could not initialise the phoneme recogniser on any backend')
  })()

  return loading
}

export interface RecognizeResult {
  phonemes: RecognizedPhoneme[]
  /** Output frames the model produced. */
  frames: number
  secondsPerFrame: number
  device: string
}

/**
 * Transcribe mono 16 kHz audio into phonemes with timings and confidences.
 *
 * @param audio Mono float samples at SAMPLE_RATE. Normalisation is handled by
 *   the feature extractor, whose config sets `do_normalize: true`.
 */
export async function recognizePhonemes(
  audio: Float32Array,
  options: LoadOptions = {},
): Promise<RecognizeResult> {
  if (audio.length === 0) {
    return { phonemes: [], frames: 0, secondsPerFrame: 0, device: 'none' }
  }

  const { model, featureExtractor, vocab, device } = await loadRecognizer(options)

  const inputs = await (featureExtractor as unknown as (a: Float32Array) => Promise<{
    input_values: unknown
    attention_mask: unknown
  }>)(audio)

  const output = await (model as unknown as (i: unknown) => Promise<{
    logits: { dims: number[]; data: Float32Array }
  }>)(inputs)

  const { dims, data } = output.logits
  // [batch, frames, vocab]
  const frames = dims[1]
  const vocabSize = dims[2]

  // Derive the frame rate from the actual output rather than hardcoding the
  // convolutional stride, so a model change cannot silently skew every timing.
  const durationSeconds = audio.length / SAMPLE_RATE
  const secondsPerFrame = frames > 0 ? durationSeconds / frames : 0

  const phonemes = decodeGreedy(data, frames, vocabSize, vocab, {
    secondsPerFrame,
    alternates: 2,
  })

  return { phonemes, frames, secondsPerFrame, device }
}

/** Release the cached model, e.g. when switching precision. */
export function resetRecognizer(): void {
  loading = null
  loadedKey = ''
}
