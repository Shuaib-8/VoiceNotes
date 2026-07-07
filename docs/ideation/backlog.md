# Ideas Backlog

A hand-maintained parking lot for ideas consciously shelved from v1, plus technical follow-ups worth doing later. This is the list to **scan when deciding what to work on next** — not a plan, not a commitment. Edit it freely; move statuses as things change.

Seeded 2026-07-07 from the walking-skeleton plan's *Scope Boundaries* and the original ideation report. The plan remains the authoritative record of *why* each was deferred; this file is the quick browsable index over it.

**Status legend:** `shelved` = deferred but revisitable · `considering` = on deck · `done` = shipped since seeding · `out-of-scope` = deliberately never (an identity boundary, not a someday-item).

## Product ideas (shelved from v1)

| Idea | What it is / why it was parked | Status | Source |
|------|-------------------------------|--------|--------|
| Semantic / hybrid search | Beyond keyword matching — vector + full-text + RRF ranking. Known landing zone already scouted: sqlite-vec + FTS5 hybrid (Alex Garcia). | shelved | plan Scope Boundaries; KTD-6; research digest |
| `re-derive` command | Re-transcribe the whole corpus with a better model, with diff review. Provenance stamps were added in v1 *specifically* to enable this later. | shelved | plan Deferred; KTD-1 / R8 |
| Batch import | Upload many files at once (v1 upload stays one-at-a-time). | shelved | plan Deferred |
| Transcript editing / correction | Edit or correct a transcript in the UI (v1: notes are managed as files in Finder). | shelved | plan Deferred |
| Note rename in the UI | Rename a note from the app. **Note *delete* has since shipped** (trash + inline undo); rename has not. | shelved | plan Deferred |
| Enrichment: auto-titles, summaries, tags | Derived metadata generated over transcripts. | shelved | plan Deferred |
| Durable auto-titles | Transcript-derived folder slugs (v1 uses timestamp folder names; first-line titles are UI-only, not persisted). | shelved | KTD-7 |
| Hotkey / menu-bar capture | Capture a note without opening the browser tab. | shelved | plan Deferred |
| Thread views | Group related notes into threads/conversations. | shelved | plan Deferred |
| Embedded recording-date extraction | Read the original capture date out of uploaded files (v1 stamps ingest time; the original filename keeps the trace). | shelved | plan Deferred |
| Folder-picker first-run flow | Choose the archive location via the UI (v1: `VOICE_NOTES_ARCHIVE` env var + `~/VoiceNotes` default). | shelved | KTD-9 |
| Progressive chunk persistence | Persist mic chunks (IndexedDB or streamed upload) so a browser-tab crash mid-recording doesn't lose the take. | shelved | plan Risks |
| External index / caches | A rebuildable index kept *outside* the archive folder, so the archive stays pure canonical files. | shelved | plan Design principles |
| Multi-device / phone capture | Capture from devices other than the owner's Mac. | shelved | plan Deferred |
| Egress-deny sandbox hardening | Lock down the app's network egress. | shelved | plan Deferred |

## Technical follow-ups (surfaced during the build)

| Item | Why | Status | Source |
|------|-----|--------|--------|
| Guard `sweep_transfer_garbage` for concurrency | Makes the same per-folder read as the fixed `scan_archive` race; safe today (startup-only) but needs the identical `OSError` guard if it ever runs on a live/concurrent path. | shelved | docs/solutions/runtime-errors/concurrent-delete-races-directory-scan.md |
| Scan cache at scale | `get` / `audio` / `retry` each re-scan the whole archive; fine at personal scale, revisit with a write-invalidated cache if the corpus grows large. | shelved | docs/pr/2026-07-07-001-frontend-optimisation.md |

## Out of scope by identity (deliberately never)

Not backlog — these are boundaries the product is defined *against*. Listed only so they're never mistaken for someday-items.

- Cloud sync service, accounts, multi-user, or mobile apps. Backup/sync is achieved by placing the archive folder in an already-synced location, never by product infrastructure.

---
*Authoritative deferral record: `docs/plans/2026-07-06-001-feat-voice-notes-walking-skeleton-plan.md` Scope Boundaries. Raw idea superset (pre-filtering): `docs/research/2026-07-06-local-voice-notes-ideation.html`.*
