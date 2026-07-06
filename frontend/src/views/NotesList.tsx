import type { ReactElement } from 'react'
import type { NoteSummary } from '../api'
import { getNote, retryNote } from '../api'
import CopyButton from '../components/CopyButton'
import StatusChip from '../components/StatusChip'

function formatCapturedAt(iso: string | null): string {
  if (iso === null) return ''
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString()
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return ''
  const total = Math.round(seconds)
  return `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, '0')}`
}

interface NotesListProps {
  notes: NoteSummary[]
  searching: boolean
  onOpen: (noteId: string) => void
  onChanged: () => void
}

export default function NotesList({
  notes,
  searching,
  onOpen,
  onChanged,
}: NotesListProps): ReactElement {
  if (notes.length === 0) {
    return searching ? (
      <p className="empty-state">No notes match that search.</p>
    ) : (
      <p className="empty-state">
        No notes yet — hit <strong>● Record</strong> above and speak your first thought.
      </p>
    )
  }

  return (
    <ul className="notes-list">
      {notes.map((note) => {
        const openable = note.status === 'done' // R15 applies to complete notes only
        return (
          <li key={note.id} className={`note-card note-${note.status}`}>
            {openable ? (
              <button type="button" className="note-open" onClick={() => onOpen(note.id)}>
                <span className="note-title">{note.title}</span>
              </button>
            ) : (
              <span className="note-title">{note.title}</span>
            )}
            <span className="note-meta">
              {formatCapturedAt(note.captured_at)}
              {note.duration_seconds !== null && ` · ${formatDuration(note.duration_seconds)}`}
            </span>
            <StatusChip status={note.status} />
            {note.status === 'done' && (
              <CopyButton
                getText={() => getNote(note.id).then((detail) => detail.transcript ?? '')}
              />
            )}
            {note.status === 'failed' && (
              <span className="note-failed">
                {note.error !== null && <span className="note-error">{note.error}</span>}
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    void retryNote(note.id).then(onChanged, onChanged)
                  }}
                >
                  Retry
                </button>
              </span>
            )}
          </li>
        )
      })}
    </ul>
  )
}
