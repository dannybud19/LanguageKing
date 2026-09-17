/**
 * The whole loop, as one hook: microphone -> phonemes -> language -> words -> score.
 *
 * The order matters and is not arbitrary. The acoustic stage runs first and
 * alone, so the language decision and every score are fixed before the language
 * model is told anything. By the time the model is called, the only thing left
 * for it to do is put names to sounds that have already been measured.
 *
 * The model is also optional. If the local server is down, the recogniser still
 * produces IPA, a language and a score -- the learner loses the written
 * transcript and the coaching notes, not the feedback. Degrading that way round
 * is what keeps a missing Ollama from turning the app into a blank screen.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMicRecorder, type MicRecorder } from './capture/useMicRecorder'
import { encodeWav } from './audio/encodeWav'
import { SAMPLE_RATE } from './phonemes/recognizer'
import { recognizePhonemes, type ModelPrecision } from './phonemes/recognizer'
import { toIpaString } from './phonemes/ctc'
import { identifyFromInventory, PROFILE_BY_CODE } from './language/inventory'
import { createLocalInterpreter, type FreeSpeechReading } from './llm/localInterpreter'
import { scoreUtterance, scoreWords, type ScoredReadWord, type Strictness } from './score'
import type { RecognizedPhoneme } from './types'

export type EvaluationStage =
  | 'idle'
  | 'loading-model'
  | 'listening'
  | 'recognizing'
  | 'interpreting'
  | 'done'
  | 'error'

export interface Evaluation {
  detectedLanguage: string
  /** BCP-47 tag, used for speech synthesis of the reference reading. */
  detectedLangCode: string
  detectedFlag: string
  /** True when two languages were too close to call. Worth surfacing. */
  ambiguous: boolean
  languageConfidence: number

  /** Raw IPA of what was actually said. Always present. */
  heardIpa: string
  /** Null when no local model was reachable. */
  transcribedText: string | null
  translation: string | null

  score: number
  grade: string
  articulationScore: number
  fluencyScore: number
  /** Always null: the pipeline has no pitch tracker. See score.ts. */
  intonationScore: null

  wordBreakdown: ScoredReadWord[]
  feedback: string[]

  durationMs: number
  timings: { captureMs: number; recognizeMs: number; interpretMs: number }
}

export interface SpeechEvaluationOptions {
  /** Local server base URL, e.g. http://127.0.0.1:11434. */
  baseUrl?: string
  /** Model tag on that server. */
  model?: string
  strictness?: Strictness
  precision?: ModelPrecision
  /** Force a backend for the acoustic model. Defaults to WebGPU then WASM. */
  device?: 'webgpu' | 'wasm'
}

export interface SpeechEvaluation {
  stage: EvaluationStage
  recorder: MicRecorder
  /**
   * Object URL for the learner's own recording, for the side-by-side playback.
   * These are the exact samples that were scored, so what they hear is what
   * the model heard.
   */
  userAudioUrl: string | null
  /** 0..1 while the acoustic model downloads on first run. */
  modelProgress: number
  result: Evaluation | null
  error: string | null
  /** Set when the acoustic stage succeeded but the local model did not. */
  interpreterError: string | null
  start: () => Promise<void>
  stop: () => Promise<void>
  reset: () => void
}

export function useSpeechEvaluation(options: SpeechEvaluationOptions = {}): SpeechEvaluation {
  const { baseUrl, model, strictness = 'standard', precision = 'q8', device } = options

  const [stage, setStage] = useState<EvaluationStage>('idle')
  const [modelProgress, setModelProgress] = useState(0)
  const [result, setResult] = useState<Evaluation | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [interpreterError, setInterpreterError] = useState<string | null>(null)
  const [userAudioUrl, setUserAudioUrl] = useState<string | null>(null)
  /** Revoked on replacement so recordings do not accumulate in memory. */
  const previousAudioUrl = useRef<string | null>(null)

  // Held in a ref so the auto-stop callback always sees the current settings
  // without re-creating the recorder every time a slider moves.
  const settings = useRef({ baseUrl, model, strictness, precision, device })
  useEffect(() => {
    settings.current = { baseUrl, model, strictness, precision, device }
  }, [baseUrl, model, strictness, precision, device])

  const evaluate = useCallback(async (audio: Float32Array, captureMs: number) => {
    const { baseUrl: url, model: tag, strictness: strict, precision: dtype, device: dev } =
      settings.current

    setStage('recognizing')
    setError(null)
    setInterpreterError(null)

    let phonemes: RecognizedPhoneme[]
    let recognizeMs = 0

    try {
      const started = performance.now()
      const recognized = await recognizePhonemes(audio, {
        precision: dtype,
        device: dev,
        onProgress: setModelProgress,
      })
      recognizeMs = performance.now() - started
      phonemes = recognized.phonemes
    } catch (e) {
      setStage('error')
      setError(e instanceof Error ? e.message : 'Could not analyse the recording.')
      return
    }

    if (phonemes.length === 0) {
      setStage('error')
      setError('No speech was detected in that recording.')
      return
    }

    // Language and score are settled here, before the model sees anything.
    const identified = identifyFromInventory(phonemes)
    const scored = scoreUtterance(phonemes, strict)
    const heardIpa = toIpaString(phonemes)
    const profile = identified.profile ?? PROFILE_BY_CODE.get(identified.language.code) ?? null

    setStage('interpreting')

    let reading: FreeSpeechReading | null = null
    let interpretMs = 0

    try {
      const started = performance.now()
      reading = await createLocalInterpreter({ baseUrl: url, model: tag }).read({
        heard: heardIpa,
        ranking: identified.ranking,
      })
      interpretMs = performance.now() - started
    } catch (e) {
      // Not fatal: the acoustic feedback below still stands on its own.
      setInterpreterError(e instanceof Error ? e.message : 'Local model unavailable.')
    }

    // The model may overrule the inventory ranking on language -- it can read
    // words, which is stronger evidence than sound inventory alone.
    const code = reading?.text ? reading.language.code : identified.language.code
    const resolved = PROFILE_BY_CODE.get(code) ?? profile

    const words = reading ? scoreWords(reading.words, phonemes) : []

    const feedback: string[] = []
    if (reading?.summary) feedback.push(reading.summary)
    for (const word of words) {
      if (word.tip && word.status !== 'perfect') feedback.push(`“${word.word}” — ${word.tip}`)
    }
    if (identified.ambiguous && resolved) {
      const runnerUp = identified.ranking[1]
      if (runnerUp) {
        feedback.push(
          `Those sounds fit ${resolved.name} and ${runnerUp.name} about equally well.`,
        )
      }
    }

    setResult({
      detectedLanguage: resolved?.name ?? 'Unknown',
      detectedLangCode: resolved?.tag ?? 'en-US',
      detectedFlag: resolved?.flag ?? '🏳️',
      ambiguous: identified.ambiguous,
      languageConfidence: identified.language.confidence,

      heardIpa,
      transcribedText: reading?.text ?? null,
      translation: reading?.translation ?? null,

      score: scored.overall,
      grade: scored.grade,
      articulationScore: scored.articulation,
      fluencyScore: scored.fluency,
      intonationScore: null,

      wordBreakdown: words,
      feedback,

      durationMs: (audio.length / 16000) * 1000,
      timings: { captureMs, recognizeMs, interpretMs },
    })
    setStage('done')
  }, [])

  const capturedAt = useRef(0)

  const finish = useCallback(
    async (recorder: MicRecorder) => {
      const captured = await recorder.stop()
      if (!captured) {
        setStage('idle')
        return
      }
      if (!captured.hasSpeech) {
        setStage('error')
        setError('That recording was silent — try again a little closer to the mic.')
        return
      }

      if (previousAudioUrl.current) URL.revokeObjectURL(previousAudioUrl.current)
      const url = URL.createObjectURL(encodeWav(captured.audio, SAMPLE_RATE))
      previousAudioUrl.current = url
      setUserAudioUrl(url)

      await evaluate(captured.audio, performance.now() - capturedAt.current)
    },
    [evaluate],
  )

  // The recorder needs a stable auto-stop callback, but that callback needs the
  // recorder. The ref breaks the cycle.
  const recorderRef = useRef<MicRecorder | null>(null)
  const recorder = useMicRecorder({
    autoStopSilenceMs: 1200,
    maxDurationMs: 15000,
    onAutoStop: () => {
      if (recorderRef.current) void finish(recorderRef.current)
    },
  })
  useEffect(() => {
    recorderRef.current = recorder
  }, [recorder])

  const start = useCallback(async () => {
    setResult(null)
    setError(null)
    setInterpreterError(null)
    capturedAt.current = performance.now()
    await recorder.start()
    setStage('listening')
  }, [recorder])

  const stop = useCallback(async () => {
    await finish(recorder)
  }, [finish, recorder])

  const reset = useCallback(() => {
    recorder.cancel()
    if (previousAudioUrl.current) {
      URL.revokeObjectURL(previousAudioUrl.current)
      previousAudioUrl.current = null
    }
    setUserAudioUrl(null)
    setResult(null)
    setError(null)
    setInterpreterError(null)
    setStage('idle')
  }, [recorder])

  // Surface a mic failure through the same channel as everything else.
  const combinedError = error ?? recorder.error

  return useMemo(
    () => ({
      stage: recorder.error && stage === 'listening' ? 'error' : stage,
      recorder,
      userAudioUrl,
      modelProgress,
      result,
      error: combinedError,
      interpreterError,
      start,
      stop,
      reset,
    }),
    [stage, recorder, userAudioUrl, modelProgress, result, combinedError, interpreterError, start, stop, reset],
  )
}
