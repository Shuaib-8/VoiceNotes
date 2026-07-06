import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { uploadMicBlob } from '../api'

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
  const total = Math.max(0, Math.floor((now - startedAt) / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

interface RecorderProps {
  onIngested: (noteId: string) => void
}

export default function Recorder({ onIngested }: RecorderProps): ReactElement {
  const [state, setState] = useState<RecorderState>({ phase: 'idle' })
  const [now, setNow] = useState<number>(() => Date.now())
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const cancellingRef = useRef<boolean>(false)

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
        setState({ phase: 'idle' }) // R17: discard entirely — no note, no request
        return
      }
      void send(new Blob(chunks, { type: recorder.mimeType }), recorder.mimeType)
    }
    recorderRef.current = recorder
    recorder.start(1000)
    setNow(Date.now())
    setState({ phase: 'recording', startedAt: Date.now() })
  }, [send])

  const stopRecording = useCallback((): void => {
    cancellingRef.current = false
    recorderRef.current?.stop()
  }, [])

  const cancelRecording = useCallback((): void => {
    cancellingRef.current = true
    recorderRef.current?.stop()
  }, [])

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
        <span className="recording-dot" aria-hidden="true" />
        <span className="elapsed" role="timer">
          {formatElapsed(state.startedAt, now)}
        </span>
        <button type="button" className="primary" onClick={stopRecording}>
          Stop
        </button>
        <button type="button" className="secondary" onClick={cancelRecording}>
          Cancel
        </button>
      </div>
    )
  }
  return (
    <div className="recorder">
      <button type="button" className="primary record-button" onClick={() => void startRecording()}>
        ● Record
      </button>
    </div>
  )
}
