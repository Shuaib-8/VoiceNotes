import type { ReactElement } from 'react'
import type { NoteSummary } from '../api'

export default function StatusChip({ status }: { status: NoteSummary['status'] }): ReactElement {
  const label = status === 'processing' ? 'transcribing…' : status
  return <span className={`chip chip-${status}`}>{label}</span>
}
