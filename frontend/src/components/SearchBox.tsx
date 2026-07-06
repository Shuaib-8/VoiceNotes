import { useState } from 'react'
import type { FormEvent, ReactElement } from 'react'

interface SearchBoxProps {
  onSearch: (query: string) => void
  onClear: () => void
}

export default function SearchBox({ onSearch, onClear }: SearchBoxProps): ReactElement {
  const [value, setValue] = useState('')

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    const trimmed = value.trim()
    if (trimmed === '') {
      onClear() // client-side restore; the empty-q endpoint contract returns an empty set
    } else {
      onSearch(trimmed)
    }
  }

  return (
    <form className="searchbox" onSubmit={submit} role="search">
      <input
        type="search"
        placeholder="Search notes…"
        value={value}
        aria-label="Search notes"
        onChange={(event) => {
          setValue(event.target.value)
          if (event.target.value.trim() === '') onClear()
        }}
      />
      <button type="submit" className="secondary">
        Search
      </button>
    </form>
  )
}
