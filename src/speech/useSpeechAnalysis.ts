/**
 * React binding for the recognition pipeline.
 *
 * Owns the part the UI genuinely needs to know about: the two models total
 * several hundred megabytes, so the first run downloads for a while. Without
 * visible progress that reads as a hung app, so load state is surfaced
 * explicitly rather than hidden behind the existing "analyzing" spinner.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { analyseRecording, type FreeformOptions, type FreeformResult } from './freeformPipeline'
import { loadRecognizer } from './phonemes/recognizer'
import { loadTranscriber } from './transcribe/whisper'

export type ModelPhase = 'idle' | 'loading-phonemes' | 'loading-whisper' | 'ready' | 'error'

export interface SpeechAnalysis {
  phase: ModelPhase
  /** 0..1 for the model currently downloading. */
  progress: number
  error: string | null
  /** True once both models are resident. */
  ready: boolean
  analysing: boolean
  /** Download both models without recording anything. */
  warmUp: () => Promise<void>
  analyse: (blob: Blob, options?: FreeformOptions) => Promise<FreeformResult | null>
}

export interface UseSpeechAnalysisOptions extends FreeformOptions {
  /** Skip Whisper entirely, for testing language detection on its own. */
  languageOnly?: boolean
}

export function useSpeechAnalysis(options: UseSpeechAnalysisOptions = {}): SpeechAnalysis {
  const [phase, setPhase] = useState<ModelPhase>('idle')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [analysing, setAnalysing] = useState(false)

  const optionsRef = useRef(options)
  useEffect(() => {
    optionsRef.current = options
  }, [options])
  const readyRef = useRef(false)

  const warmUp = useCallback(async () => {
    if (readyRef.current) return
    const { languageOnly, phonemeModel, whisperModel } = optionsRef.current
    setError(null)

    try {
      setPhase('loading-phonemes')
      setProgress(0)
      await loadRecognizer({ ...phonemeModel, onProgress: setProgress })

      if (!languageOnly) {
        setPhase('loading-whisper')
        setProgress(0)
        await loadTranscriber({ ...whisperModel, onProgress: setProgress })
      }

      readyRef.current = true
      setPhase('ready')
      setProgress(1)
    } catch (e) {
      setPhase('error')
      setError(e instanceof Error ? e.message : 'Could not load the local models.')
      throw e
    }
  }, [])

  const analyse = useCallback(
    async (blob: Blob, overrides: FreeformOptions = {}): Promise<FreeformResult | null> => {
      setAnalysing(true)
      setError(null)
      try {
        await warmUp()
        const { languageOnly, ...base } = optionsRef.current
        return await analyseRecording(blob, {
          ...base,
          ...overrides,
          skipTranscription: languageOnly || overrides.skipTranscription,
        })
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Analysis failed.')
        return null
      } finally {
        setAnalysing(false)
      }
    },
    [warmUp],
  )

  return { phase, progress, error, ready: phase === 'ready', analysing, warmUp, analyse }
}
