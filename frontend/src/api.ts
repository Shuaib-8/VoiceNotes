/** Client-side mirror of the server's upload allow-list. */
export const ACCEPTED_EXTENSIONS = [
  '.m4a',
  '.opus',
  '.webm',
  '.mp3',
  '.wav',
  '.ogg',
  '.flac',
  '.aac',
]

export interface NoteSummary {
  id: string
  status: 'processing' | 'failed' | 'done'
  title: string
  captured_at: string | null
  duration_seconds: number | null
  error: string | null
  has_audio: boolean
  /** Search results only: the transcript line the query matched. */
  match_snippet?: string | null
}

export interface NoteDetail extends NoteSummary {
  transcript: string | null
  source: string | null
  original_filename: string | null
  mime_type: string | null
  transcription_model: string | null
}

export interface NoteCreated {
  id: string
  status: string
}

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function throwIfNotOk(response: Response): Promise<void> {
  if (response.ok) return
  let detail = `request failed (${response.status})`
  try {
    const body = (await response.json()) as { detail?: string }
    if (body.detail) detail = body.detail
  } catch {
    // non-JSON error body; keep the generic message
  }
  throw new ApiError(response.status, detail)
}

async function parseOrThrow<T>(response: Response): Promise<T> {
  await throwIfNotOk(response)
  return (await response.json()) as T
}

export function listNotes(): Promise<NoteSummary[]> {
  return fetch('/api/notes').then((r) => parseOrThrow<NoteSummary[]>(r))
}

export function getNote(noteId: string): Promise<NoteDetail> {
  return fetch(`/api/notes/${encodeURIComponent(noteId)}`).then((r) => parseOrThrow<NoteDetail>(r))
}

export function searchNotes(query: string): Promise<NoteSummary[]> {
  const params = new URLSearchParams({ q: query })
  return fetch(`/api/search?${params.toString()}`).then((r) => parseOrThrow<NoteSummary[]>(r))
}

export function uploadFile(file: File): Promise<NoteCreated> {
  const body = new FormData()
  body.append('file', file, file.name)
  return fetch('/api/notes', { method: 'POST', body }).then((r) => parseOrThrow<NoteCreated>(r))
}

export function uploadMicBlob(blob: Blob, mimeType: string): Promise<NoteCreated> {
  const body = new FormData()
  body.append('file', new File([blob], 'recording', { type: mimeType }))
  return fetch('/api/notes/mic', { method: 'POST', body }).then((r) => parseOrThrow<NoteCreated>(r))
}

export function retryNote(noteId: string): Promise<NoteCreated> {
  return fetch(`/api/notes/${encodeURIComponent(noteId)}/retry`, { method: 'POST' }).then((r) =>
    parseOrThrow<NoteCreated>(r),
  )
}

/** Moves the note folder to the archive's .trash — recoverable in Finder, never erased. */
export function deleteNote(noteId: string): Promise<void> {
  return fetch(`/api/notes/${encodeURIComponent(noteId)}`, { method: 'DELETE' }).then(throwIfNotOk)
}

/** Undoes a delete: moves the note back out of the archive's .trash. */
export function restoreNote(noteId: string): Promise<void> {
  return fetch(`/api/notes/${encodeURIComponent(noteId)}/restore`, { method: 'POST' }).then(
    throwIfNotOk,
  )
}

export function audioUrl(noteId: string): string {
  return `/api/notes/${encodeURIComponent(noteId)}/audio`
}
