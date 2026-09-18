/**
 * Download progress across every file a model fetches.
 *
 * Transformers.js reports progress per file, and each small config file hits
 * 100% almost instantly. Passing those through raw made the loader flash "0%"
 * and then vanish while the real weights -- hundreds of megabytes -- were still
 * downloading, which looked like the app doing nothing. Summing bytes across
 * files gives one number that only reaches 1 when everything has arrived.
 */

export interface ProgressEvent {
  status?: string
  file?: string
  loaded?: number
  total?: number
  progress?: number
}

export function byteProgress(onProgress?: (fraction: number) => void) {
  const files = new Map<string, { loaded: number; total: number }>()
  return (event: ProgressEvent) => {
    if (!onProgress || !event.file) return
    if (event.status === 'progress' && event.total) {
      files.set(event.file, { loaded: event.loaded ?? 0, total: event.total })
    } else if (event.status === 'done') {
      const known = files.get(event.file)
      if (known) files.set(event.file, { loaded: known.total, total: known.total })
    } else {
      return
    }
    let loaded = 0
    let total = 0
    for (const f of files.values()) {
      loaded += f.loaded
      total += f.total
    }
    if (total > 0) onProgress(Math.min(1, loaded / total))
  }
}
