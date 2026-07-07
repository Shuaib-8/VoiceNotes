import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { jsonResponse, stubFetch } from '../test-helpers'
import DeleteNoteButton from './DeleteNoteButton'

const NOTE_ID = '2026-07-06-101112-mic'

describe('DeleteNoteButton', () => {
  it('asks for confirmation before deleting anything', async () => {
    const { calls } = stubFetch(() => jsonResponse(null, 204))
    const onDeleted = vi.fn()
    render(<DeleteNoteButton noteId={NOTE_ID} onDeleted={onDeleted} />)

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))

    expect(screen.getByText('Move to trash?')).toBeInTheDocument()
    // The consequence is stated, not implied: trash is a recoverable move.
    expect(screen.getByText(/recoverable from the archive/i)).toBeInTheDocument()
    expect(calls).toHaveLength(0) // no request until the owner confirms
    expect(onDeleted).not.toHaveBeenCalled()
  })

  it('keep collapses the confirm step without a request', async () => {
    const { calls } = stubFetch(() => jsonResponse(null, 204))
    render(<DeleteNoteButton noteId={NOTE_ID} onDeleted={vi.fn()} />)

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await userEvent.click(screen.getByRole('button', { name: 'Keep' }))

    expect(screen.queryByText('Move to trash?')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
    expect(calls).toHaveLength(0)
  })

  it('confirming issues DELETE and reports success', async () => {
    const { calls } = stubFetch(() => new Response(null, { status: 204 }))
    const onDeleted = vi.fn()
    render(<DeleteNoteButton noteId={NOTE_ID} onDeleted={onDeleted} />)

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await userEvent.click(screen.getByRole('button', { name: 'Move to trash' }))

    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1))
    expect(calls).toEqual([
      { url: `/api/notes/${NOTE_ID}`, method: 'DELETE', body: null },
    ])
  })

  it('escape collapses the confirm and hands focus back to Delete', async () => {
    const { calls } = stubFetch(() => new Response(null, { status: 204 }))
    render(<DeleteNoteButton noteId={NOTE_ID} onDeleted={vi.fn()} />)

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(screen.getByText('Move to trash?')).toBeInTheDocument()

    await userEvent.keyboard('{Escape}')
    const trigger = await screen.findByRole('button', { name: 'Delete' })
    await waitFor(() => expect(trigger).toHaveFocus())
    expect(calls).toHaveLength(0)
  })

  it('a blocked delete surfaces the server reason and recovers', async () => {
    stubFetch(() =>
      jsonResponse({ detail: 'still being transcribed; wait for it to finish' }, 409),
    )
    const onDeleted = vi.fn()
    render(<DeleteNoteButton noteId={NOTE_ID} onDeleted={onDeleted} />)

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await userEvent.click(screen.getByRole('button', { name: 'Move to trash' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('still being transcribed')
    expect(onDeleted).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument() // can retry later
  })
})
