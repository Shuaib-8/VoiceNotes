export const PLAYBACK_SPEED_STORAGE_KEY = 'voicenotes-playback-speed'

export const PLAYBACK_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const

export type PlaybackSpeed = (typeof PLAYBACK_SPEEDS)[number]

export const DEFAULT_PLAYBACK_SPEED: PlaybackSpeed = 1

function isPlaybackSpeed(value: number): value is PlaybackSpeed {
  return (PLAYBACK_SPEEDS as readonly number[]).includes(value)
}

export function getStoredPlaybackSpeed(): PlaybackSpeed {
  try {
    const value = localStorage.getItem(PLAYBACK_SPEED_STORAGE_KEY)
    if (value !== null) {
      const parsed = Number(value)
      if (isPlaybackSpeed(parsed)) return parsed
    }
  } catch {
    // Private browsing or blocked storage — fall back to the default speed.
  }
  return DEFAULT_PLAYBACK_SPEED
}

export function storePlaybackSpeed(speed: PlaybackSpeed): void {
  try {
    localStorage.setItem(PLAYBACK_SPEED_STORAGE_KEY, String(speed))
  } catch {
    // A blocked write still leaves the speed live for the open note; it just won't persist to the next one.
  }
}
