import type { ReactElement } from 'react'
import Recorder from '../components/Recorder'
import UploadDropzone from '../components/UploadDropzone'

interface RecordViewProps {
  onIngested: (noteId: string) => void
}

/** The persistent capture surface: zero-keyboard record plus single-file upload. */
export default function RecordView({ onIngested }: RecordViewProps): ReactElement {
  return (
    <section className="capture-surface" aria-label="Capture a note">
      <Recorder onIngested={onIngested} />
      <UploadDropzone onIngested={onIngested} />
    </section>
  )
}
