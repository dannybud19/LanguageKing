/**
 * Energy-based voice activity detection.
 *
 * Deliberately simple: an RMS gate relative to the measured noise floor,
 * rather than a neural VAD. Its job is to stop leading and trailing silence
 * from being fed to the recogniser, because silence produces spurious phonemes
 * and drags every alignment score down. Swap in Silero VAD if rooms get noisy.
 *
 * Kept free of browser APIs so it can be tested directly.
 */

/** Analysis window. Matches the recogniser's frame rate closely enough. */
export const FRAME_MS = 20

export interface TrimOptions {
  sampleRate: number
  /** How far above the measured noise floor a frame must be to count as speech. */
  threshold?: number
  /** Absolute floor, so a silent room cannot make noise look like speech. */
  absoluteFloor?: number
  /** Audio kept either side of detected speech, in milliseconds. */
  padMs?: number
  /** Ceiling on the gate as a fraction of peak energy. See DEFAULTS.peakRatio. */
  peakRatio?: number
}

const DEFAULTS = {
  threshold: 3.5,
  absoluteFloor: 0.004,
  padMs: 60,
  /**
   * Ceiling on the gate, as a fraction of peak frame energy.
   *
   * Without this, audio of roughly constant loudness -- continuous speech with
   * no pause to sample -- makes the noise floor equal the speech level, so the
   * gate lands above every frame and the entire utterance is discarded as
   * silence. Capping the gate relative to the peak means the worst case is
   * trimming nothing, which is the safe direction to fail in.
   */
  peakRatio: 0.35,
} as const

/** Root-mean-square amplitude of a half-open range. */
export function rms(samples: Float32Array, start = 0, end = samples.length): number {
  const from = Math.max(0, start)
  const to = Math.min(samples.length, end)
  if (to <= from) return 0
  let total = 0
  for (let i = from; i < to; i++) total += samples[i] * samples[i]
  return Math.sqrt(total / (to - from))
}

/** Per-frame RMS across the whole signal. */
export function frameEnergies(audio: Float32Array, sampleRate: number): Float32Array {
  const frameSize = Math.max(1, Math.round((sampleRate * FRAME_MS) / 1000))
  const count = Math.ceil(audio.length / frameSize)
  const out = new Float32Array(count)
  for (let f = 0; f < count; f++) {
    out[f] = rms(audio, f * frameSize, (f + 1) * frameSize)
  }
  return out
}

/**
 * Estimate the noise floor as a low percentile of frame energy.
 *
 * A mean would be dragged upward by the speech itself, which is exactly the
 * signal we are trying to separate out.
 */
export function noiseFloor(energies: Float32Array, percentile = 0.1): number {
  if (energies.length === 0) return 0
  const sorted = Float32Array.from(energies).sort()
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * percentile))
  return sorted[index]
}

export interface TrimResult {
  audio: Float32Array
  /** Seconds removed from the front, so timings can be mapped back if needed. */
  offsetSeconds: number
  /** False when no speech was found at all. */
  hasSpeech: boolean
}

/** Trim leading and trailing silence, keeping a little padding. */
export function trimSilence(audio: Float32Array, options: TrimOptions): TrimResult {
  const { sampleRate } = options
  const threshold = options.threshold ?? DEFAULTS.threshold
  const absoluteFloor = options.absoluteFloor ?? DEFAULTS.absoluteFloor
  const padMs = options.padMs ?? DEFAULTS.padMs

  if (audio.length === 0) {
    return { audio, offsetSeconds: 0, hasSpeech: false }
  }

  const energies = frameEnergies(audio, sampleRate)
  const floor = noiseFloor(energies)
  const peak = energies.reduce((a, e) => Math.max(a, e), 0)
  // absoluteFloor stays a hard minimum: the peak-relative ceiling must never
  // drag the gate below it, or a silent room reads as speech.
  const gate = Math.max(
    absoluteFloor,
    Math.min(floor * threshold, peak * (options.peakRatio ?? DEFAULTS.peakRatio)),
  )

  let first = -1
  let last = -1
  for (let f = 0; f < energies.length; f++) {
    if (energies[f] >= gate) {
      if (first === -1) first = f
      last = f
    }
  }

  if (first === -1) {
    return { audio: new Float32Array(0), offsetSeconds: 0, hasSpeech: false }
  }

  const frameSize = Math.max(1, Math.round((sampleRate * FRAME_MS) / 1000))
  const pad = Math.round((sampleRate * padMs) / 1000)
  const start = Math.max(0, first * frameSize - pad)
  const end = Math.min(audio.length, (last + 1) * frameSize + pad)

  return {
    audio: audio.slice(start, end),
    offsetSeconds: start / sampleRate,
    hasSpeech: true,
  }
}

/**
 * Whether the tail of the signal has been quiet long enough to stop recording.
 * Used for auto-stop so the user does not have to click twice.
 */
export function isTrailingSilence(
  audio: Float32Array,
  options: TrimOptions & { silenceMs?: number },
): boolean {
  const { sampleRate } = options
  const silenceMs = options.silenceMs ?? 800
  const needed = Math.round((sampleRate * silenceMs) / 1000)
  if (audio.length < needed) return false

  const energies = frameEnergies(audio, sampleRate)
  const gate = Math.max(
    options.absoluteFloor ?? DEFAULTS.absoluteFloor,
    noiseFloor(energies) * (options.threshold ?? DEFAULTS.threshold),
  )

  // Require speech to have happened at all; otherwise a recording that never
  // started would immediately "stop".
  if (!energies.some((e) => e >= gate)) return false

  const tail = rms(audio, audio.length - needed, audio.length)
  return tail < gate
}

export const _internal = { DEFAULTS }
