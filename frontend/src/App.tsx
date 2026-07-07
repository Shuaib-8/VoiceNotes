import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import type { NoteSummary } from './api'
import { listNotes, restoreNote, searchNotes } from './api'
import SearchBox from './components/SearchBox'
import ThemeToggle from './components/ThemeToggle'
import NoteDetail from './views/NoteDetail'
import NotesList from './views/NotesList'
import RecordView from './views/RecordView'
import './App.css'

type Route = { view: 'list' } | { view: 'note'; noteId: string }

const POLL_INTERVAL_MS = 2000

// Focus doctrine: hand focus to a freshly-rendered element after the next paint,
// once React has committed the DOM the selectors expect to find. Tries each selector
// in order so a caller can name a preferred target and a fallback (e.g. a restored
// note's open button, or its card when the note failed and has no opener).
function focusAfterPaint(...selectors: string[]): void {
  requestAnimationFrame(() => {
    for (const selector of selectors) {
      const target = document.querySelector<HTMLElement>(selector)
      if (target !== null) {
        target.focus()
        return
      }
    }
  })
}

export default function App(): ReactElement {
  const [route, setRoute] = useState<Route>({ view: 'list' })
  const [notes, setNotes] = useState<NoteSummary[] | null>(null) // null = first load in flight
  const [unreachable, setUnreachable] = useState(false)
  const [results, setResults] = useState<NoteSummary[] | null>(null) // null = not searching
  // The last delete, held so its Undo trace can reverse it (nothing is ever lost).
  const [trashed, setTrashed] = useState<{ id: string; title: string } | null>(null)
  // The Undo trace is honest about its own outcome: 'undoing' guards a double-click,
  // 'failed' keeps the notice up (never lies that a note came back when it didn't).
  const [undoStatus, setUndoStatus] = useState<'idle' | 'undoing' | 'failed'>('idle')
  const savedScrollRef = useRef(0)
  const activeQueryRef = useRef<string | null>(null)

  const refresh = useCallback((): Promise<void> => {
    // A delete or retry must also update what a filtered list is showing.
    const query = activeQueryRef.current
    if (query !== null) void searchNotes(query).then(setResults, () => undefined)
    return listNotes().then(
      (fetched) => {
        setNotes(fetched)
        setUnreachable(false)
      },
      // Only the first load may claim "unreachable"; a failed background poll
      // keeps showing the archive we already have rather than a false alarm.
      () => setUnreachable(true),
    )
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const anyProcessing = (notes ?? []).some((note) => note.status === 'processing')
  useEffect(() => {
    if (!anyProcessing) return
    const timer = window.setInterval(() => void refresh(), POLL_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [anyProcessing, refresh])

  const openNote = (noteId: string): void => {
    savedScrollRef.current = window.scrollY
    setRoute({ view: 'note', noteId })
  }

  const backToList = useCallback((): void => {
    const closingNoteId = route.view === 'note' ? route.noteId : null
    setRoute({ view: 'list' })
    requestAnimationFrame(() => {
      window.scrollTo(0, savedScrollRef.current)
      // Hand focus back to the title that opened this note; after a delete the
      // opener is gone and focus stays where the user left it rather than jumping.
      if (closingNoteId !== null) {
        document
          .querySelector<HTMLElement>(`[data-note-open="${CSS.escape(closingNoteId)}"]`)
          ?.focus()
      }
    })
  }, [route])

  // Esc is the muscle-memory exit from the note overlay.
  useEffect(() => {
    if (route.view !== 'note') return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') backToList()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [route.view, backToList])

  // Capture and recall accelerators: R records, / searches — never while typing.
  useEffect(() => {
    if (route.view !== 'list') return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      if (typing) return
      if (event.key === '/') {
        event.preventDefault()
        document.querySelector<HTMLInputElement>('.searchbox input')?.focus()
      } else if (event.key === 'r' || event.key === 'R') {
        // One key, both directions: Record while idle, Stop while recording.
        // Neither exists during the discard confirm, so R can't preempt that decision.
        const takeKey = document.querySelector<HTMLButtonElement>('.record-button, .stop-button')
        if (takeKey !== null) {
          event.preventDefault()
          takeKey.click()
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [route.view])

  const search = (query: string): void => {
    activeQueryRef.current = query
    void searchNotes(query).then((found) => {
      focusFirstResultRef.current = true
      setResults(found)
    }, () => undefined)
  }

  // Recall ends in a paste, not in Tab-Tab-Tab: a submitted search lands focus on
  // the first openable hit. An effect (not rAF) so it can't outlive this mount.
  const focusFirstResultRef = useRef(false)
  useEffect(() => {
    if (!focusFirstResultRef.current) return
    focusFirstResultRef.current = false
    document.querySelector<HTMLElement>('.notes-list .note-open')?.focus()
  }, [results])

  const clearSearch = (): void => {
    activeQueryRef.current = null
    setResults(null)
  }

  const noteTrashed = useCallback(
    (note: { id: string; title: string }): void => {
      setTrashed(note)
      setUndoStatus('idle')
      // The vanished card's place is taken by the Undo trace, which takes focus.
      void refresh().then(() => focusAfterPaint('.trash-notice button'))
    },
    [refresh],
  )

  const undoTrash = (note: { id: string; title: string }): void => {
    setUndoStatus('undoing')
    void restoreNote(note.id)
      .then(() => refresh())
      .then(() => {
        // Only now is the note actually back: clear the trace and land focus on it.
        // A failed note has no opener, so fall back to its card (both carry data attrs).
        setTrashed(null)
        setUndoStatus('idle')
        focusAfterPaint(
          `[data-note-open="${CSS.escape(note.id)}"]`,
          `[data-note-id="${CSS.escape(note.id)}"]`,
        )
      })
      // Restore can fail if the trash entry moved in Finder meanwhile — keep the notice,
      // say so, and let the user retry rather than pretend the note returned.
      .catch(() => {
        setUndoStatus('failed')
        void refresh()
      })
  }

  const noteDeleted = (deleted: { id: string; title: string }): void => {
    backToList()
    noteTrashed(deleted)
  }

  return (
    <main className="app">
      {/* The list stays mounted under Detail so the active search and recorder survive Back. */}
      <div hidden={route.view === 'note'}>
        <header className="app-header">
          <h1>VoiceNotes</h1>
          {/* After search in DOM order: Tab reaches the primary task before the preference. */}
          <SearchBox onSearch={search} onClear={clearSearch} />
          <ThemeToggle />
        </header>
        <RecordView onIngested={refresh} />
        {trashed !== null && (
          <p className="trash-notice" role="status">
            <span>
              {undoStatus === 'failed'
                ? `Couldn’t restore “${trashed.title}” — it may have moved. Try again.`
                : `“${trashed.title}” moved to trash.`}
            </span>
            <button
              type="button"
              className="secondary"
              disabled={undoStatus === 'undoing'}
              onClick={() => undoTrash(trashed)}
            >
              Undo
            </button>
          </p>
        )}
        {notes === null && unreachable ? (
          <div className="empty-state" role="alert">
            <p>Couldn’t reach the archive — the backend isn’t responding.</p>
            <button type="button" onClick={refresh}>
              Try again
            </button>
          </div>
        ) : notes === null ? (
          <>
            <span role="status" className="visually-hidden">
              Loading notes…
            </span>
            <ul className="notes-list" aria-hidden="true">
              {[0, 1, 2].map((row) => (
                <li key={row} className="note-card skeleton-card">
                  <div className="note-main">
                    <span className="skeleton-line" />
                    <span className="skeleton-line skeleton-short" />
                  </div>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <NotesList
            notes={results ?? notes}
            query={results !== null ? activeQueryRef.current : null}
            onOpen={openNote}
            onChanged={refresh}
            onTrashed={noteTrashed}
          />
        )}
      </div>
      {route.view === 'note' && (
        <NoteDetail noteId={route.noteId} onBack={backToList} onDeleted={noteDeleted} />
      )}
    </main>
  )
}
