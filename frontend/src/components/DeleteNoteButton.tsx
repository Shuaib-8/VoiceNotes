import { useRef, useState } from 'react'
import type { FocusEvent, KeyboardEvent, ReactElement } from 'react'
import { deleteNote } from '../api'
import ContextSuffix from './ContextSuffix'

type DeleteState =
  | { phase: 'idle' }
  | { phase: 'confirming' }
  | { phase: 'deleting' }
  | { phase: 'failed'; message: string }

interface DeleteNoteButtonProps {
  noteId: string
  onDeleted: () => void
  /** Note title woven into the accessible name, so card rows don't all announce "Delete". */
  context?: string
}

/** Delete moves the note folder to the archive's .trash — never erases (nothing is ever lost). */
export default function DeleteNoteButton({
  noteId,
  onDeleted,
  context,
}: DeleteNoteButtonProps): ReactElement {
  const [state, setState] = useState<DeleteState>({ phase: 'idle' })
  const triggerRef = useRef<HTMLButtonElement | null>(null)

  const collapseToTrigger = (): void => {
    setState({ phase: 'idle' })
    requestAnimationFrame(() => triggerRef.current?.focus())
  }

  const confirm = async (): Promise<void> => {
    setState({ phase: 'deleting' })
    try {
      await deleteNote(noteId)
      onDeleted()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'delete failed'
      setState({ phase: 'failed', message })
    }
  }

  // No hidden timer: the confirm stays until the owner decides, presses Esc,
  // or moves focus elsewhere (a timed destructive decision fails WCAG 2.2.1).
  const onConfirmKeyDown = (event: KeyboardEvent<HTMLSpanElement>): void => {
    if (event.key === 'Escape' && state.phase === 'confirming') {
      event.preventDefault()
      event.stopPropagation() // must not also close the note-detail overlay
      collapseToTrigger()
    }
  }

  const onConfirmBlur = (event: FocusEvent<HTMLSpanElement>): void => {
    const leavingTheGroup = !event.currentTarget.contains(event.relatedTarget)
    if (leavingTheGroup && state.phase === 'confirming') {
      // The owner moved on deliberately — collapse without yanking focus back.
      setState({ phase: 'idle' })
    }
  }

  if (state.phase === 'confirming' || state.phase === 'deleting') {
    const deleting = state.phase === 'deleting'
    return (
      <span
        className="delete-confirm"
        role="group"
        aria-label="Confirm delete"
        onKeyDown={onConfirmKeyDown}
        onBlur={onConfirmBlur}
      >
        <span>Move to trash?</span>
        <button
          type="button"
          className="confirm-trash"
          disabled={deleting}
          onClick={() => void confirm()}
        >
          {deleting ? 'Moving…' : 'Move to trash'}
        </button>
        {/* Keeping is the safe default: it receives focus, so Enter-reflex does no harm. */}
        <button type="button" className="confirm-keep" autoFocus disabled={deleting} onClick={collapseToTrigger}>
          Keep
        </button>
        {/* State the consequence: trash is a move, not an erasure (nothing is ever lost). */}
        <span className="confirm-hint">Recoverable from the archive’s .trash folder.</span>
      </span>
    )
  }

  return (
    <span className="delete-confirm">
      {state.phase === 'failed' && (
        <span className="delete-error" role="alert">
          {state.message}
        </span>
      )}
      <button
        type="button"
        ref={triggerRef}
        className="delete-button"
        onClick={() => setState({ phase: 'confirming' })}
      >
        Delete
        <ContextSuffix context={context} />
      </button>
    </span>
  )
}
