import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test } from 'vitest'
import { stubClipboard } from '../test-helpers'
import CopyButton from './CopyButton'

test('copies the provided text and confirms', async () => {
  const clipboard = stubClipboard()
  render(<CopyButton getText={async () => 'buy oat milk'} />)

  await userEvent.click(screen.getByRole('button', { name: /^copy$/i }))

  expect(await screen.findByRole('button', { name: /copied/i })).toBeInTheDocument()
  expect(clipboard.writes).toEqual(['buy oat milk'])
})

test('a failing text source reports copy failure instead of crashing', async () => {
  stubClipboard()
  render(
    <CopyButton
      getText={async () => {
        throw new Error('network down')
      }}
    />,
  )

  await userEvent.click(screen.getByRole('button', { name: /^copy$/i }))
  expect(await screen.findByRole('button', { name: /copy failed/i })).toBeInTheDocument()
})

test('a failed copy persists as the retry affordance and succeeds on the next click', async () => {
  const clipboard = stubClipboard()
  let failing = true
  render(
    <CopyButton
      getText={async () => {
        if (failing) throw new Error('note fetch failed')
        return 'second try'
      }}
    />,
  )

  await userEvent.click(screen.getByRole('button', { name: /^copy$/i }))
  const failedButton = await screen.findByRole('button', { name: /copy failed/i })
  expect(failedButton).toHaveAttribute('title', 'Click to try again')

  failing = false
  await userEvent.click(failedButton)
  expect(await screen.findByRole('button', { name: /copied/i })).toBeInTheDocument()
  expect(clipboard.writes).toEqual(['second try'])
})
