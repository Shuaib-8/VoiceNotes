import { useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import ContextSuffix from './ContextSuffix'

type CopyState = 'idle' | 'copied' | 'failed'

interface CopyButtonProps {
  getText: () => Promise<string>
  /** Note title woven into the accessible name, so card rows don't all announce "Copy". */
  context?: string
}

/** One-click transcript copy (R18): recall ends in a paste, not an export. */
export default function CopyButton({ getText, context }: CopyButtonProps): ReactElement {
  const [state, setState] = useState<CopyState>('idle')
  const timerRef = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    },
    [],
  )

  const copy = async (): Promise<void> => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    try {
      const text = await getText()
      await navigator.clipboard.writeText(text)
      setState('copied')
      timerRef.current = window.setTimeout(() => setState('idle'), 2000)
    } catch {
      // Failure persists — the button itself is the retry; no dead end.
      setState('failed')
    }
  }

  return (
    <button
      type="button"
      className="copy-button"
      aria-live="polite"
      title={state === 'failed' ? 'Click to try again' : undefined}
      onClick={() => void copy()}
    >
      {state === 'copied' ? 'Copied ✓' : state === 'failed' ? 'Copy failed' : 'Copy'}
      <ContextSuffix context={context} />
    </button>
  )
}
