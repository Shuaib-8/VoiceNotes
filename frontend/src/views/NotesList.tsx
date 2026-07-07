import type { ReactElement, ReactNode } from 'react'
import type { NoteSummary } from '../api'
import { getNote, retryNote } from '../api'
import ContextSuffix from '../components/ContextSuffix'
import CopyButton from '../components/CopyButton'
import DeleteNoteButton from '../components/DeleteNoteButton'
import StatusChip from '../components/StatusChip'
import { formatDuration, formatListStamp } from '../format'

/** On one-line notes the matched line IS the title — showing both reads as a stutter. */
function snippetEchoesTitle(snippet: string, title: string): boolean {
  const bare = (text: string): string => text.replaceAll('…', '').trim()
  return bare(snippet) === bare(title)
}

function highlightMatch(snippet: string, query: string | null): ReactNode {
  if (query === null || query === '') return snippet
  const index = snippet.toLowerCase().indexOf(query.toLowerCase())
  if (index < 0) return snippet
  return (
    <>
      {snippet.slice(0, index)}
      <mark>{snippet.slice(index, index + query.length)}</mark>
      {snippet.slice(index + query.length)}
    </>
  )
}

interface NotesListProps {
  notes: NoteSummary[]
  query: string | null
  onOpen: (noteId: string) => void
  onChanged: () => void
  onTrashed: (note: NoteSummary) => void
}

export default function NotesList({
  notes,
  query,
  onOpen,
  onChanged,
  onTrashed,
}: NotesListProps): ReactElement {
  // A non-null query is exactly what "searching" means; no separate prop can drift from it.
  const searching = query !== null
  if (notes.length === 0) {
    return searching ? (
      // role="status": screen readers hear the outcome instead of a silent list swap.
      <p className="empty-state" role="status">
        No notes match that search.
      </p>
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
          // data-note-id + tabIndex make every card a script-focus target, so undo can
          // land focus on a restored note even when it failed and has no open button.
          <li
            key={note.id}
            className={`note-card note-${note.status}`}
            data-note-id={note.id}
            tabIndex={-1}
          >
            <div className="note-main">
              {openable ? (
                <button
                  type="button"
                  className="note-open"
                  data-note-open={note.id}
                  onClick={() => onOpen(note.id)}
                >
                  <span className="note-title">{note.title}</span>
                </button>
              ) : (
                <span className="note-title">{note.title}</span>
              )}
              {/* Recall shows the line you half-remember, not just the note's first words. */}
              {searching &&
                note.match_snippet != null &&
                !snippetEchoesTitle(note.match_snippet, note.title) && (
                  <span className="note-snippet">{highlightMatch(note.match_snippet, query)}</span>
                )}
              <span className="note-meta">
                {formatListStamp(note.captured_at)}
                {note.duration_seconds !== null && ` · ${formatDuration(note.duration_seconds)}`}
              </span>
            </div>
            <div className="note-side">
              <StatusChip status={note.status} />
              {note.status === 'done' && (
                <CopyButton
                  getText={() => getNote(note.id).then((detail) => detail.transcript ?? '')}
                  context={note.title}
                />
              )}
              {/* Deleting mid-transcription is a 409 server-side; don't offer it. */}
              {note.status !== 'processing' && (
                <DeleteNoteButton
                  noteId={note.id}
                  context={note.title}
                  onDeleted={() => onTrashed(note)}
                />
              )}
            </div>
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
                  <ContextSuffix context={note.title} />
                </button>
              </span>
            )}
          </li>
        )
      })}
    </ul>
  )
}
