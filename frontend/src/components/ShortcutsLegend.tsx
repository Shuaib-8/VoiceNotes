import type { ReactElement } from 'react'

// The printed key legend on a field recorder's faceplate: engraved, quiet, non-interactive.
export default function ShortcutsLegend(): ReactElement {
  return (
    <p className="shortcuts-legend">
      <kbd>R</kbd> Record / Stop <span aria-hidden="true">·</span> <kbd>Q</kbd> Cancel{' '}
      <span aria-hidden="true">·</span> <kbd>/</kbd> Search <span aria-hidden="true">·</span>{' '}
      <kbd>Esc</kbd> Back
    </p>
  )
}
