import { useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent, ReactElement } from 'react'

interface SearchBoxProps {
  onSearch: (query: string) => void
  onClear: () => void
}

export default function SearchBox({ onSearch, onClear }: SearchBoxProps): ReactElement {
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)
  const submitRef = useRef<HTMLButtonElement | null>(null)

  const clear = (): void => {
    setValue('')
    onClear()
    inputRef.current?.focus()
  }

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    const trimmed = value.trim()
    if (trimmed === '') {
      onClear() // client-side restore; the empty-q endpoint contract returns an empty set
    } else {
      onSearch(trimmed)
    }
  }

  // Esc backs out in steps: first press clears the query, second leaves the field.
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key !== 'Escape') return
    if (value !== '') {
      event.preventDefault()
      clear()
    } else {
      // Focus doctrine: never abandon focus to <body> — step out onto the next actor.
      submitRef.current?.focus()
    }
  }

  return (
    <form className="searchbox" onSubmit={submit} role="search">
      <span className="searchbox-field">
        <input
          ref={inputRef}
          type="search"
          placeholder="Search notes…"
          value={value}
          aria-label="Search notes"
          aria-keyshortcuts="/"
          title="Search ( / )"
          onKeyDown={onKeyDown}
          onChange={(event) => {
            setValue(event.target.value)
            if (event.target.value.trim() === '') onClear()
          }}
        />
        {value !== '' && (
          <button
            type="button"
            className="searchbox-clear"
            aria-label="Clear search"
            title="Clear (Esc)"
            onClick={clear}
          >
            ×
          </button>
        )}
      </span>
      <button ref={submitRef} type="submit" className="secondary">
        Search
      </button>
    </form>
  )
}
