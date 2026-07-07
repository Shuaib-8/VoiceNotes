---
title: "Concurrent delete races the archive directory scan (500 on list/search/get)"
date: 2026-07-07
category: runtime-errors
module: voice_notes.archive
problem_type: runtime_error
component: service_object
symptoms:
  - "GET /api/notes intermittently returns HTTP 500 during normal use"
  - "GET /api/search and GET /api/notes/{id} 500 when a delete runs concurrently"
  - "FileNotFoundError raised from _find_audio inside scan_archive"
  - "500s coincide with DELETE/restore folder renames overlapping the 2s frontend poll"
root_cause: async_timing
resolution_type: code_fix
severity: high
tags: [concurrency, race-condition, toctou, fastapi, threadpool, filesystem-datastore, os-rename]
related_components: [ingest_service, fastapi_threadpool, worker_queue]
---

# Concurrent delete races the archive directory scan (500 on list/search/get)

## Problem

`scan_archive` snapshots the archive folder list, then reads *into* each folder — but a concurrent `DELETE`/`restore` (an `os.rename` on another request thread) can move a folder away between the two steps, raising an unguarded `FileNotFoundError` that surfaces as an HTTP 500. Because the frontend polls `GET /api/notes` every 2 seconds while any note is still processing, a user deleting a note (or hitting Undo) routinely 500s their own list, search, and detail views.

## Symptoms

- Intermittent HTTP 500 on `GET /api/notes` (list), `GET /api/search`, and `GET /api/notes/{id}`.
- Traceback shows `FileNotFoundError` originating inside `scan_archive`'s per-folder `_classify` → `_find_audio` path (`folder.iterdir()`/glob on a folder that no longer exists).
- Strictly timing-dependent: only reproduces when a delete or restore overlaps the 2 s poll. A quiet archive never fails, so manual testing misses it — it shows up as flaky 500s in real use.

## What Didn't Work

The obvious defense was already present, which made the code *look* hardened. `scan_archive` had a `try/except (ValueError, OSError)` — but it wrapped only the later `load_note(folder)` transcript read (there to tolerate a corrupt or foreign `note.md`). The earlier `_classify(folder)` read, which runs first and *also* touches the filesystem, sat outside the guard. The guard was in the wrong place: it protected the second filesystem read while leaving the first exposed.

The other tempting assumption — that snapshotting the directory with `archive_root.iterdir()` makes the scan atomic — is false. `iterdir()` yields path *handles*, not a materialized copy of each folder's contents. Reading into a snapshotted folder later still fails if that folder has since been renamed away.

## Solution

Wrap the *entire* per-folder loop body in `try/except OSError: continue`, so any folder that vanishes mid-scan is skipped instead of failing the whole listing. In `src/voice_notes/archive.py`:

BEFORE:
```python
for folder in folders:
    state, audio = _classify(folder)          # FileNotFoundError here was unguarded
    if state is None:
        continue
    note = ScannedNote(note_id=folder.name, path=folder, state=state, audio_filename=audio)
    if state == NoteState.COMPLETE:
        try:
            note.frontmatter, note.transcript = load_note(folder)
        except (ValueError, OSError):         # only this read was guarded
            pass
    notes.append(note)
return notes
```

AFTER:
```python
for folder in folders:
    try:
        state, audio = _classify(folder)
        if state is None:
            continue
        note = ScannedNote(note_id=folder.name, path=folder, state=state, audio_filename=audio)
        if state == NoteState.COMPLETE:
            try:
                note.frontmatter, note.transcript = load_note(folder)
            except (ValueError, OSError):
                # Foreign edits can corrupt a note.md; tolerate rather than fail the listing.
                pass
        notes.append(note)
    except OSError:
        # A concurrent delete/restore (rename on another request thread) can move a
        # folder out from under this scan; skip the vanished entry rather than 500.
        continue
return notes
```

## Why This Works

The failure is a TOCTOU (time-of-check to time-of-use) race: the check is the directory snapshot; the use is the per-folder read; and the window between them is open to any other request thread. FastAPI serves each sync endpoint via `run_in_threadpool`, so reads (`scan_archive`) and mutations (`os.rename` into/out of `<archive>/.trash/`) run concurrently on independent worker threads. That window cannot be closed without serializing all archive access behind a global lock — which the design deliberately avoids. So the read must tolerate the folder disappearing rather than try to prevent it.

Skipping a vanished folder is not merely a papered-over error; it is the semantically correct result. A folder that disappears mid-scan was either just trashed (it *should* leave the listing) or is mid-restore (it reappears on the very next 2 s poll). Either way, the correct listing for that instant is the one without it. And because `FileNotFoundError` is a subclass of `OSError`, the broad `except OSError` also absorbs other transient per-entry filesystem errors on the same read, not just the rename race.

## Prevention

- **Regression test** — `tests/test_archive.py::test_scan_skips_a_folder_removed_mid_scan`: monkeypatches `archive._classify` to raise `FileNotFoundError` for one of two folders, then asserts `scan_archive` returns only the surviving note and that both folders were visited (so the loop kept going past the vanished one rather than aborting).
- **AGENTS.md rule** (Gotchas): HTTP endpoints run on a threadpool, so archive reads and renames race. Any NEW per-folder read in a scan/sweep must tolerate a folder vanishing mid-walk — `try/except OSError` at single-entry granularity — or it will 500 list/search/get.
- **General principle**: with a filesystem-as-datastore under concurrent mutation, treat every directory read as fallible. Catch `OSError` per entry so one vanished entry never fails the whole batch.
- **Known sibling to watch**: `sweep_transfer_garbage` makes the same `_classify` call but currently runs only at startup, not concurrently with user deletes, so it is lower-risk today. It deserves the identical per-entry guard if it ever moves onto a live/concurrent path.

## Related Issues

- First entry in `docs/solutions/`.
- Sibling hardening from the same code review: the `note_id` path-traversal guard (`_NOTE_FOLDER_PATTERN` excludes path separators so a URL-supplied id can't escape the archive) — recorded in `AGENTS.md` under Gotchas.
- The threadpool read/rename race rule and the write-once durability contract both live in `AGENTS.md` under Gotchas.
