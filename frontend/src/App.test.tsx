import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import App from './App'
import type { NoteSummary } from './api'
import {
  grantMicrophone,
  installMockRecorder,
  jsonResponse,
  stubClipboard,
  stubFetch,
} from './test-helpers'
import type { FetchCall } from './test-helpers'

const processing: NoteSummary = {
  id: 'p1',
  status: 'processing',
  title: '2026-07-06 10:02',
  captured_at: '2026-07-06T10:02:00+01:00',
  duration_seconds: null,
  error: null,
  has_audio: true,
}

const failed: NoteSummary = {
  id: 'f1',
  status: 'failed',
  title: '2026-07-06 09:30',
  captured_at: '2026-07-06T09:30:00+01:00',
  duration_seconds: null,
  error: 'engine exploded',
  has_audio: true,
}

const done: NoteSummary = {
  id: 'd1',
  status: 'done',
  title: 'remember the deposit',
  captured_at: '2026-07-06T09:00:00+01:00',
  duration_seconds: 4.2,
  error: null,
  has_audio: true,
}

const groceries: NoteSummary = { ...done, id: 'd2', title: 'groceries for the week' }

function listCalls(calls: FetchCall[]): number {
  return calls.filter((call) => call.url === '/api/notes' && call.method === 'GET').length
}

afterEach(() => {
  vi.useRealTimers()
})

test('an empty archive renders the first-run empty state pointing at Record', async () => {
  installMockRecorder()
  stubFetch(() => jsonResponse([]))
  render(<App />)
  expect(await screen.findByText(/no notes yet/i)).toBeInTheDocument()
})

test('list renders processing, failed (with retry), and done states', async () => {
  installMockRecorder()
  const { calls } = stubFetch((url, init) => {
    if (url === '/api/notes/f1/retry' && init?.method === 'POST') {
      return jsonResponse({ id: 'f1', status: 'processing' }, 202)
    }
    return jsonResponse([processing, failed, done])
  })
  render(<App />)

  expect(await screen.findByText('transcribing…')).toBeInTheDocument()
  expect(screen.getByText('failed')).toBeInTheDocument()
  expect(screen.getByText('done')).toBeInTheDocument()
  expect(screen.getByText('engine exploded')).toBeInTheDocument()

  // Only the done card is openable; processing/failed titles are not buttons.
  expect(screen.getByRole('button', { name: /^remember the deposit$/i })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /2026-07-06 10:02/i })).not.toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', { name: /^retry\b/i }))
  await waitFor(() =>
    expect(
      calls.some((call) => call.url === '/api/notes/f1/retry' && call.method === 'POST'),
    ).toBe(true),
  )
})

test('polling refreshes while a note is processing and stops once all are terminal', async () => {
  installMockRecorder()
  vi.useFakeTimers()
  let listRequests = 0
  const { calls } = stubFetch((url) => {
    if (url === '/api/notes') {
      listRequests += 1
      return jsonResponse(listRequests === 1 ? [processing] : [done])
    }
    return jsonResponse([])
  })
  render(<App />)

  await act(async () => {
    await vi.advanceTimersByTimeAsync(0)
  })
  expect(listCalls(calls)).toBe(1)

  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000) // poll fires; the note is now done
  })
  expect(listCalls(calls)).toBe(2)

  await act(async () => {
    await vi.advanceTimersByTimeAsync(8000) // all terminal: no runaway timers
  })
  expect(listCalls(calls)).toBe(2)
})

test('search filters, clearing restores the full list without a search request', async () => {
  installMockRecorder()
  const { calls } = stubFetch((url) => {
    if (url.startsWith('/api/search')) return jsonResponse([done])
    return jsonResponse([done, groceries])
  })
  render(<App />)
  expect(await screen.findByText('groceries for the week')).toBeInTheDocument()

  await userEvent.type(screen.getByRole('searchbox'), 'deposit')
  await userEvent.click(screen.getByRole('button', { name: /^search$/i }))

  await waitFor(() =>
    expect(screen.queryByText('groceries for the week')).not.toBeInTheDocument(),
  )
  // Recall ends in a paste: submitting lands focus on the first openable hit.
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'remember the deposit' })).toHaveFocus(),
  )

  await userEvent.clear(screen.getByRole('searchbox'))
  expect(await screen.findByText('groceries for the week')).toBeInTheDocument()
  expect(calls.filter((call) => call.url.startsWith('/api/search'))).toHaveLength(1)
})

test('done cards copy their transcript to the clipboard in one click (R18)', async () => {
  installMockRecorder()
  const clipboard = stubClipboard()
  stubFetch((url) => {
    if (url === '/api/notes/d1') {
      return jsonResponse({
        ...done,
        transcript: 'remember the deposit\nsecond line',
        source: 'mic',
        original_filename: null,
        mime_type: 'audio/webm',
        transcription_model: 'mlx-community/whisper-large-v3-turbo',
      })
    }
    return jsonResponse([processing, done])
  })
  render(<App />)
  await screen.findByText('remember the deposit')

  // The accessible name carries the note title, so cards never all announce "Copy".
  const copyButtons = screen.getAllByRole('button', { name: /^copy ?— remember the deposit$/i })
  expect(copyButtons).toHaveLength(1) // only the done card offers copy

  await userEvent.click(copyButtons[0])
  expect(await screen.findByRole('button', { name: /copied/i })).toBeInTheDocument()
  expect(clipboard.writes).toEqual(['remember the deposit\nsecond line'])
})

test('opening a done note shows its transcript; Back preserves the active search', async () => {
  installMockRecorder()
  stubFetch((url) => {
    if (url === '/api/notes/d1') {
      return jsonResponse({
        ...done,
        transcript: 'remember the deposit\nsecond line',
        source: 'mic',
        original_filename: null,
        mime_type: 'audio/webm',
        transcription_model: 'mlx-community/whisper-large-v3-turbo',
      })
    }
    if (url.startsWith('/api/search')) return jsonResponse([done])
    return jsonResponse([done, groceries])
  })
  render(<App />)
  await screen.findByText('groceries for the week')

  await userEvent.type(screen.getByRole('searchbox'), 'deposit')
  await userEvent.click(screen.getByRole('button', { name: /^search$/i }))
  await waitFor(() => expect(screen.queryByText('groceries for the week')).not.toBeInTheDocument())

  await userEvent.click(screen.getByRole('button', { name: /^remember the deposit$/i }))
  expect(await screen.findByText('second line')).toBeInTheDocument()
  expect(screen.getByTestId('audio-player')).toHaveAttribute('src', '/api/notes/d1/audio')

  // Provenance in plain words — the vendor path never reaches the owner's eyes.
  expect(screen.getByText(/transcribed by Whisper large-v3-turbo/)).toBeInTheDocument()
  expect(screen.getByText(/recorded from the mic/)).toBeInTheDocument()
  expect(screen.queryByText(/mlx-community/)).not.toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', { name: /back to notes/i }))
  expect(screen.getByRole('searchbox')).toHaveValue('deposit')
  expect(screen.getByRole('button', { name: /^remember the deposit$/i })).toBeInTheDocument()
  expect(screen.queryByText('groceries for the week')).not.toBeInTheDocument()
})

test('search results show the matched line with the query emphasized', async () => {
  installMockRecorder()
  stubFetch((url) => {
    if (url.startsWith('/api/search')) {
      return jsonResponse([
        { ...done, match_snippet: '…remember the deposit before Friday morning…' },
        { ...groceries, match_snippet: 'groceries for the week' },
      ])
    }
    return jsonResponse([done, groceries])
  })
  render(<App />)
  expect(await screen.findByText('groceries for the week')).toBeInTheDocument()

  await userEvent.type(screen.getByRole('searchbox'), 'deposit')
  await userEvent.click(screen.getByRole('button', { name: /^search$/i }))

  expect(await screen.findByText(/before Friday morning/)).toBeInTheDocument()
  expect(screen.getByText('deposit', { selector: 'mark' })).toBeInTheDocument()
  // A snippet that merely echoes the title is suppressed — no stutter on short notes.
  expect(screen.getAllByText('groceries for the week')).toHaveLength(1)
})

test('R starts a recording and / focuses search, but never while typing', async () => {
  installMockRecorder()
  grantMicrophone()
  stubFetch(() => jsonResponse([done]))
  render(<App />)
  expect(await screen.findByRole('button', { name: /record/i })).toBeInTheDocument()

  await userEvent.keyboard('/')
  expect(screen.getByRole('searchbox')).toHaveFocus()

  // Typing an r into the search box must not start a recording.
  await userEvent.keyboard('r')
  expect(screen.getByRole('searchbox')).toHaveValue('r')
  expect(screen.queryByRole('button', { name: /stop/i })).not.toBeInTheDocument()

  // Esc backs out in steps: first press clears the query, second leaves the field —
  // onto the Search button, never onto <body> (Focus Doctrine).
  await userEvent.keyboard('{Escape}')
  expect(screen.getByRole('searchbox')).toHaveValue('')
  expect(screen.getByRole('searchbox')).toHaveFocus()
  await userEvent.keyboard('{Escape}')
  expect(screen.getByRole('button', { name: /^search$/i })).toHaveFocus()

  // One key, both directions: R starts the take and R stops it.
  await userEvent.keyboard('r')
  expect(await screen.findByRole('button', { name: /stop/i })).toBeInTheDocument()
  await userEvent.keyboard('r')
  expect(await screen.findByRole('button', { name: /record/i })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /stop/i })).not.toBeInTheDocument()
})

test('the clear button empties the search and restores the archive', async () => {
  installMockRecorder()
  stubFetch((url) => {
    if (url.startsWith('/api/search')) return jsonResponse([done])
    return jsonResponse([done, groceries])
  })
  render(<App />)
  expect(await screen.findByText('groceries for the week')).toBeInTheDocument()

  await userEvent.type(screen.getByRole('searchbox'), 'deposit')
  await userEvent.click(screen.getByRole('button', { name: /^search$/i }))
  await waitFor(() =>
    expect(screen.queryByText('groceries for the week')).not.toBeInTheDocument(),
  )

  await userEvent.click(screen.getByRole('button', { name: /clear search/i }))
  expect(screen.getByRole('searchbox')).toHaveValue('')
  expect(screen.getByRole('searchbox')).toHaveFocus()
  expect(await screen.findByText('groceries for the week')).toBeInTheDocument()
})

test('deleting from the list leaves an undo trace that restores the note', async () => {
  installMockRecorder()
  let archive = [done, groceries]
  const { calls } = stubFetch((url, init) => {
    if (url === '/api/notes/d1' && init?.method === 'DELETE') {
      archive = [groceries]
      return new Response(null, { status: 204 })
    }
    if (url === '/api/notes/d1/restore' && init?.method === 'POST') {
      archive = [done, groceries]
      return new Response(null, { status: 204 })
    }
    return jsonResponse(archive)
  })
  render(<App />)
  await screen.findByText('remember the deposit')

  await userEvent.click(screen.getByRole('button', { name: /^delete ?— remember the deposit$/i }))
  await userEvent.click(screen.getByRole('button', { name: 'Move to trash' }))

  // The card's place is taken by an Undo trace, which receives focus (Focus Doctrine).
  const undo = await screen.findByRole('button', { name: /^undo$/i })
  expect(screen.getByText(/moved to trash/i)).toBeInTheDocument()
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: 'remember the deposit' })).not.toBeInTheDocument(),
  )
  await waitFor(() => expect(undo).toHaveFocus())

  await userEvent.click(undo)
  expect(await screen.findByRole('button', { name: 'remember the deposit' })).toBeInTheDocument()
  expect(calls.some((c) => c.url === '/api/notes/d1/restore' && c.method === 'POST')).toBe(true)
  // Focus lands back on the restored note's opener.
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'remember the deposit' })).toHaveFocus(),
  )
})

test('a failed undo keeps the trace and says so, never pretending the note came back', async () => {
  installMockRecorder()
  let archive = [done, groceries]
  stubFetch((url, init) => {
    if (url === '/api/notes/d1' && init?.method === 'DELETE') {
      archive = [groceries]
      return new Response(null, { status: 204 })
    }
    // The trash entry moved in Finder meanwhile — the restore cannot find it.
    if (url === '/api/notes/d1/restore' && init?.method === 'POST') {
      return new Response(null, { status: 404 })
    }
    return jsonResponse(archive)
  })
  render(<App />)
  await screen.findByText('remember the deposit')

  await userEvent.click(screen.getByRole('button', { name: /^delete ?— remember the deposit$/i }))
  await userEvent.click(screen.getByRole('button', { name: 'Move to trash' }))
  await userEvent.click(await screen.findByRole('button', { name: /^undo$/i }))

  // The note did not return, so the notice stays and names the failure honestly.
  expect(await screen.findByText(/couldn.t restore/i)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'remember the deposit' })).not.toBeInTheDocument()
  // Undo is offered again rather than leaving the user stranded.
  expect(screen.getByRole('button', { name: /^undo$/i })).toBeEnabled()
})

test('undoing a deleted failed note lands focus on the restored card, never <body>', async () => {
  installMockRecorder()
  let archive: NoteSummary[] = [failed]
  stubFetch((url, init) => {
    if (url === '/api/notes/f1' && init?.method === 'DELETE') {
      archive = []
      return new Response(null, { status: 204 })
    }
    if (url === '/api/notes/f1/restore' && init?.method === 'POST') {
      archive = [failed]
      return new Response(null, { status: 204 })
    }
    return jsonResponse(archive)
  })
  render(<App />)
  await screen.findByText('engine exploded')

  await userEvent.click(screen.getByRole('button', { name: /^delete ?— 2026-07-06 09:30$/i }))
  await userEvent.click(screen.getByRole('button', { name: 'Move to trash' }))
  await userEvent.click(await screen.findByRole('button', { name: /^undo$/i }))

  // A failed note has no open button; focus must fall back to its card, not the body.
  await screen.findByText('engine exploded')
  await waitFor(() => expect(document.querySelector('[data-note-id="f1"]')).toHaveFocus())
})

test('opening a note moves focus to its title, never dropping to <body> (Focus Doctrine)', async () => {
  installMockRecorder()
  stubFetch((url) => {
    if (url === '/api/notes/d1') {
      return jsonResponse({
        ...done,
        transcript: 'remember the deposit',
        source: 'mic',
        original_filename: null,
        mime_type: 'audio/webm',
        transcription_model: 'fake-1',
      })
    }
    return jsonResponse([done])
  })
  render(<App />)

  await userEvent.click(await screen.findByRole('button', { name: /^remember the deposit$/i }))
  await waitFor(() =>
    expect(screen.getByRole('heading', { name: 'remember the deposit' })).toHaveFocus(),
  )
})

test('an unreachable backend shows recovery, never a false empty state', async () => {
  installMockRecorder()
  let failing = true
  stubFetch((url) => {
    if (url === '/api/notes') {
      return failing ? new Error('connection refused') : jsonResponse([done])
    }
    return jsonResponse([])
  })
  render(<App />)

  expect(await screen.findByText(/couldn.t reach the archive/i)).toBeInTheDocument()
  expect(screen.queryByText(/no notes yet/i)).not.toBeInTheDocument()

  failing = false
  await userEvent.click(screen.getByRole('button', { name: /try again/i }))
  expect(await screen.findByRole('button', { name: /^remember the deposit$/i })).toBeInTheDocument()
})

test('escape closes the note detail and returns to the list', async () => {
  installMockRecorder()
  stubFetch((url) => {
    if (url === '/api/notes/d1') {
      return jsonResponse({
        ...done,
        transcript: 'remember the deposit',
        source: 'mic',
        original_filename: null,
        mime_type: 'audio/webm',
        transcription_model: 'fake-1',
      })
    }
    return jsonResponse([done])
  })
  render(<App />)

  await userEvent.click(await screen.findByRole('button', { name: /^remember the deposit$/i }))
  expect(await screen.findByRole('button', { name: /back to notes/i })).toBeInTheDocument()

  await userEvent.keyboard('{Escape}')
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: /back to notes/i })).not.toBeInTheDocument(),
  )
  expect(screen.getByRole('searchbox')).toBeInTheDocument()
})
