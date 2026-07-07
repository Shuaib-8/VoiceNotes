import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { jsonResponse, stubFetch } from '../test-helpers'
import UploadDropzone from './UploadDropzone'

test('a supported file uploads and reports the new note', async () => {
  const { calls } = stubFetch(() => jsonResponse({ id: 'u1', status: 'processing' }, 201))
  const onIngested = vi.fn()
  render(<UploadDropzone onIngested={onIngested} />)

  const file = new File([new Uint8Array(16)], 'memo.m4a', { type: 'audio/mp4' })
  await userEvent.upload(screen.getByTestId('file-input'), file)

  await waitFor(() => expect(onIngested).toHaveBeenCalledWith('u1'))
  expect(calls).toHaveLength(1)
  expect(calls[0].url).toBe('/api/notes')
})

test('an unsupported extension is rejected client-side with no request', async () => {
  const { calls } = stubFetch(() => jsonResponse({}))
  render(<UploadDropzone onIngested={vi.fn()} />)

  const file = new File(['words'], 'notes.txt', { type: 'text/plain' })
  fireEvent.change(screen.getByTestId('file-input'), { target: { files: [file] } })

  expect(await screen.findByRole('alert')).toHaveTextContent(/accepted formats/i)
  expect(calls).toHaveLength(0)
})

test('a multi-file drop is rejected whole — nothing uploads', async () => {
  const { calls } = stubFetch(() => jsonResponse({}))
  render(<UploadDropzone onIngested={vi.fn()} />)

  const one = new File([new Uint8Array(4)], 'one.m4a', { type: 'audio/mp4' })
  const two = new File([new Uint8Array(4)], 'two.m4a', { type: 'audio/mp4' })
  fireEvent.drop(screen.getByTestId('dropzone'), { dataTransfer: { files: [one, two] } })

  expect(await screen.findByRole('alert')).toHaveTextContent(/one file at a time/i)
  expect(calls).toHaveLength(0)
})

test('holding a file over the zone lights it up and invites the drop', () => {
  stubFetch(() => jsonResponse({}))
  render(<UploadDropzone onIngested={vi.fn()} />)

  const zone = screen.getByTestId('dropzone')
  fireEvent.dragOver(zone, { dataTransfer: { files: [] } })
  expect(zone).toHaveClass('drag-over')
  expect(screen.getByText(/drop to add it to the archive/i)).toBeInTheDocument()

  fireEvent.dragLeave(zone)
  expect(zone).not.toHaveClass('drag-over')
  expect(screen.getByText(/drag one file here/i)).toBeInTheDocument()
})

test('a server rejection surfaces its message inline', async () => {
  stubFetch(() => jsonResponse({ detail: 'stream exceeded 200 MB' }, 413))
  render(<UploadDropzone onIngested={vi.fn()} />)

  const file = new File([new Uint8Array(16)], 'huge.wav', { type: 'audio/wav' })
  await userEvent.upload(screen.getByTestId('file-input'), file)

  expect(await screen.findByRole('alert')).toHaveTextContent(/exceeded 200 MB/i)
})
