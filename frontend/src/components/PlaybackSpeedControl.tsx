import type { ReactElement } from 'react'
import { PLAYBACK_SPEEDS, type PlaybackSpeed } from '../playbackSpeed'

interface PlaybackSpeedControlProps {
  speed: PlaybackSpeed
  onChange: (speed: PlaybackSpeed) => void
}

function formatSpeedLabel(speed: PlaybackSpeed): string {
  return `${speed}×`
}

export default function PlaybackSpeedControl({ speed, onChange }: PlaybackSpeedControlProps): ReactElement {
  return (
    <div className="playback-speed" role="radiogroup" aria-label="Playback speed">
      {PLAYBACK_SPEEDS.map((option) => {
        const id = `playback-speed-${option}`
        return (
          <span className="playback-speed-option" key={option}>
            <input
              type="radio"
              id={id}
              name="playback-speed"
              className="visually-hidden"
              checked={speed === option}
              onChange={() => onChange(option)}
            />
            <label htmlFor={id}>{formatSpeedLabel(option)}</label>
          </span>
        )
      })}
    </div>
  )
}
