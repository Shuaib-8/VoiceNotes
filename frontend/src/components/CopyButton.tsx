import { useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'

type CopyState = 'idle' | 'copied' | 'failed'

interface CopyButtonProps {
  getText: () => Promise<string>
}

/** One-click transcript copy (R18): recall ends in a paste, not an export. */
export default function CopyButton({ getText }: CopyButtonProps): ReactElement {
  const [state, setState] = useState<CopyState>('idle')
  const timerRef = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    },
    [],
  )

  const copy = async (): Promise<void> => {
    try {
      const text = await getText()
      await navigator.clipboard.writeText(text)
      setState('copied')
    } catch {
      setState('failed')
    }
    timerRef.current = window.setTimeout(() => setState('idle'), 2000)
  }

  return (
    <button type="button" className="secondary copy-button" onClick={() => void copy()}>
      {state === 'copied' ? 'Copied ✓' : state === 'failed' ? 'Copy failed' : 'Copy'}
    </button>
  )
}
