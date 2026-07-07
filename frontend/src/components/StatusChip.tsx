import type { ReactElement } from 'react'
import type { NoteSummary } from '../api'

export default function StatusChip({ status }: { status: NoteSummary['status'] }): ReactElement {
  const label = status === 'processing' ? 'transcribing…' : status
  // role="status": the transcribing… → done flip is announced, not silent.
  return (
    <span className={`chip chip-${status}`} role="status">
      {label}
    </span>
  )
}
