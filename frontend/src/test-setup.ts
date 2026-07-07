import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

// jsdom does not implement scrollTo; the app restores scroll on Back.
window.scrollTo = vi.fn() as unknown as typeof window.scrollTo

// jsdom may omit matchMedia; theme resolution and the toggle depend on it.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  configurable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// Node 25 + jsdom can expose a broken localStorage; theme persistence needs a real store.
const storage = new Map<string, string>()
Object.defineProperty(window, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key: string): string | null => storage.get(key) ?? null,
    setItem: (key: string, value: string): void => {
      storage.set(key, value)
    },
    removeItem: (key: string): void => {
      storage.delete(key)
    },
    clear: (): void => {
      storage.clear()
    },
    key: (index: number): string | null => [...storage.keys()][index] ?? null,
    get length(): number {
      return storage.size
    },
  },
})
