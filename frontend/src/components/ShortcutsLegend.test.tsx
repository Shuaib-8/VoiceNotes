import { render } from '@testing-library/react'
import { expect, test } from 'vitest'
import ShortcutsLegend from './ShortcutsLegend'

test('renders every accelerator as a kbd chip beside its action label', () => {
  const { container } = render(<ShortcutsLegend />)

  // aria-label is ARIA-prohibited on a <p> (a naming-prohibited role), so the legend
  // is found by its class rather than a label real AT may ignore anyway.
  const legend = container.querySelector('.shortcuts-legend')
  expect(legend).not.toBeNull()
  const keys = Array.from(legend!.querySelectorAll('kbd')).map((kbd) => kbd.textContent)
  expect(keys).toEqual(['R', 'Q', '/', 'Esc'])

  expect(legend).toHaveTextContent('Record / Stop')
  expect(legend).toHaveTextContent('Cancel')
  expect(legend).toHaveTextContent('Search')
  expect(legend).toHaveTextContent('Back')
})
