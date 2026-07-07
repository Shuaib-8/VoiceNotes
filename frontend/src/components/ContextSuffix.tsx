import type { ReactElement } from 'react'

interface ContextSuffixProps {
  context?: string
}

/**
 * A visually-hidden note title appended to a button's accessible name, so a
 * screen-reader pass hears "Copy — «title»" instead of a row of identical "Copy"s.
 */
export default function ContextSuffix({ context }: ContextSuffixProps): ReactElement | null {
  if (context === undefined) return null
  return <span className="visually-hidden">{` — ${context}`}</span>
}
