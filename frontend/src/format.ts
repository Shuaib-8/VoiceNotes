const DAY_MS = 86_400_000

function timeOf(date: Date): string {
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

/** List stamps are relative and second-free — recall thinks in "yesterday", not ISO. */
export function formatListStamp(iso: string | null, now: Date = new Date()): string {
  if (iso === null) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const daysAgo = Math.round((startOfDay(now) - startOfDay(date)) / DAY_MS)
  if (daysAgo === 0) return `Today ${timeOf(date)}`
  if (daysAgo === 1) return `Yesterday ${timeOf(date)}`
  const day = date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    ...(date.getFullYear() === now.getFullYear() ? {} : ({ year: 'numeric' } as const)),
  })
  return `${day}, ${timeOf(date)}`
}

/** The detail view is the archival record: full absolute date, still no seconds. */
export function formatDetailStamp(iso: string | null): string {
  if (iso === null) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString(undefined, { dateStyle: 'long', timeStyle: 'short' })
}

export function formatDuration(seconds: number | null): string {
  if (seconds === null) return ''
  const total = Math.round(seconds)
  return `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, '0')}`
}

/** "mlx-community/whisper-large-v3-turbo" → "Whisper large-v3-turbo" — internals never lead. */
export function humanizeModel(model: string): string {
  const name = model.split('/').pop() ?? model
  return name.startsWith('whisper-') ? `Whisper ${name.slice('whisper-'.length)}` : name
}

/** Provenance in plain words: how this note reached the archive. */
export function describeSource(source: string | null, originalFilename: string | null): string {
  if (source === 'mic') return 'recorded from the mic'
  if (source === 'upload') {
    return originalFilename === null ? 'uploaded' : `uploaded as ${originalFilename}`
  }
  return source ?? ''
}
