import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

// jsdom does not implement scrollTo; the app restores scroll on Back.
window.scrollTo = vi.fn() as unknown as typeof window.scrollTo
