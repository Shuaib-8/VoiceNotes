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
| Data store scalability (local MD vs multi-tenant DB) | If this ever became a multi-user web app, local markdown files wouldn't hold — would need user auth, multi-tenancy, and object storage (e.g. S3) behind it. Today's local-first, single-user identity (see *Out of scope* below) makes this moot; flagging so a future pivot is a deliberate decision, not accidental drift. | shelved | user note, 2026-07-14 |
| Quit-recording keyboard shortcut (e.g. `Q`) | A dedicated hotkey to abandon an in-progress recording, distinct from the existing Stop/cancel-confirmation flow — discard a bad take without reaching for the mouse. | shelved | user note, 2026-07-14 |
| Preview environments | Ephemeral per-PR/per-branch deployments for manual QA before merge. | shelved | user note, 2026-07-14 |
| Hybrid search via Postgres + pgvector | Alternative to the already-scouted sqlite-vec + FTS5 hybrid: full-text via Postgres at scale, semantic via pgvector, framed as a long-term-memory layer. Requires a live Postgres instance — in tension with the product's local-first, no-database identity; compare against sqlite-vec before committing either way. | shelved | user note, 2026-07-14 |
| Transcript-cleanup agent pass | A dedicated pass (LLM or rules-based) to scrub filler words and fix formatting/punctuation before the transcript is handed off and written into `note.md` — improves the readability of the final artifact. | shelved | user note, 2026-07-14 |
| Playback speed control | Adjustable audio playback speed (up to 2x, 0.25x increments) in the note detail view. | shelved | user note, 2026-07-14 |

## Technical follow-ups (surfaced during the build)

| Item | Why | Status | Source |
|------|-----|--------|--------|
| Guard `sweep_transfer_garbage` for concurrency | Makes the same per-folder read as the fixed `scan_archive` race; safe today (startup-only) but needs the identical `OSError` guard if it ever runs on a live/concurrent path. | shelved | docs/solutions/runtime-errors/concurrent-delete-races-directory-scan.md |
| Scan cache at scale | `get` / `audio` / `retry` each re-scan the whole archive; fine at personal scale, revisit with a write-invalidated cache if the corpus grows large. | shelved | docs/pr/2026-07-07-001-frontend-optimisation.md |
| Compose `$HOME` unset on native Windows PowerShell | `docker-compose.yml`'s archive default interpolates `$HOME`, which native PowerShell/CMD don't set (WSL2/Git Bash do) — resolves to a bogus path there. Non-blocking: Docker isn't the recommended Windows runner and `VOICE_NOTES_DIR` is a one-flag workaround, already documented in the README and the solution doc. | shelved | docs/solutions/integration-issues/docker-compose-tilde-home-bind-mount.md |

## Out of scope by identity (deliberately never)

Not backlog — these are boundaries the product is defined *against*. Listed only so they're never mistaken for someday-items.

- Cloud sync service, accounts, multi-user, or mobile apps. Backup/sync is achieved by placing the archive folder in an already-synced location, never by product infrastructure.

---
*Authoritative deferral record: `docs/plans/2026-07-06-001-feat-voice-notes-walking-skeleton-plan.md` Scope Boundaries. Raw idea superset (pre-filtering): `docs/research/2026-07-06-local-voice-notes-ideation.html`.*