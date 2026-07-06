import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import type { NoteSummary } from './api'
import { listNotes, searchNotes } from './api'
import SearchBox from './components/SearchBox'
import NoteDetail from './views/NoteDetail'
import NotesList from './views/NotesList'
import RecordView from './views/RecordView'
import './App.css'

type Route = { view: 'list' } | { view: 'note'; noteId: string }

const POLL_INTERVAL_MS = 2000

export default function App(): ReactElement {
  const [route, setRoute] = useState<Route>({ view: 'list' })
  const [notes, setNotes] = useState<NoteSummary[]>([])
  const [results, setResults] = useState<NoteSummary[] | null>(null) // null = not searching
  const savedScrollRef = useRef(0)

  const refresh = useCallback((): void => {
    void listNotes().then(setNotes, () => undefined)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const anyProcessing = notes.some((note) => note.status === 'processing')
  useEffect(() => {
    if (!anyProcessing) return
    const timer = window.setInterval(refresh, POLL_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [anyProcessing, refresh])

  const openNote = (noteId: string): void => {
    savedScrollRef.current = window.scrollY
    setRoute({ view: 'note', noteId })
  }

  const backToList = (): void => {
    setRoute({ view: 'list' })
    requestAnimationFrame(() => window.scrollTo(0, savedScrollRef.current))
  }

  const search = (query: string): void => {
    void searchNotes(query).then(setResults, () => undefined)
  }

  const clearSearch = (): void => {
    setResults(null)
  }

  return (
    <main className="app">
      {/* The list stays mounted under Detail so the active search and recorder survive Back. */}
      <div hidden={route.view === 'note'}>
        <header className="app-header">
          <h1>voice-notes</h1>
          <SearchBox onSearch={search} onClear={clearSearch} />
        </header>
        <RecordView onIngested={refresh} />
        <NotesList
          notes={results ?? notes}
          searching={results !== null}
          onOpen={openNote}
          onChanged={refresh}
        />
      </div>
      {route.view === 'note' && <NoteDetail noteId={route.noteId} onBack={backToList} />}
    </main>
  )
}
