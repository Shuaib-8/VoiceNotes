export const THEME_STORAGE_KEY = 'voicenotes-theme'

const PREFERS_DARK = '(prefers-color-scheme: dark)'

export type Theme = 'light' | 'dark'

export function getStoredTheme(): Theme | null {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY)
    if (value === 'light' || value === 'dark') return value
  } catch {
    // Private browsing or blocked storage — fall back to system preference.
  }
  return null
}

export function resolveTheme(): Theme {
  const stored = getStoredTheme()
  if (stored !== null) return stored
  return window.matchMedia(PREFERS_DARK).matches ? 'dark' : 'light'
}

/** Watch the OS light/dark preference; returns an unsubscribe for effect cleanup. */
export function subscribeToSystemTheme(onChange: () => void): () => void {
  const media = window.matchMedia(PREFERS_DARK)
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // Preference still applies for this session via data-theme.
  }
}

export function initTheme(): void {
  const stored = getStoredTheme()
  if (stored !== null) document.documentElement.dataset.theme = stored
}
