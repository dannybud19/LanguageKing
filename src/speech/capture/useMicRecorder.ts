/**
 * Microphone capture for pronunciation assessment.
 *
 * Captures raw float samples via an AudioWorklet rather than MediaRecorder,
 * because the recogniser needs an unencoded waveform.
 *
 * Note the disabled audio processing: echo cancellation, noise suppression and
 * auto gain are tuned for telephony and they distort precisely the spectral
 * detail being measured here. Leaving them on makes the scores unreliable in a
 * way that is very hard to trace back.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { SAMPLE_RATE } from '../phonemes/recognizer'
import { concatChunks, resampleTo16k } from './resample'
import { isTrailingSilence, rms, trimSilence } from './vad'

/** Inlined so the worklet needs no separate asset in the build. */
const WORKLET_SOURCE = `
class CaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0] && inputs[0][0]
    if (channel && channel.length) this.port.postMessage(channel.slice(0))
    return true
  }
}
registerProcessor('languageking-capture', CaptureProcessor)
`

export type RecorderState = 'idle' | 'requesting' | 'recording' | 'processing'

export interface CapturedAudio {
  /** Mono 16 kHz, silence trimmed. */
  audio: Float32Array
  durationMs: number
  /** False when the recording contained no speech. */
  hasSpeech: boolean
}

export interface UseMicRecorderOptions {
  /** Stop automatically after this much trailing silence. 0 disables it. */
  autoStopSilenceMs?: number
  /** Hard cap on recording length, as a safety net. */
  maxDurationMs?: number
  /** Called when trailing silence or the duration cap ends the recording. The
   *  caller owns what happens next, which is normally `stop()` then recognise. */
  onAutoStop?: () => void
}

export interface MicRecorder {
  state: RecorderState
  /** Current input level, 0..1, for a meter. */
  level: number
  durationMs: number
  error: string | null
  start: () => Promise<void>
  stop: () => Promise<CapturedAudio | null>
  cancel: () => void
}

export function useMicRecorder(options: UseMicRecorderOptions = {}): MicRecorder {
  const { autoStopSilenceMs = 1000, maxDurationMs = 15000, onAutoStop } = options
  const autoStopHandler = useRef(onAutoStop)
  useEffect(() => {
    autoStopHandler.current = onAutoStop
  }, [onAutoStop])

  const [state, setState] = useState<RecorderState>('idle')
  const [level, setLevel] = useState(0)
  const [durationMs, setDurationMs] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const stream = useRef<MediaStream | null>(null)
  const context = useRef<AudioContext | null>(null)
  const node = useRef<AudioWorkletNode | null>(null)
  const chunks = useRef<Float32Array[]>([])
  const startedAt = useRef(0)
  const workletUrl = useRef<string | null>(null)
  /** Set when auto-stop fires, so `stop` can be awaited from the effect. */
  const autoStopRequested = useRef(false)

  const teardown = useCallback(() => {
    node.current?.disconnect()
    node.current = null
    context.current?.close().catch(() => {})
    context.current = null
    stream.current?.getTracks().forEach((t) => t.stop())
    stream.current = null
    if (workletUrl.current) {
      URL.revokeObjectURL(workletUrl.current)
      workletUrl.current = null
    }
  }, [])

  useEffect(() => teardown, [teardown])

  const start = useCallback(async () => {
    if (state === 'recording' || state === 'requesting') return
    setError(null)
    setState('requesting')
    chunks.current = []
    autoStopRequested.current = false

    try {
      const media = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          // See the note at the top of this file: these must stay off.
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      })
      stream.current = media

      // Ask for 16 kHz; we verify and resample on stop regardless.
      const ctx = new AudioContext({ sampleRate: SAMPLE_RATE })
      context.current = ctx

      const blob = new Blob([WORKLET_SOURCE], { type: 'application/javascript' })
      workletUrl.current = URL.createObjectURL(blob)
      await ctx.audioWorklet.addModule(workletUrl.current)

      const source = ctx.createMediaStreamSource(media)
      const capture = new AudioWorkletNode(ctx, 'languageking-capture')
      node.current = capture

      capture.port.onmessage = (event: MessageEvent<Float32Array>) => {
        const chunk = event.data
        chunks.current.push(chunk)
        setLevel(Math.min(1, rms(chunk) * 4))
        setDurationMs((chunks.current.length * chunk.length * 1000) / ctx.sampleRate)
      }

      source.connect(capture)
      // Keep the graph alive without routing input to the speakers.
      const sink = ctx.createGain()
      sink.gain.value = 0
      capture.connect(sink).connect(ctx.destination)

      startedAt.current = performance.now()
      setState('recording')
    } catch (e) {
      teardown()
      setState('idle')
      setError(
        e instanceof DOMException && e.name === 'NotAllowedError'
          ? 'Microphone permission was denied.'
          : e instanceof Error
            ? e.message
            : 'Could not start recording.',
      )
    }
  }, [state, teardown])

  const stop = useCallback(async (): Promise<CapturedAudio | null> => {
    if (state !== 'recording') return null
    setState('processing')

    const ctx = context.current
    const sourceRate = ctx?.sampleRate ?? SAMPLE_RATE
    const raw = concatChunks(chunks.current)
    teardown()
    setLevel(0)

    try {
      const at16k = await resampleTo16k(raw, sourceRate)
      const trimmed = trimSilence(at16k, { sampleRate: SAMPLE_RATE })
      setState('idle')
      return {
        audio: trimmed.audio,
        durationMs: (trimmed.audio.length / SAMPLE_RATE) * 1000,
        hasSpeech: trimmed.hasSpeech,
      }
    } catch (e) {
      setState('idle')
      setError(e instanceof Error ? e.message : 'Could not process the recording.')
      return null
    }
  }, [state, teardown])

  const cancel = useCallback(() => {
    teardown()
    chunks.current = []
    setLevel(0)
    setDurationMs(0)
    setState('idle')
  }, [teardown])

  // Auto-stop on trailing silence, plus a hard duration cap. The flag keeps
  // this from firing repeatedly while `stop` is in flight.
  useEffect(() => {
    if (state !== 'recording') return
    const timer = window.setInterval(() => {
      if (autoStopRequested.current) return
      const elapsed = performance.now() - startedAt.current
      const audio = concatChunks(chunks.current)

      const silent =
        autoStopSilenceMs > 0 &&
        isTrailingSilence(audio, {
          sampleRate: context.current?.sampleRate ?? SAMPLE_RATE,
          silenceMs: autoStopSilenceMs,
        })

      if (silent || elapsed > maxDurationMs) {
        autoStopRequested.current = true
        autoStopHandler.current?.()
      }
    }, 200)
    return () => window.clearInterval(timer)
  }, [state, autoStopSilenceMs, maxDurationMs])

  return { state, level, durationMs, error, start, stop, cancel }
}
