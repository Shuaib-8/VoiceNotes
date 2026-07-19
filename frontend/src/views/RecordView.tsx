import type { ReactElement } from 'react'
import Recorder from '../components/Recorder'
import UploadDropzone from '../components/UploadDropzone'

interface RecordViewProps {
  onIngested: (noteId: string) => void
  // Whether the list view (not a note overlay) is the active surface — threaded down
  // to Recorder so its confirm-Escape listener can yield while a note is open (F1).
  listActive: boolean
}

/** The persistent capture surface: zero-keyboard record plus single-file upload. */
export default function RecordView({ onIngested, listActive }: RecordViewProps): ReactElement {
  return (
    <section className="capture-surface" aria-label="Capture a note">
      <Recorder onIngested={onIngested} listActive={listActive} />
      <UploadDropzone onIngested={onIngested} />
    </section>
  )
}
