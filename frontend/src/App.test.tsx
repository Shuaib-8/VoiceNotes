import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import App from './App'
import type { NoteSummary } from './api'
import { installMockRecorder, jsonResponse, stubClipboard, stubFetch } from './test-helpers'
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
  expect(screen.getByRole('button', { name: /remember the deposit/i })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /2026-07-06 10:02/i })).not.toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', { name: /^retry$/i }))
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
  expect(screen.getByRole('button', { name: /remember the deposit/i })).toBeInTheDocument()

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

  const copyButtons = screen.getAllByRole('button', { name: /^copy$/i })
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

  await userEvent.click(screen.getByRole('button', { name: /remember the deposit/i }))
  expect(await screen.findByText('second line')).toBeInTheDocument()
  expect(screen.getByTestId('audio-player')).toHaveAttribute('src', '/api/notes/d1/audio')

  await userEvent.click(screen.getByRole('button', { name: /back to notes/i }))
  expect(screen.getByRole('searchbox')).toHaveValue('deposit')
  expect(screen.getByRole('button', { name: /remember the deposit/i })).toBeInTheDocument()
  expect(screen.queryByText('groceries for the week')).not.toBeInTheDocument()
})
