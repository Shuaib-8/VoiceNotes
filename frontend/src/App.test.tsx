import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import App from './App'
import type { NoteSummary } from './api'
import { PLAYBACK_SPEED_STORAGE_KEY } from './playbackSpeed'
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
  localStorage.clear()
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

test('opening a note with audio shows the playback-speed control at 1x by default', async () => {
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
  expect(await screen.findByRole('radiogroup', { name: /playback speed/i })).toBeInTheDocument()
  const audio = screen.getByTestId('audio-player') as HTMLAudioElement
  expect(audio.playbackRate).toBe(1)
})

test('selecting 2x sets the audio playbackRate without touching its src', async () => {
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
  const audio = (await screen.findByTestId('audio-player')) as HTMLAudioElement
  const src = audio.getAttribute('src')

  await userEvent.click(screen.getByRole('radio', { name: '2×' }))

  expect(audio.playbackRate).toBe(2)
  expect(audio.defaultPlaybackRate).toBe(2)
  expect(audio.getAttribute('src')).toBe(src)
})

test('a stored speed of 1.5 is applied to the audio element on mount', async () => {
  installMockRecorder()
  localStorage.setItem(PLAYBACK_SPEED_STORAGE_KEY, '1.5')
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
  const audio = await screen.findByTestId('audio-player')
  await waitFor(() => expect((audio as HTMLAudioElement).playbackRate).toBe(1.5))
  expect((audio as HTMLAudioElement).defaultPlaybackRate).toBe(1.5)
  expect(screen.getByRole('radio', { name: '1.5×' })).toBeChecked()
})

test('a note without audio renders no playback-speed control', async () => {
  installMockRecorder()
  const noAudio: NoteSummary = { ...done, id: 'd3', title: 'no audio note', has_audio: false }
  stubFetch((url) => {
    if (url === '/api/notes/d3') {
      return jsonResponse({
        ...noAudio,
        transcript: 'no audio here',
        source: 'upload',
        original_filename: 'clip.wav',
        mime_type: null,
        transcription_model: null,
      })
    }
    return jsonResponse([noAudio])
  })
  render(<App />)

  await userEvent.click(await screen.findByRole('button', { name: /^no audio note$/i }))
  await screen.findByText('no audio here')
  expect(screen.queryByRole('radiogroup', { name: /playback speed/i })).not.toBeInTheDocument()
  expect(screen.queryByTestId('audio-player')).not.toBeInTheDocument()
})

test('a selected speed persists from one opened note to the next', async () => {
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
    if (url === '/api/notes/d2') {
      return jsonResponse({
        ...groceries,
        transcript: 'groceries for the week',
        source: 'mic',
        original_filename: null,
        mime_type: 'audio/webm',
        transcription_model: 'fake-1',
      })
    }
    return jsonResponse([done, groceries])
  })
  render(<App />)

  await userEvent.click(await screen.findByRole('button', { name: /^remember the deposit$/i }))
  await userEvent.click(await screen.findByRole('radio', { name: '1.5×' }))
  expect((screen.getByTestId('audio-player') as HTMLAudioElement).playbackRate).toBe(1.5)

  await userEvent.click(screen.getByRole('button', { name: /back to notes/i }))
  await userEvent.click(await screen.findByRole('button', { name: /^groceries for the week$/i }))

  const secondAudio = await screen.findByTestId('audio-player')
  await waitFor(() => expect((secondAudio as HTMLAudioElement).playbackRate).toBe(1.5))
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

test('Q discards a fresh recording silently (AE1)', async () => {
  installMockRecorder()
  grantMicrophone()
  const { calls } = stubFetch(() => jsonResponse([done]))
  render(<App />)
  expect(await screen.findByRole('button', { name: /^record$/i })).toBeInTheDocument()

  await userEvent.keyboard('r')
  expect(await screen.findByRole('button', { name: /stop/i })).toBeInTheDocument()

  await userEvent.keyboard('q')
  expect(await screen.findByRole('button', { name: /^record$/i })).toBeInTheDocument()
  expect(
    calls.filter((call) => call.url === '/api/notes/mic' && call.method === 'POST'),
  ).toHaveLength(0)
})

test('Q on a long take opens the discard confirm; Keep recording gets focus (AE2)', async () => {
  installMockRecorder()
  grantMicrophone()
  stubFetch(() => jsonResponse([done]))
  render(<App />)
  await userEvent.keyboard('r')
  expect(await screen.findByRole('button', { name: /stop/i })).toBeInTheDocument()

  const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 11_000)
  await userEvent.keyboard('q')
  expect(await screen.findByText(/discard this recording\?/i)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /keep recording/i })).toHaveFocus()

  // Confirming it's still the same take: Keep recording returns to Stop, not Record.
  await userEvent.click(screen.getByRole('button', { name: /keep recording/i }))
  expect(screen.getByRole('button', { name: /^stop$/i })).toBeInTheDocument()
  nowSpy.mockRestore()
})

test('Q while the discard confirm is showing does nothing (AE3)', async () => {
  installMockRecorder()
  grantMicrophone()
  stubFetch(() => jsonResponse([done]))
  render(<App />)
  await userEvent.keyboard('r')
  await screen.findByRole('button', { name: /stop/i })

  const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 11_000)
  await userEvent.keyboard('q')
  await screen.findByText(/discard this recording\?/i)

  await userEvent.keyboard('q')
  expect(screen.getByText(/discard this recording\?/i)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /keep recording/i })).toBeInTheDocument()
  nowSpy.mockRestore()
})

test('typing Q in the search box does not cancel a recording (AE4)', async () => {
  installMockRecorder()
  grantMicrophone()
  stubFetch(() => jsonResponse([done]))
  render(<App />)
  await userEvent.keyboard('r')
  await screen.findByRole('button', { name: /stop/i })

  await userEvent.keyboard('/')
  expect(screen.getByRole('searchbox')).toHaveFocus()
  await userEvent.keyboard('q')
  expect(screen.getByRole('searchbox')).toHaveValue('q')
  expect(screen.getByRole('button', { name: /stop/i })).toBeInTheDocument()
})

test('Q while idle is a no-op', async () => {
  installMockRecorder()
  grantMicrophone()
  stubFetch(() => jsonResponse([done]))
  render(<App />)
  expect(await screen.findByRole('button', { name: /^record$/i })).toBeInTheDocument()

  await userEvent.keyboard('q')
  expect(screen.getByRole('button', { name: /^record$/i })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /stop/i })).not.toBeInTheDocument()
})

test('Q with a modifier held is ignored', async () => {
  installMockRecorder()
  grantMicrophone()
  stubFetch(() => jsonResponse([done]))
  render(<App />)
  await userEvent.keyboard('r')
  await screen.findByRole('button', { name: /stop/i })

  await userEvent.keyboard('{Meta>}q{/Meta}')
  expect(screen.getByRole('button', { name: /stop/i })).toBeInTheDocument()
})

test('after a silent Q-discard, focus lands on Record rather than <body>', async () => {
  installMockRecorder()
  grantMicrophone()
  const { calls } = stubFetch(() => jsonResponse([done]))
  render(<App />)
  await userEvent.keyboard('r')
  const stopButton = await screen.findByRole('button', { name: /stop/i })
  stopButton.focus()
  expect(stopButton).toHaveFocus()

  await userEvent.keyboard('q')
  await waitFor(() => expect(screen.getByRole('button', { name: /^record$/i })).toHaveFocus())
  expect(
    calls.filter((call) => call.url === '/api/notes/mic' && call.method === 'POST'),
  ).toHaveLength(0)
})

test('a repeated Q keydown while recording is ignored (key-repeat guard)', async () => {
  installMockRecorder()
  grantMicrophone()
  stubFetch(() => jsonResponse([done]))
  render(<App />)
  await userEvent.keyboard('r')
  await screen.findByRole('button', { name: /stop/i })

  fireEvent.keyDown(window, { key: 'q', repeat: true })

  expect(screen.getByRole('button', { name: /stop/i })).toBeInTheDocument()
  expect(screen.queryByText(/discard this recording\?/i)).not.toBeInTheDocument()
})

test('R immediately after Q inside the stop window cannot resurrect a discarded take (race #1)', async () => {
  installMockRecorder()
  grantMicrophone()
  const { calls } = stubFetch(() => jsonResponse([done]))
  render(<App />)
  await userEvent.keyboard('r')
  await screen.findByRole('button', { name: /stop/i })

  // Synchronous keydowns, no await between: Q's stop() flips the recorder's own state
  // to 'inactive' before R runs, so the guard must make R a no-op rather than steal
  // the fate back to "send" out from under onstop (still pending on the microtask queue).
  fireEvent.keyDown(window, { key: 'q' })
  fireEvent.keyDown(window, { key: 'r' })

  await waitFor(() => expect(screen.getByRole('button', { name: /^record$/i })).toBeInTheDocument())
  expect(
    calls.filter((call) => call.url === '/api/notes/mic' && call.method === 'POST'),
  ).toHaveLength(0)
})

test('Q immediately after R inside the stop window cannot steal a stop-to-save (race #1)', async () => {
  installMockRecorder()
  grantMicrophone()
  const { calls } = stubFetch((url) =>
    url === '/api/notes/mic' ? jsonResponse({ id: 'n6', status: 'processing' }, 201) : jsonResponse([]),
  )
  render(<App />)
  await userEvent.keyboard('r')
  await screen.findByRole('button', { name: /stop/i })

  fireEvent.keyDown(window, { key: 'r' })
  fireEvent.keyDown(window, { key: 'q' })

  await waitFor(() =>
    expect(
      calls.filter((call) => call.url === '/api/notes/mic' && call.method === 'POST'),
    ).toHaveLength(1),
  )
})

test('Q after Stop on a long take cannot open a stale discard confirm (race #1, long-take path)', async () => {
  installMockRecorder()
  grantMicrophone()
  const { calls } = stubFetch((url) =>
    url === '/api/notes/mic' ? jsonResponse({ id: 'n7', status: 'processing' }, 201) : jsonResponse([]),
  )
  render(<App />)
  await userEvent.keyboard('r')
  await screen.findByRole('button', { name: /stop/i })

  const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 11_000)

  // Synchronous keydowns, no await between: R's stop() flips the recorder's own state
  // to 'inactive' before Q runs. requestCancel must gate on that recorder state (not
  // stale React state.phase, which still reads 'recording' here) or it would raise a
  // discard confirm over a take whose Discard button would then no-op.
  fireEvent.keyDown(window, { key: 'r' })
  fireEvent.keyDown(window, { key: 'q' })

  // Check immediately: the confirm must never have appeared at all, not just be gone
  // by the time onstop's later microtask settles things back to idle.
  expect(screen.queryByText(/discard this recording\?/i)).not.toBeInTheDocument()

  await waitFor(() =>
    expect(
      calls.filter((call) => call.url === '/api/notes/mic' && call.method === 'POST'),
    ).toHaveLength(1),
  )
  expect(screen.queryByText(/discard this recording\?/i)).not.toBeInTheDocument()
  nowSpy.mockRestore()
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

test('the shortcuts legend is visible on the list but hidden once a note is open', async () => {
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

  // The list (and its legend) hides via the `hidden` attribute — contents stay in the
  // DOM, so a plain queryByText-absence check would not catch this; toBeVisible does.
  // aria-label is ARIA-prohibited on a <p>, so the legend is found by its class — its
  // visible text is scattered across sibling kbd/span children, not one matchable node.
  await waitFor(() => expect(document.querySelector('.shortcuts-legend')).toBeVisible())

  await userEvent.click(await screen.findByRole('button', { name: /^remember the deposit$/i }))
  await screen.findByRole('button', { name: /back to notes/i })
  expect(document.querySelector('.shortcuts-legend')).not.toBeVisible()
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

test('Escape with focus in the search box steps the search back only, leaving a mid-flight discard confirm up', async () => {
  installMockRecorder()
  grantMicrophone()
  stubFetch(() => jsonResponse([done]))
  render(<App />)
  await userEvent.keyboard('r')
  await screen.findByRole('button', { name: /stop/i })

  const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 11_000)
  await userEvent.keyboard('q')
  await screen.findByText(/discard this recording\?/i)

  // `/` still works mid-confirm (App's shortcut listener doesn't know about the recorder).
  await userEvent.keyboard('/')
  const search = screen.getByRole('searchbox')
  expect(search).toHaveFocus()
  await userEvent.type(search, 'deposit')

  await userEvent.keyboard('{Escape}')

  // SearchBox's own Esc (clear-then-step-out) wins outright — the confirm's window
  // listener must see this event already handled and never even react to it.
  expect(search).toHaveValue('')
  expect(screen.getByText(/discard this recording\?/i)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /keep recording/i })).toBeInTheDocument()

  nowSpy.mockRestore()
})

test('Escape closes an open note before collapsing a pending discard confirm (F1, note wins)', async () => {
  installMockRecorder()
  grantMicrophone()
  const { calls } = stubFetch((url) => {
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
  await screen.findByText('remember the deposit')

  await userEvent.keyboard('r')
  await screen.findByRole('button', { name: /stop/i })

  const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 11_000)
  await userEvent.keyboard('q')
  await screen.findByText(/discard this recording\?/i)

  // Open a note over the still-pending confirm — the recorder stays mounted (just
  // CSS-hidden), so its confirm-Escape listener and App's note-Escape listener are
  // both live on window at once.
  await userEvent.click(screen.getByRole('button', { name: /^remember the deposit$/i }))
  expect(await screen.findByRole('button', { name: /back to notes/i })).toBeInTheDocument()

  await userEvent.keyboard('{Escape}')

  // The note closes — one step back...
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: /back to notes/i })).not.toBeInTheDocument(),
  )
  expect(screen.getByRole('searchbox')).toBeInTheDocument()
  // ...but the confirm must still be up: the recorder's listener yielded rather than
  // also collapsing it in the same keypress, and the recording itself never stopped.
  expect(screen.getByText(/discard this recording\?/i)).toBeInTheDocument()
  expect(screen.getByText(/keep recording/i)).toBeInTheDocument()
  expect(
    calls.filter((call) => call.url === '/api/notes/mic' && call.method === 'POST'),
  ).toHaveLength(0)

  // A second Escape, now back on the list, is what collapses the confirm.
  await userEvent.keyboard('{Escape}')
  expect(screen.queryByText(/discard this recording\?/i)).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: /^stop$/i })).toBeInTheDocument()
  expect(
    calls.filter((call) => call.url === '/api/notes/mic' && call.method === 'POST'),
  ).toHaveLength(0)

  nowSpy.mockRestore()
})
