/**
 * Turn a recorded Blob into the mono 16 kHz float samples the models need.
 *
 * The existing UI already records with MediaRecorder to keep a playable blob
 * for the "compare with your own voice" feature. Rather than adding a second
 * parallel capture path, this decodes that same blob -- one recording, two
 * consumers.
 */

import { SAMPLE_RATE } from '../phonemes/recognizer'
import { resampleTo16k, toMono } from '../capture/resample'
import { trimSilence } from '../capture/vad'

export interface DecodedAudio {
  /** Mono, 16 kHz, silence trimmed. */
  audio: Float32Array
  durationMs: number
  hasSpeech: boolean
  /** Sample rate the browser decoded at, before resampling. */
  sourceSampleRate: number
}

/** Decode and normalise a recorded blob. Returns empty audio if it holds no speech. */
export async function decodeRecording(blob: Blob): Promise<DecodedAudio> {
  const bytes = await blob.arrayBuffer()

  // A bare AudioContext decodes whatever the browser recorded (usually webm
  // Opus) at the hardware rate; we resample afterwards.
  const context = new AudioContext()
  let buffer: AudioBuffer
  try {
    buffer = await context.decodeAudioData(bytes)
  } finally {
    await context.close().catch(() => {})
  }

  const channels: Float32Array[] = []
  for (let c = 0; c < buffer.numberOfChannels; c++) channels.push(buffer.getChannelData(c).slice())

  const mono = toMono(channels)
  const at16k = await resampleTo16k(mono, buffer.sampleRate)
  const trimmed = trimSilence(at16k, { sampleRate: SAMPLE_RATE })

  return {
    audio: trimmed.audio,
    durationMs: (trimmed.audio.length / SAMPLE_RATE) * 1000,
    hasSpeech: trimmed.hasSpeech,
    sourceSampleRate: buffer.sampleRate,
  }
}
