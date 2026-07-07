import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import {
  denyMicrophone,
  grantMicrophone,
  installMockRecorder,
  jsonResponse,
  stubFetch,
} from '../test-helpers'
import Recorder from './Recorder'

test('record then stop posts the blob with the recorder mimeType (AE1 client half)', async () => {
  installMockRecorder()
  grantMicrophone()
  const { calls } = stubFetch(() => jsonResponse({ id: 'n1', status: 'processing' }, 201))
  const onIngested = vi.fn()
  render(<Recorder onIngested={onIngested} />)

  await userEvent.click(screen.getByRole('button', { name: /record/i }))
  await userEvent.click(await screen.findByRole('button', { name: /stop/i }))

  await waitFor(() => expect(onIngested).toHaveBeenCalledWith('n1'))
  expect(calls).toHaveLength(1)
  expect(calls[0].url).toBe('/api/notes/mic')
  const sent = calls[0].body?.get('file')
  expect(sent).toBeInstanceOf(File)
  expect((sent as File).type).toBe('audio/webm;codecs=opus')
})

test('cancel discards the recording entirely — no request (R17)', async () => {
  installMockRecorder()
  grantMicrophone()
  const { calls } = stubFetch(() => jsonResponse({}))
  render(<Recorder onIngested={vi.fn()} />)

  await userEvent.click(screen.getByRole('button', { name: /record/i }))
  await userEvent.click(await screen.findByRole('button', { name: /cancel/i }))

  expect(calls).toHaveLength(0)
  expect(await screen.findByRole('button', { name: /record/i })).toBeInTheDocument()
})

test('permission denied renders guidance, and try-again returns to idle', async () => {
  installMockRecorder()
  denyMicrophone('NotAllowedError')
  stubFetch(() => jsonResponse({}))
  render(<Recorder onIngested={vi.fn()} />)

  await userEvent.click(screen.getByRole('button', { name: /record/i }))
  expect(await screen.findByText(/microphone access was denied/i)).toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', { name: /try again/i }))
  expect(screen.getByRole('button', { name: /record/i })).toBeInTheDocument()
})

test('a failed send retains the blob and retry-send re-posts it — no silent loss', async () => {
  installMockRecorder()
  grantMicrophone()
  let failing = true
  const { calls } = stubFetch(() =>
    failing ? new Error('connection refused') : jsonResponse({ id: 'n2', status: 'processing' }, 201),
  )
  const onIngested = vi.fn()
  render(<Recorder onIngested={onIngested} />)

  await userEvent.click(screen.getByRole('button', { name: /record/i }))
  await userEvent.click(await screen.findByRole('button', { name: /stop/i }))

  const retry = await screen.findByRole('button', { name: /retry send/i })
  expect(screen.getByRole('alert')).toHaveTextContent(/recording is safe/i)

  failing = false
  await userEvent.click(retry)
  await waitFor(() => expect(onIngested).toHaveBeenCalledWith('n2'))

  expect(calls).toHaveLength(2)
  const first = calls[0].body?.get('file') as File
  const second = calls[1].body?.get('file') as File
  expect(second.type).toBe(first.type)
  expect(second.size).toBe(first.size)
})

test('cancelling a long take asks for confirmation before discarding', async () => {
  installMockRecorder()
  grantMicrophone()
  const { calls } = stubFetch(() => jsonResponse({ id: 'n3', status: 'processing' }, 201))
  render(<Recorder onIngested={vi.fn()} />)

  await userEvent.click(screen.getByRole('button', { name: /record/i }))
  const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 11_000)

  await userEvent.click(screen.getByRole('button', { name: /^cancel$/i }))
  expect(screen.getByText(/discard this recording\?/i)).toBeInTheDocument()

  // Keep recording: the take survives the reflex-click.
  await userEvent.click(screen.getByRole('button', { name: /keep recording/i }))
  expect(screen.getByRole('button', { name: /stop/i })).toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', { name: /^cancel$/i }))
  await userEvent.click(screen.getByRole('button', { name: /^discard$/i }))
  expect(calls).toHaveLength(0) // R17: discarded entirely — no request
  expect(await screen.findByRole('button', { name: /record/i })).toBeInTheDocument()
  nowSpy.mockRestore()
})
