/**
 * The whole loop, as one hook: microphone -> language -> phonemes -> words ->
 * score -> coaching.
 *
 * Gemma is asked twice, for two different things. First, the moment recording
 * stops, it hears the audio and names the language -- that answer reaches the
 * UI in under a second, long before transcription finishes. Second, after every
 * score is fixed, it is given the measurements as text and explains them. It is
 * never asked to grade: the only thing left for it at that point is to put
 * words to numbers that are already final.
 *
 * The model is also optional. If the local server is down the recogniser still
 * produces a transcript, a language and a score -- the learner loses the
 * translation and the written coaching, not the feedback. Degrading that way
 * round is what keeps a missing LM Studio from turning the app into a blank
 * screen, and it is why the fallback notes below are built from the
 * measurements rather than from a pool of generic encouragement.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMicRecorder, type MicRecorder } from './capture/useMicRecorder'
import { encodeWav } from './audio/encodeWav'
import { SAMPLE_RATE, type LoadOptions } from './phonemes/recognizer'
import { analyseAudio, type FreeformResult } from './freeformPipeline'
import { gradeUtterance, type Strictness } from './scoring/grade'
import type { ClarityScoredWord } from './scoring/wordClarity'
import { createLocalCoach, type Coaching } from './llm/localInterpreter'
import { detectLanguage, type GemmaDetection } from './llm/languageDetector'
import { profileForCode } from './language/catalog'
import type { LanguageSource } from './language/decide'

export type EvaluationStage =
  | 'idle'
  | 'loading-model'
  | 'listening'
  | 'detecting'
  | 'recognizing'
  | 'interpreting'
  | 'done'
  | 'error'

/** A word as the UI renders it: acoustic status plus the coach's advice. */
export interface EvaluatedWord {
  word: string
  status: ClarityScoredWord['status']
  score: number
  tip?: string
}

export interface Evaluation {
  detectedLanguage: string
  /** BCP-47 tag, used for speech synthesis of the reference reading. */
  detectedLangCode: string
  detectedFlag: string
  /** True when two languages were too close to call. Worth surfacing. */
  ambiguous: boolean
  languageConfidence: number
  /** "gemma" when the local model named the language, "phonemes" when it could not. */
  languageSource: LanguageSource
  /** Runner-up language, shown when the call was close. */
  alternativeLanguage: string | null

  /** Raw IPA of what was actually said. Diagnostic; not shown to learners. */
  heardIpa: string
  /** Empty when nothing intelligible was transcribed. */
  transcribedText: string
  /** Null when no local model was reachable. */
  translation: string | null

  score: number
  grade: string
  articulationScore: number
  fluencyScore: number
  /** Always null: the pipeline has no pitch tracker. See scoring/grade.ts. */
  intonationScore: null

  wordBreakdown: EvaluatedWord[]
  feedback: string[]

  durationMs: number
  timings: {
    captureMs: number
    recognizeMs: number
    transcribeMs: number
    interpretMs: number
    /** Gemma's language answer, from end of recording. 0 when it did not answer. */
    detectMs: number
  }
}

/** The language, as soon as Gemma names it -- before the rest of the result. */
export interface EarlyLanguage {
  name: string
  flag: string
  confidence: number
}

export interface SpeechEvaluationOptions {
  /** Local server base URL, e.g. http://127.0.0.1:1234. */
  baseUrl?: string
  /** Model id on that server. */
  model?: string
  strictness?: Strictness
  /** Force a backend for the browser models. Defaults to WebGPU then WASM. */
  device?: LoadOptions['device']
}

export interface SpeechEvaluation {
  stage: EvaluationStage
  recorder: MicRecorder
  /**
   * Object URL for the learner's own recording, for the side-by-side playback.
   * These are the exact samples that were scored, so what they hear is what the
   * models heard.
   */
  userAudioUrl: string | null
  /** 0..1 while the browser models download on first run. */
  modelProgress: number
  result: Evaluation | null
  /** Set within a second of recording stopping, if the local model answered. */
  earlyLanguage: EarlyLanguage | null
  error: string | null
  /** Set when the acoustic stage succeeded but the local model did not. */
  interpreterError: string | null
  start: () => Promise<void>
  stop: () => Promise<void>
  reset: () => void
}

/**
 * Feedback derived from the measurements alone.
 *
 * Used when the local model is unreachable. Deliberately built from what was
 * actually measured rather than a generic encouragement pool, so a learner
 * running without Gemma still gets true statements about their own speech.
 */
function fallbackFeedback(
  result: FreeformResult,
  pauses: { count: number; seconds: number },
): string[] {
  const notes: string[] = []

  const weak = result.words
    .filter((w) => w.status !== 'perfect' && w.phonemes.length > 0)
    .sort((a, b) => a.score - b.score)
    .slice(0, 2)

  for (const w of weak) {
    notes.push(`“${w.word}” came out unclearly — slow down and separate the sounds.`)
  }

  if (pauses.count > 0) {
    notes.push(
      `${pauses.count} noticeable ${pauses.count === 1 ? 'pause' : 'pauses'} ` +
        `(${pauses.seconds.toFixed(1)}s total). Try saying the whole phrase in one breath.`,
    )
  }

  if (result.ambiguous && result.ranking.length > 1) {
    notes.push(
      `Your sounds sat between ${result.ranking[0].name} and ${result.ranking[1].name}. ` +
        `Leaning further into ${result.ranking[0].name} vowels will make it unmistakable.`,
    )
  }

  if (notes.length === 0) {
    notes.push('Clear and evenly paced throughout — every word was articulated distinctly.')
  }

  return notes
}

export function useSpeechEvaluation(options: SpeechEvaluationOptions = {}): SpeechEvaluation {
  const { baseUrl, model, strictness = 'standard', device } = options

  const [stage, setStage] = useState<EvaluationStage>('idle')
  const [modelProgress, setModelProgress] = useState(0)
  const [result, setResult] = useState<Evaluation | null>(null)
  const [earlyLanguage, setEarlyLanguage] = useState<EarlyLanguage | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [interpreterError, setInterpreterError] = useState<string | null>(null)
  const [userAudioUrl, setUserAudioUrl] = useState<string | null>(null)
  /** Revoked on replacement so recordings do not accumulate in memory. */
  const previousAudioUrl = useRef<string | null>(null)
  /** True once the browser models are resident, so later runs skip the loader. */
  const modelsReady = useRef(false)

  // Held in a ref so the auto-stop callback always sees the current settings
  // without re-creating the recorder every time a slider moves.
  const settings = useRef({ baseUrl, model, strictness, device })
  useEffect(() => {
    settings.current = { baseUrl, model, strictness, device }
  }, [baseUrl, model, strictness, device])

  const evaluate = useCallback(async (audio: Float32Array, captureMs: number) => {
    const { baseUrl: url, model: tag, strictness: strict, device: dev } = settings.current

    setError(null)
    setInterpreterError(null)
    setEarlyLanguage(null)

    // Language first, and immediately: this request goes out before the
    // browser models even start, and runs on the local server in parallel
    // with them.
    const gemmaLanguage = detectLanguage(audio, SAMPLE_RATE, { baseUrl: url, model: tag })
    void gemmaLanguage.then((detected: GemmaDetection | null) => {
      const top = detected?.ranking[0]
      const profile = top ? profileForCode(top.code) : null
      if (top && profile) {
        setEarlyLanguage({ name: profile.name, flag: profile.flag, confidence: top.probability })
      }
    })

    // The first run downloads several hundred megabytes of browser models.
    // Without this the app looks hung for a minute.
    setStage(modelsReady.current ? 'detecting' : 'loading-model')

    let analysis: FreeformResult
    try {
      // Both models report through here. Once a download completes the stage
      // moves on, so a finished loader does not sit at "loading" for the whole
      // of recognition.
      const onProgress = (fraction: number) => {
        setModelProgress(fraction)
        setStage((current) => (fraction >= 1 && current === 'loading-model' ? 'detecting' : current))
      }
      analysis = await analyseAudio(audio, (audio.length / SAMPLE_RATE) * 1000, {
        phonemeModel: { device: dev, onProgress },
        whisperModel: { device: dev, onProgress },
        gemmaLanguage,
      })
      modelsReady.current = true
    } catch (e) {
      setStage('error')
      setError(e instanceof Error ? e.message : 'Could not analyse the recording.')
      return
    }

    if (!analysis.hasSpeech || analysis.phonemes.length === 0) {
      setStage('error')
      setError('No speech was detected in that recording.')
      return
    }

    // Language, transcript and every score are settled here, before the model
    // is consulted. Nothing below can change them.
    const graded = gradeUtterance(analysis.score, analysis.phonemes, strict)

    setStage('interpreting')

    let coaching: Coaching | null = null
    let interpretMs = 0

    // Nothing to coach without words: skip the round trip rather than ask the
    // model to comment on an empty transcript.
    if (analysis.transcript) {
      try {
        const started = performance.now()
        coaching = await createLocalCoach({ baseUrl: url, model: tag }).coach({
          transcript: analysis.transcript,
          heard: analysis.heard,
          language: analysis.profile?.name ?? 'Unknown',
          words: analysis.words,
          ambiguous: analysis.ambiguous,
        })
        interpretMs = performance.now() - started
      } catch (e) {
        // Not fatal: the acoustic feedback below still stands on its own.
        setInterpreterError(e instanceof Error ? e.message : 'Local model unavailable.')
      }
    }

    const tipFor = new Map(coaching?.notes.map((n) => [n.word.toLowerCase(), n.note]) ?? [])
    const wordBreakdown: EvaluatedWord[] = analysis.words.map((w) => ({
      word: w.word,
      status: w.status,
      score: Math.round(w.score * 100),
      // Advice only attaches to a word the acoustic track actually flagged, so
      // the model cannot put a warning on a word that scored well.
      tip: w.status !== 'perfect' ? tipFor.get(w.word.toLowerCase()) : undefined,
    }))

    const coached = coaching
      ? [
          ...(coaching.summary ? [coaching.summary] : []),
          ...wordBreakdown
            .filter((w) => w.tip)
            .map((w) => `“${w.word}” — ${w.tip}`),
        ]
      : []

    setResult({
      detectedLanguage: analysis.profile?.name ?? 'Unrecognised',
      detectedLangCode: analysis.profile?.tag ?? '',
      detectedFlag: analysis.profile?.flag ?? '🌐',
      ambiguous: analysis.ambiguous,
      languageConfidence: analysis.language.confidence,
      languageSource: analysis.languageSource,
      alternativeLanguage: analysis.ambiguous ? (analysis.ranking[1]?.name ?? null) : null,

      heardIpa: analysis.heard,
      transcribedText: analysis.transcript,
      translation: coaching?.translation ?? null,

      score: graded.overall,
      grade: graded.grade,
      articulationScore: graded.articulation,
      fluencyScore: graded.fluency,
      intonationScore: null,

      wordBreakdown,
      feedback: coached.length > 0 ? coached : fallbackFeedback(analysis, graded.pauses),

      durationMs: analysis.durationMs,
      timings: {
        captureMs,
        recognizeMs: analysis.timings.phonemeMs + analysis.timings.languageMs,
        transcribeMs: analysis.timings.transcribeMs,
        interpretMs,
        detectMs: analysis.gemma?.latencyMs ?? 0,
      },
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
    setEarlyLanguage(null)
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
    setEarlyLanguage(null)
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
      earlyLanguage,
      error: combinedError,
      interpreterError,
      start,
      stop,
      reset,
    }),
    [
      stage,
      recorder,
      userAudioUrl,
      modelProgress,
      result,
      earlyLanguage,
      combinedError,
      interpreterError,
      start,
      stop,
      reset,
    ],
  )
}
