import { useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import type { NoteDetail as NoteDetailData } from '../api'
import { audioUrl, getNote } from '../api'
import CopyButton from '../components/CopyButton'

interface NoteDetailProps {
  noteId: string
  onBack: () => void
}

export default function NoteDetail({ noteId, onBack }: NoteDetailProps): ReactElement {
  const [note, setNote] = useState<NoteDetailData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getNote(noteId).then(
      (data) => {
        if (!cancelled) setNote(data)
      },
      (cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'could not load note')
      },
    )
    return () => {
      cancelled = true
    }
  }, [noteId])

  return (
    <article className="note-detail">
      <button type="button" className="secondary back-button" onClick={onBack}>
        ← Back to notes
      </button>
      {error !== null && <p role="alert">{error}</p>}
      {note !== null && (
        <>
          <h2>{note.title}</h2>
          <p className="note-meta">
            {note.captured_at !== null && new Date(note.captured_at).toLocaleString()}
            {note.source !== null && ` · ${note.source}`}
            {note.original_filename !== null && ` · ${note.original_filename}`}
            {note.transcription_model !== null && ` · ${note.transcription_model}`}
          </p>
          <CopyButton getText={async () => note.transcript ?? ''} />
          {note.has_audio && (
            /* Seeking works because the backend serves Range requests. */
            <audio controls src={audioUrl(note.id)} data-testid="audio-player" />
          )}
          <div className="transcript">
            {note.transcript ? (
              note.transcript.split('\n').map((line, index) => <p key={index}>{line}</p>)
            ) : (
              <p className="empty-state">No speech detected in this recording.</p>
            )}
          </div>
        </>
      )}
    </article>
  )
}
