# Concepts

Shared domain vocabulary for this project — entities, named processes, and status concepts with project-specific meaning. Seeded with core domain vocabulary, then accretes as ce-compound and ce-compound-refresh process learnings; direct edits are fine. Glossary only, not a spec or catch-all.

## Archive & notes

### Archive
The canonical, self-describing store of every note: a single folder (default `~/VoiceNotes`, relocatable) holding one subfolder per note. It is the source of truth and outlives the app — any notes tool can open it, and moving it is a non-event. Reads walk the folder directly rather than a database or index, so the folder contents *are* the state.

### Note
The durable unit of capture: one folder holding the original audio byte-for-byte plus a `note.md` (the transcript with provenance frontmatter). A note is write-once — once complete it is never mutated in place; its final filename asserts its integrity.

Lifecycle: a note is **Complete** once its transcript is written, and **Incomplete** while it holds audio but no transcript yet — an interrupted or failed transcription, which stays visible and retryable and is never silently re-run. It is never observable in a half-written state at its final name.

### Trash
A reserved subfolder of the Archive holding deleted notes. "Delete" is a move into Trash, not an erase — a note is always recoverable (and restorable via Undo), because destroying the only copy of user audio is unacceptable. Directory scans and the startup sweep ignore it.

### Transfer garbage
An app-created note folder that holds no user data — for example an upload interrupted before any audio landed. It is swept away at startup and excluded from scans. Distinct from an Incomplete note, which *does* hold audio and is worth keeping and retrying.
