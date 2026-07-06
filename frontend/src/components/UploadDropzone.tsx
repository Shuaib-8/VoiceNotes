import { useRef, useState } from 'react'
import type { DragEvent, ReactElement } from 'react'
import { ACCEPTED_EXTENSIONS, uploadFile } from '../api'

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot === -1 ? '' : name.slice(dot).toLowerCase()
}

type DropzoneState =
  | { phase: 'idle' }
  | { phase: 'sending'; filename: string }
  | { phase: 'error'; message: string }

interface UploadDropzoneProps {
  onIngested: (noteId: string) => void
}

export default function UploadDropzone({ onIngested }: UploadDropzoneProps): ReactElement {
  const [state, setState] = useState<DropzoneState>({ phase: 'idle' })
  const inputRef = useRef<HTMLInputElement | null>(null)

  const ingest = async (files: FileList | File[]): Promise<void> => {
    const list = Array.from(files)
    if (list.length === 0) return
    if (list.length > 1) {
      setState({
        phase: 'error',
        message: 'Only one file at a time — drop a single voice note.',
      })
      return
    }
    const file = list[0]
    if (!ACCEPTED_EXTENSIONS.includes(extensionOf(file.name))) {
      setState({
        phase: 'error',
        message: `Unsupported file type; accepted formats: ${ACCEPTED_EXTENSIONS.join(', ')}`,
      })
      return
    }
    setState({ phase: 'sending', filename: file.name })
    try {
      const created = await uploadFile(file)
      setState({ phase: 'idle' })
      onIngested(created.id)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'upload failed'
      setState({ phase: 'error', message })
    }
  }

  const onDrop = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault()
    void ingest(event.dataTransfer.files)
  }

  return (
    <div
      className="dropzone"
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
      data-testid="dropzone"
    >
      {state.phase === 'sending' ? (
        <p role="status">Uploading {state.filename}…</p>
      ) : (
        <>
          <button type="button" className="secondary" onClick={() => inputRef.current?.click()}>
            Upload a voice note
          </button>
          <span className="dropzone-hint">or drag one file here (.m4a, .opus, …)</span>
        </>
      )}
      {state.phase === 'error' && (
        <p className="dropzone-error" role="alert">
          {state.message}
        </p>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_EXTENSIONS.join(',')}
        hidden
        data-testid="file-input"
        onChange={(event) => {
          if (event.target.files) void ingest(event.target.files)
          event.target.value = ''
        }}
      />
    </div>
  )
}
