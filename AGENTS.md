# AGENTS.md

Canonical project context for AI coding agents. Tool-agnostic (the `agents.md` open standard); `CLAUDE.md` imports this file so Claude Code reads the same source of truth.

Personal, local-first voice notes: record from the mic or upload a voice file → local mlx-whisper transcript in seconds → every note persisted as plain files (immutable original audio + markdown transcript) in an archive folder any notes tool can open. No cloud, no accounts, no database. macOS on Apple Silicon only (transcription runs on Metal via MLX).

## Commands

```bash
uv sync                                   # backend deps (uv provisions Python 3.12)
cd frontend && npm install && npm run build && cd ..   # build the bundle the backend serves
uv run voice-notes                        # run; serves UI + API on http://127.0.0.1:8477

uv run pytest                             # backend suite — fast, fake engine (slow tests excluded)
uv run pytest -m slow                     # real-engine integration + latency (first run downloads ~1.6 GB model)
uv run ruff format --check . && uv run ruff check .
uv run pyrefly check                      # types

cd frontend && npm test                   # UI tests (Vitest + Testing Library)
cd frontend && npm run lint               # oxlint
cd frontend && npm run build              # tsc -b + vite build
```

Everything runs through `uv` — never bare `pip`/`python`/`venv`. The frontend build output (`frontend/dist/`, gitignored) must exist for `uv run voice-notes` to serve the UI.

## Architecture

Ingest is a serial pipeline behind a swappable engine seam. Backend layers in `src/voice_notes/`:

- `archive.py` — the canonical-archive contract: folder allocation, YAML frontmatter (Pydantic), atomic writes, scan, search. This file defines what a note *is* on disk.
- `transcription.py` — `Transcriber` protocol + `MlxWhisperTranscriber` adapter. An engine swap is one new adapter behind the protocol.
- `worker.py` — `TranscriptionWorker`: a single daemon thread draining a `queue.Queue`. **All engine work is serialized here** (see gotchas).
- `ingest.py` — `IngestService`: capture/upload → stream to final audio → enqueue → normalize → transcribe → write `note.md` once. Also list/search/get/retry, startup recovery.
- `config.py` — `Settings`, archive-root resolution (`VOICE_NOTES_ARCHIVE` env → default `~/VoiceNotes`).
- `app.py` — FastAPI routes (`/api/notes`, `/api/notes/mic`, `/api/notes/{id}`, `.../audio`, `.../retry`, `/api/search`) + `StaticFiles` mount; lifespan starts the worker, runs startup recovery, and submits warmup through the queue.

Frontend `frontend/src/` — Vite + React 19 + TypeScript. `api.ts` (typed client), `App.tsx` (no router — Detail overlays a hidden list div so Recorder/search state survive Back; polls every 2 s while any note is non-terminal), `components/`, `views/`.

**On-disk note** (the durable artifact — the archive outlives the app):
```text
2026-07-06-114439-e2e-memo/
├── audio.m4a     # original, byte-for-byte
└── note.md       # YAML frontmatter (captured_at, source, duration, engine/model/params) + transcript + audio embed
```

## Gotchas (non-obvious — read before touching the engine/archive)

- **MLX/Metal concurrency corrupts output silently.** Two concurrent `mlx_whisper` calls in one process hallucinate with no exception. ALL engine work — including model warmup — must ride the single serial worker queue (`worker.submit("__warmup__", engine.warmup)`), never a free thread. Regression: `test_api.py::test_warmup_never_runs_concurrently_with_a_job`.
- **`mlx_whisper.transcribe(path)` shells out to a PATH-resolved ffmpeg** (hidden Homebrew dep). The adapter instead decodes a normalized WAV in-process and passes the **waveform ndarray**, never a path. Don't "simplify" it back to a path. Verified by a slow test that scrubs PATH.
- **Write-once durability.** A note's final filename asserts its integrity: stream to a dot-temp (`.name.part`), fsync, `os.replace` on clean end-of-stream. `note.md` is written exactly once (`write_note_md` raises `NoteAlreadyCompleteError`). The app never mutates a stored note; failed transcriptions stay visible with a retry button.
- **macOS `UF_HIDDEN` breaks editable installs.** Python 3.12+ silently skips *hidden* `.pth` files, so `uv run voice-notes` fails with `ModuleNotFoundError: No module named 'voice_notes'`. Some background process on this Mac re-flags files as hidden without changing mtime. Fix: `chflags -R nohidden .venv`.
- **Slow tests are excluded by default** (`addopts = "-m 'not slow'"`). Run `uv run pytest -m slow` to exercise the real engine; the first run downloads the model.
- No Homebrew ffmpeg is required at runtime — a vendored ffmpeg (`imageio-ffmpeg`) does normalization, and the engine receives decoded audio.
- **HTTP endpoints run on a threadpool, so archive reads and renames race.** FastAPI runs each `run_in_threadpool` handler on its own thread; delete/restore are `os.rename`s that can fire *while* `scan_archive` is walking the same directory (the 2 s poll overlaps a delete). Every per-folder read in a scan must tolerate a folder vanishing mid-walk — `scan_archive` wraps its loop body in `try/except OSError: continue`. Add a new read path and you must do the same or you'll 500 list/search/get. Regression: `test_archive.py::test_scan_skips_a_folder_removed_mid_scan`.
- **`note_id` comes from the URL — treat it as hostile.** `_validated_note_dir` gates every rename on `_NOTE_FOLDER_PATTERN`, which excludes path separators (`[^/\\]+`) so a resolved note dir is always a single component under the archive (never `a/../b`). Keep that class tight and keep the docstring truthful. Regression: `test_archive.py::test_folder_pattern_refuses_path_separators`.

## Design Context

Frontend/UI work is governed by two root files (authored on the `worktree-frontend-optimisation` branch): `PRODUCT.md` — register: **product**; personality "warm, personal, archival"; five design principles (capture before chrome; the archive is the truth; recall ends in a paste; warmth without gloss; state is always honest) — and `DESIGN.md` — the visual system (North Star **"The Pocket Field Recorder"**: a monochrome instrument — Ink actions on paper/charcoal warmed toward the REC lamp's rose hue, flat hairline-bordered single 640px column, system-ui type; chroma reserved for state: the Record Red lamp/glyph, the three status-chip triads, and Danger; the starter violet was retired 2026-07-06). Read both before any UI change; `/impeccable` commands consume them automatically.

Two frontend invariants the components uphold (breaking them is silent, not loud): **Focus Doctrine** — focus is never allowed to drop to `<body>`; every note card carries `data-note-id` + `tabIndex={-1}` and openable ones add `data-note-open`, so `focusAfterPaint(...selectors)` can always land on a real target (opener → card fallback) after a route change, delete, or undo. **Delete is trash, never erase** — a delete is an `os.rename` into `<archive>/.trash/` (recoverable, 409 while transcribing), and its inline Undo is honest: an `'idle' | 'undoing' | 'failed'` status keeps the notice up and names the failure rather than claiming a note returned when `restore` failed.

## Conventions

- Python: fully type-annotated; Pydantic models over loose dicts; `uv` for everything. A PostToolUse hook auto-runs ruff + pyrefly on `.py` save — keep it green.
- TypeScript: explicit return types; `const` assertions.
- Descriptive names, composition over inheritance, type the boundaries.
- Commit/push only when asked; branch first if on `main`.
