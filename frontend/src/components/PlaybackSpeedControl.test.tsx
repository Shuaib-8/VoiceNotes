import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import PlaybackSpeedControl from './PlaybackSpeedControl'

test('renders all seven options and marks the one matching the speed prop as checked', () => {
  const { rerender } = render(<PlaybackSpeedControl speed={1} onChange={vi.fn()} />)

  const labels = ['0.5×', '0.75×', '1×', '1.25×', '1.5×', '1.75×', '2×']
  for (const label of labels) {
    expect(screen.getByRole('radio', { name: label })).toBeInTheDocument()
  }
  expect(screen.getByRole('radio', { name: '1×' })).toBeChecked()

  rerender(<PlaybackSpeedControl speed={1.75} onChange={vi.fn()} />)

  expect(screen.getByRole('radio', { name: '1.75×' })).toBeChecked()
})

test('the group has the accessible name Playback speed', () => {
  render(<PlaybackSpeedControl speed={1} onChange={vi.fn()} />)

  expect(screen.getByRole('radiogroup', { name: 'Playback speed' })).toBeInTheDocument()
})

test('clicking a different option calls onChange with that numeric value', async () => {
  const user = userEvent.setup()
  const onChange = vi.fn()
  render(<PlaybackSpeedControl speed={1} onChange={onChange} />)

  await user.click(screen.getByRole('radio', { name: '1.5×' }))

  expect(onChange).toHaveBeenCalledWith(1.5)
})

test('a radio is reachable and activatable by keyboard', async () => {
  const user = userEvent.setup()
  const onChange = vi.fn()
  render(<PlaybackSpeedControl speed={1} onChange={onChange} />)

  screen.getByRole('radio', { name: '2×' }).focus()
  await user.keyboard(' ')

  expect(onChange).toHaveBeenCalledWith(2)
})
