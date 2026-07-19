import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { uploadMicBlob } from '../api'
import { formatDuration } from '../format'
import { isTypingTarget } from '../keyboard'

type RecorderState =
  | { phase: 'idle' }
  | { phase: 'recording'; startedAt: number }
  | { phase: 'sending' }
  | { phase: 'send-failed'; blob: Blob; mimeType: string; message: string }
  | { phase: 'denied' }
  | { phase: 'no-mic' }
  | { phase: 'unsupported' }

const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']

function pickMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null
  return MIME_CANDIDATES.find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? null
}

function formatElapsed(startedAt: number, now: number): string {
  return formatDuration(Math.max(0, Math.floor((now - startedAt) / 1000)))
}

interface RecorderProps {
  onIngested: (noteId: string) => void
  // Whether the list view (not a note overlay) is active — gates the confirm-Escape
  // listener so it yields while a note is open (F1: note closes first, confirm second).
  listActive: boolean
}

const CANCEL_CONFIRM_AFTER_MS = 10_000

export default function Recorder({ onIngested, listActive }: RecorderProps): ReactElement {
  const [state, setState] = useState<RecorderState>({ phase: 'idle' })
  const [now, setNow] = useState<number>(() => Date.now())
  const [confirmingCancel, setConfirmingCancel] = useState(false)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const cancellingRef = useRef<boolean>(false)
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null)
  const recordButtonRef = useRef<HTMLButtonElement | null>(null)
  // Set when onstop's silent-discard branch fires; consumed once idle renders so a
  // Q-cancel (focus already off any button) or a mouse-cancel (Cancel just unmounted)
  // never leaves focus resting on <body> (Focus Doctrine).
  const justCancelledRef = useRef<boolean>(false)

  const guarding = state.phase === 'recording' || state.phase === 'send-failed'
  useEffect(() => {
    if (!guarding) return
    const warn = (event: BeforeUnloadEvent): void => {
      event.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [guarding])

  useEffect(() => {
    if (state.phase !== 'recording') return
    const timer = window.setInterval(() => setNow(Date.now()), 500)
    return () => window.clearInterval(timer)
  }, [state.phase])

  const send = useCallback(
    async (blob: Blob, mimeType: string): Promise<void> => {
      setState({ phase: 'sending' })
      try {
        const created = await uploadMicBlob(blob, mimeType)
        setState({ phase: 'idle' })
        onIngested(created.id)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'sending failed'
        setState({ phase: 'send-failed', blob, mimeType, message })
      }
    },
    [onIngested],
  )

  const startRecording = useCallback(async (): Promise<void> => {
    const mimeType = pickMimeType()
    if (mimeType === null) {
      setState({ phase: 'unsupported' })
      return
    }
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (error) {
      const name = error instanceof DOMException ? error.name : ''
      setState({ phase: name === 'NotFoundError' ? 'no-mic' : 'denied' })
      return
    }
    const recorder = new MediaRecorder(stream, { mimeType })
    chunksRef.current = []
    cancellingRef.current = false
    recorder.ondataavailable = (event: BlobEvent): void => {
      if (event.data.size > 0) chunksRef.current.push(event.data)
    }
    recorder.onstop = (): void => {
      stream.getTracks().forEach((track) => track.stop())
      const chunks = chunksRef.current
      chunksRef.current = []
      if (cancellingRef.current) {
        justCancelledRef.current = true
        setState({ phase: 'idle' }) // R17: discard entirely — no note, no request
        return
      }
      void send(new Blob(chunks, { type: recorder.mimeType }), recorder.mimeType)
    }
    recorderRef.current = recorder
    recorder.start(1000)
    setNow(Date.now())
    setConfirmingCancel(false)
    setState({ phase: 'recording', startedAt: Date.now() })
  }, [send])

  // onstop is async (fires after the UA delivers final data), but MediaRecorder.state
  // flips to 'inactive' synchronously on the first stop() call — so both buttons stay
  // reachable until onstop runs, and a second command in that window (R after Q, or
  // Q after R) must no-op rather than overwrite cancellingRef out from under onstop.
  // Guarding on the recorder's own state (not React's) makes the first command win.
  const stopRecording = useCallback((): void => {
    if (recorderRef.current?.state !== 'recording') return
    cancellingRef.current = false
    setConfirmingCancel(false)
    recorderRef.current.stop()
  }, [])

  const cancelRecording = useCallback((): void => {
    if (recorderRef.current?.state !== 'recording') return
    cancellingRef.current = true
    setConfirmingCancel(false)
    recorderRef.current.stop()
  }, [])

  const requestCancel = useCallback((): void => {
    // The recorder may already be stopping in the async gap before onstop flips
    // phase (a Stop or prior Cancel in flight); don't raise a confirm over a take
    // whose fate is already sealed — its Discard would no-op.
    if (recorderRef.current?.state !== 'recording') return
    if (state.phase !== 'recording') return
    // A short false start discards silently (R17); a real take is worth a confirm —
    // Cancel destroys the only copy there is.
    if (Date.now() - state.startedAt >= CANCEL_CONFIRM_AFTER_MS) {
      setConfirmingCancel(true)
    } else {
      cancelRecording()
    }
  }, [state, cancelRecording])

  const keepRecording = useCallback((): void => {
    setConfirmingCancel(false)
    requestAnimationFrame(() => cancelButtonRef.current?.focus())
  }, [])

  // Esc backs out of the discard confirm the same way DeleteNoteButton's does:
  // the take is worth keeping by default, so Esc returns to it rather than losing it.
  // Listens on window rather than the confirm's own span because the confirm
  // deliberately survives focus-out (e.g. `/` can focus search while it's up), and a
  // span-scoped handler would never see an Escape typed somewhere else on the page.
  // Yields while a note is open (!listActive) so that Esc closes the note first —
  // a second Esc, now back on the list, is what collapses the confirm (F1).
  useEffect(() => {
    if (!confirmingCancel || !listActive) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      // SearchBox's own Esc handling must keep winning while it's focused — one
      // keypress must never both step the search back AND collapse the confirm.
      if (isTypingTarget(event.target)) return
      event.preventDefault()
      keepRecording()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [confirmingCancel, listActive, keepRecording])

  // A cancel just completed silently — either the Cancel button unmounted (mouse
  // path) or focus was never on a button to begin with (Q path). Land on Record
  // only if focus really did fall to <body>; never steal it from a real element.
  useEffect(() => {
    if (state.phase !== 'idle' || !justCancelledRef.current) return
    justCancelledRef.current = false
    requestAnimationFrame(() => {
      if (document.activeElement === document.body) recordButtonRef.current?.focus()
    })
  }, [state.phase])

  if (state.phase === 'unsupported') {
    return <p className="recorder-message">This browser cannot record audio — use Chrome, or upload a file instead.</p>
  }
  if (state.phase === 'denied') {
    return (
      <div className="recorder-message" role="status">
        <p>Microphone access was denied. Allow the mic in the browser’s site settings, then try again.</p>
        <button type="button" onClick={() => setState({ phase: 'idle' })}>
          Try again
        </button>
      </div>
    )
  }
  if (state.phase === 'no-mic') {
    return (
      <div className="recorder-message" role="status">
        <p>No microphone was found. Connect one, then try again.</p>
        <button type="button" onClick={() => setState({ phase: 'idle' })}>
          Try again
        </button>
      </div>
    )
  }
  if (state.phase === 'sending') {
    return (
      <p className="recorder-message" role="status">
        Saving your note…
      </p>
    )
  }
  if (state.phase === 'send-failed') {
    return (
      <div className="recorder-message recorder-error" role="alert">
        <p>Your recording is safe in this tab, but sending it failed: {state.message}</p>
        <button type="button" onClick={() => void send(state.blob, state.mimeType)}>
          Retry send
        </button>
        <button type="button" className="secondary" onClick={() => setState({ phase: 'idle' })}>
          Discard recording
        </button>
      </div>
    )
  }
  if (state.phase === 'recording') {
    return (
      <div className="recorder recording">
        <span role="status" className="visually-hidden">
          Recording
        </span>
        <span className="recording-dot" aria-hidden="true" />
        <span className="elapsed" role="timer" aria-label="Recording time">
          {formatElapsed(state.startedAt, now)}
        </span>
        {confirmingCancel ? (
          <span className="delete-confirm" role="group" aria-label="Confirm discard">
            <span>Discard this recording?</span>
            <button type="button" className="confirm-trash" onClick={cancelRecording}>
              Discard
            </button>
            <button
              type="button"
              autoFocus
              className="confirm-keep"
              onClick={keepRecording}
            >
              Keep recording
            </button>
          </span>
        ) : (
          <>
            <button
              type="button"
              className="primary stop-button"
              aria-keyshortcuts="r"
              title="Stop (R)"
              onClick={stopRecording}
            >
              Stop
            </button>
            {/* Kept away from Stop: one misclick here would destroy the only copy. */}
            <button
              type="button"
              ref={cancelButtonRef}
              className="cancel-button"
              aria-keyshortcuts="q"
              title="Cancel (Q)"
              onClick={requestCancel}
            >
              Cancel
            </button>
          </>
        )}
      </div>
    )
  }
  return (
    <div className="recorder">
      <button
        type="button"
        ref={recordButtonRef}
        className="primary record-button"
        aria-keyshortcuts="r"
        title="Record (R)"
        onClick={() => void startRecording()}
      >
        <span className="record-glyph" aria-hidden="true">
          ●{' '}
        </span>
        Record
      </button>
    </div>
  )
}
