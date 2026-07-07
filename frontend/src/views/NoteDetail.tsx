import { useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import type { NoteDetail as NoteDetailData } from '../api'
import { audioUrl, getNote } from '../api'
import CopyButton from '../components/CopyButton'
import DeleteNoteButton from '../components/DeleteNoteButton'
import { describeSource, formatDetailStamp, formatDuration, humanizeModel } from '../format'

interface NoteDetailProps {
  noteId: string
  onBack: () => void
  onDeleted: (deleted: { id: string; title: string }) => void
}

export default function NoteDetail({ noteId, onBack, onDeleted }: NoteDetailProps): ReactElement {
  const [note, setNote] = useState<NoteDetailData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const titleRef = useRef<HTMLHeadingElement | null>(null)

  // Focus lands on the note title, not <body>, so keyboard/SR users keep their place.
  useEffect(() => {
    if (note !== null) titleRef.current?.focus()
  }, [note])

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

  // Machine internals never lead: provenance is a quieter second line in plain words.
  const provenance =
    note === null
      ? ''
      : [
          describeSource(note.source, note.original_filename),
          note.transcription_model === null
            ? ''
            : `transcribed by ${humanizeModel(note.transcription_model)}`,
        ]
          .filter((part) => part !== '')
          .join(' · ')

  return (
    <article className="note-detail">
      <button
        type="button"
        className="secondary back-button"
        onClick={onBack}
        aria-keyshortcuts="Escape"
        title="Back to notes (Esc)"
      >
        ← Back to notes
      </button>
      {error !== null && <p role="alert">{error}</p>}
      {note === null && error === null && (
        <>
          <span role="status" className="visually-hidden">
            Loading note…
          </span>
          <div className="note-detail-skeleton" aria-hidden="true">
            <span className="skeleton-line skeleton-title" />
            <span className="skeleton-line skeleton-short" />
            <span className="skeleton-line skeleton-wide" />
            <span className="skeleton-line skeleton-wide" />
            <span className="skeleton-line" />
          </div>
        </>
      )}
      {note !== null && (
        <>
          <h2 tabIndex={-1} ref={titleRef}>
            {note.title}
          </h2>
          <div className="note-meta-block">
            <p className="note-meta">
              {formatDetailStamp(note.captured_at)}
              {note.duration_seconds !== null && ` · ${formatDuration(note.duration_seconds)}`}
            </p>
            {provenance !== '' && <p className="note-meta">{provenance}</p>}
          </div>
          <div className="note-actions">
            <CopyButton getText={async () => note.transcript ?? ''} />
            <DeleteNoteButton
              noteId={note.id}
              onDeleted={() => onDeleted({ id: note.id, title: note.title })}
            />
          </div>
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
