import { afterEach, expect, test, vi } from 'vitest'
import {
  DEFAULT_PLAYBACK_SPEED,
  getStoredPlaybackSpeed,
  PLAYBACK_SPEED_STORAGE_KEY,
  storePlaybackSpeed,
} from './playbackSpeed'

afterEach(() => {
  localStorage.removeItem(PLAYBACK_SPEED_STORAGE_KEY)
  vi.restoreAllMocks()
})

test('returns the default speed when storage is empty', () => {
  expect(getStoredPlaybackSpeed()).toBe(DEFAULT_PLAYBACK_SPEED)
})

test('returns the stored value when a valid ladder value is stored', () => {
  localStorage.setItem(PLAYBACK_SPEED_STORAGE_KEY, '1.75')

  expect(getStoredPlaybackSpeed()).toBe(1.75)
})

test.each(['3', 'fast', ''])('returns 1 for invalid stored value %j', (stored) => {
  localStorage.setItem(PLAYBACK_SPEED_STORAGE_KEY, stored)

  expect(getStoredPlaybackSpeed()).toBe(1)
})

test('returns 1 without throwing when reading storage throws', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('blocked')
  })

  expect(() => getStoredPlaybackSpeed()).not.toThrow()
  expect(getStoredPlaybackSpeed()).toBe(1)
})

test('writes the speed to storage', () => {
  storePlaybackSpeed(1.5)

  expect(localStorage.getItem(PLAYBACK_SPEED_STORAGE_KEY)).toBe('1.5')
})

test('does not throw when persisting to storage throws', () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('blocked')
  })

  expect(() => storePlaybackSpeed(1.5)).not.toThrow()
})
