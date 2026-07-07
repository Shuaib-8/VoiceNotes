import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test } from 'vitest'
import { THEME_STORAGE_KEY } from '../theme'
import ThemeToggle from './ThemeToggle'

afterEach(() => {
  delete document.documentElement.dataset.theme
  localStorage.removeItem(THEME_STORAGE_KEY)
})

test('shows a moon icon in light mode and switches to dark on click', async () => {
  document.documentElement.dataset.theme = 'light'
  localStorage.setItem(THEME_STORAGE_KEY, 'light')

  render(<ThemeToggle />)

  const button = screen.getByRole('button', { name: /switch to dark mode/i })
  expect(button.querySelector('svg')).toBeInTheDocument()
  expect(button).toHaveAttribute('aria-pressed', 'false')

  await userEvent.click(button)

  expect(screen.getByRole('button', { name: /switch to light mode/i }).querySelector('svg')).toBeInTheDocument()
  expect(document.documentElement.dataset.theme).toBe('dark')
  expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
})

test('shows a sun icon in dark mode and switches to light on click', async () => {
  document.documentElement.dataset.theme = 'dark'
  localStorage.setItem(THEME_STORAGE_KEY, 'dark')

  render(<ThemeToggle />)

  const button = screen.getByRole('button', { name: /switch to light mode/i })
  expect(button.querySelector('svg')).toBeInTheDocument()
  expect(button).toHaveAttribute('aria-pressed', 'true')

  await userEvent.click(button)

  expect(screen.getByRole('button', { name: /switch to dark mode/i }).querySelector('svg')).toBeInTheDocument()
  expect(document.documentElement.dataset.theme).toBe('light')
  expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light')
})
