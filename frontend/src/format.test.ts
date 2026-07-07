import { describe, expect, it } from 'vitest'
import {
  describeSource,
  formatDetailStamp,
  formatDuration,
  formatListStamp,
  humanizeModel,
} from './format'

const now = new Date(2026, 6, 7, 12, 0) // 7 July 2026, midday

describe('formatListStamp', () => {
  it('labels same-day captures Today', () => {
    expect(formatListStamp('2026-07-07T09:15:00', now)).toMatch(/^Today /)
  })

  it('labels the previous day Yesterday', () => {
    expect(formatListStamp('2026-07-06T23:59:00', now)).toMatch(/^Yesterday /)
  })

  it('drops the year while it matches the current one', () => {
    const stamp = formatListStamp('2026-03-02T09:15:00', now)
    expect(stamp).not.toContain('2026')
    expect(stamp).toMatch(/Mar/)
  })

  it('keeps the year on older notes', () => {
    expect(formatListStamp('2025-12-31T09:15:00', now)).toContain('2025')
  })

  it('never shows seconds', () => {
    expect(formatListStamp('2026-07-07T09:15:42', now)).not.toContain('42')
  })

  it('is empty for missing or invalid stamps', () => {
    expect(formatListStamp(null, now)).toBe('')
    expect(formatListStamp('not-a-date', now)).toBe('')
  })
})

describe('formatDetailStamp', () => {
  it('is absolute with the year, without seconds', () => {
    const stamp = formatDetailStamp('2026-07-06T10:02:33')
    expect(stamp).toContain('2026')
    expect(stamp).not.toMatch(/\d:\d{2}:\d{2}/)
  })
})

describe('formatDuration', () => {
  it('renders m:ss and rounds sub-second noise', () => {
    expect(formatDuration(4.2)).toBe('0:04')
    expect(formatDuration(61)).toBe('1:01')
    expect(formatDuration(null)).toBe('')
  })
})

describe('humanizeModel', () => {
  it('drops the vendor prefix and speaks Whisper plainly', () => {
    expect(humanizeModel('mlx-community/whisper-large-v3-turbo')).toBe('Whisper large-v3-turbo')
  })

  it('falls back to the bare model name', () => {
    expect(humanizeModel('someone/model-x')).toBe('model-x')
  })
})

describe('describeSource', () => {
  it('speaks both capture paths in plain words', () => {
    expect(describeSource('mic', null)).toBe('recorded from the mic')
    expect(describeSource('upload', 'memo.m4a')).toBe('uploaded as memo.m4a')
    expect(describeSource('upload', null)).toBe('uploaded')
    expect(describeSource(null, null)).toBe('')
  })
})
