# AGENTS.md

Canonical project context for AI coding agents. Tool-agnostic (the `agents.md` open standard); `CLAUDE.md` imports this file so Claude Code reads the same source of truth.

Personal, local-first voice notes: record from the mic or upload a voice file → local Whisper transcript in seconds → every note persisted as plain files (immutable original audio + markdown transcript) in an archive folder any notes tool can open. No cloud, no accounts, no database. Runs on macOS Apple Silicon (mlx-whisper on Metal), Windows 11, and Linux (faster-whisper on CPU); Windows/Linux support is CI-verified (GitHub Actions matrix), not hand-tested.

## Commands

```bash
uv sync                                   # backend deps (uv provisions Python 3.12)
cd frontend && npm install && npm run build && cd ..   # build the bundle the backend serves
uv run voice-notes                        # run; serves UI + API on http://127.0.0.1:8477

uv run pytest                             # backend suite — fast, fake engine (slow tests excluded)
uv run pytest -m slow                     # real-engine integration + latency (first run downloads the model, ~1.5–1.6 GB)
uv run ruff format --check . && uv run ruff check .
uv run pyrefly check                      # types
#   ^ from a git worktree this can match 0 files (false green); pass paths: uv run pyrefly check src tests

cd frontend && npm test                   # UI tests (Vitest + Testing Library)
cd frontend && npm run lint               # oxlint
cd frontend && npm run build              # tsc -b + vite build
```

Everything runs through `uv` — never bare `pip`/`python`/`venv`. The frontend build output (`frontend/dist/`, gitignored) must exist for `uv run voice-notes` to serve the UI.

CI (`.github/workflows/ci.yml`) reruns all of the above on a macOS/Windows/Ubuntu matrix on every PR targeting `main` (pre-merge) and on every merge (push) to `main` (post-merge, catching anything that bypassed a PR) — plus manual `workflow_dispatch` for on-demand branch runs; a plain push to a feature branch with no open PR does not trigger it. Every lane installs strictly from the committed lockfile (`uv sync --locked`, never re-locking); a real CPU-engine suite runs on Windows/Ubuntu (`uv run pytest -m slow tests/test_transcription_cpu_slow.py`), and a Docker build + boot smoke runs on Ubuntu. That matrix — not hand-testing — backs the Windows/Linux support claim.

A `Makefile` wraps the commands above for first-time setup and daily use (`make setup`, `make run`, `make test`, `make check`, `make docker-up`; bare `make` lists all targets — macOS/Linux/WSL2, not native Windows). `docker-compose.yml` is the preferred container entry point: it binds the archive to `~/VoiceNotes` on the host (native-identical layout) and keeps the model cache in the `voice-notes-hf-cache` named volume.

## Architecture

Ingest is a serial pipeline behind a swappable engine seam. Backend layers in `src/voice_notes/`:

- `archive.py` — the canonical-archive contract: folder allocation, YAML frontmatter (Pydantic), atomic writes, scan, search. This file defines what a note *is* on disk.
- `transcription.py` — `Transcriber` protocol + two adapters: `MlxWhisperTranscriber` (Metal, macOS) and `FasterWhisperTranscriber` (CTranslate2, CPU int8, Windows/Linux — CTranslate2 is an upstream-maintenance risk; sherpa-onnx is the named fallback). Engine selection is `select_transcriber` in `app.py` (auto by platform; env overrides below). An engine swap is one new adapter behind the protocol.
- `worker.py` — `TranscriptionWorker`: a single daemon thread draining a `queue.Queue`. **All engine work is serialized here** (see gotchas).
- `ingest.py` — `IngestService`: capture/upload → stream to final audio → enqueue → normalize → transcribe → write `note.md` once. Also list/search/get/retry, startup recovery.
- `config.py` — `Settings`; env resolution for `VOICE_NOTES_ARCHIVE` (→ default `~/VoiceNotes`), `VOICE_NOTES_ENGINE` (`auto` | `mlx-whisper` | `faster-whisper`; bad values fail at startup), `VOICE_NOTES_MODEL`, `VOICE_NOTES_HOST` (default loopback).
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
- **The serial worker queue applies to the CPU engine too.** On MLX it's correctness (Metal corruption); on CTranslate2 it's OpenMP thread contention — `FasterWhisperTranscriber` pins `num_workers=1` and its work still rides the same single queue.
- **`mlx_whisper.transcribe(path)` shells out to a PATH-resolved ffmpeg** (hidden Homebrew dep). The adapter instead decodes a normalized WAV in-process and passes the **waveform ndarray**, never a path. Don't "simplify" it back to a path. Verified by a slow test that scrubs PATH.
- **Write-once durability.** A note's final filename asserts its integrity: stream to a dot-temp (`.name.part`), fsync, `os.replace` on clean end-of-stream. `note.md` is written exactly once (`write_note_md` raises `NoteAlreadyCompleteError`). The app never mutates a stored note; failed transcriptions stay visible with a retry button.
- **macOS `UF_HIDDEN` breaks editable installs.** Python 3.12+ silently skips *hidden* `.pth` files, so `uv run voice-notes` fails with `ModuleNotFoundError: No module named 'voice_notes'`. Some background process on this Mac re-flags files as hidden without changing mtime. Fix: `chflags -R nohidden .venv`.
- **Slow tests are excluded by default** (`addopts = "-m 'not slow'"`). Run `uv run pytest -m slow` to exercise the real engine; the first run downloads the model.
- No Homebrew ffmpeg is required at runtime — a vendored ffmpeg (`imageio-ffmpeg`) does normalization, and the engine receives decoded audio.
- **HTTP endpoints run on a threadpool, so archive reads and renames race.** FastAPI runs each `run_in_threadpool` handler on its own thread; delete/restore are `os.rename`s that can fire *while* `scan_archive` is walking the same directory (the 2 s poll overlaps a delete). Every per-folder read in a scan must tolerate a folder vanishing mid-walk — `scan_archive` wraps its loop body in `try/except OSError: continue`. Add a new read path and you must do the same or you'll 500 list/search/get. Regression: `test_archive.py::test_scan_skips_a_folder_removed_mid_scan`.
- **`note_id` comes from the URL — treat it as hostile.** `_validated_note_dir` gates every rename on `_NOTE_FOLDER_PATTERN`, which excludes path separators (`[^/\\]+`) so a resolved note dir is always a single component under the archive (never `a/../b`). Keep that class tight and keep the docstring truthful. Regression: `test_archive.py::test_folder_pattern_refuses_path_separators`.
- **Lockfile operations run ONLY on macOS Apple Silicon.** An open uv bug makes re-locking fail on platforms where a marker excludes a wheels-only package (mlx-whisper is darwin/arm64-only). `uv lock` / `uv add` / `uv remove` happen on the Mac; CI installs with `uv sync --locked` and never re-resolves.
- **Keep PyTorch off the Windows/Linux runtime.** faster-whisper/CTranslate2 needs no torch, and torch's bundled OpenMP collides with CTranslate2's on Windows (the DLL Error #15 class), so model-conversion extras that pull torch stay out of `pyproject.toml`. (On macOS, mlx-whisper *does* transitively pull torch; CTranslate2 coexists with it fine there — verified by `uv run pytest -m slow` loading both engines in one process — because the collision is the Windows Intel-OpenMP phenomenon, not a portable one.)
- **Test audio fixtures are committed** under `tests/fixtures/` as byte-exact contracts. Regenerate ONLY via `uv run python scripts/generate_test_fixtures.py` on macOS; the `.gitattributes` rule (`tests/fixtures/** -text`) keeps fixture bytes exact on Windows checkouts (no autocrlf mangling).

## Design Context

Frontend/UI work is governed by two root files (authored on the `worktree-frontend-optimisation` branch): 

- `PRODUCT.md` — register: **product**; personality "warm, personal, archival"; five design principles (capture before chrome; the archive is the truth; recall ends in a paste; warmth without gloss; state is always honest) 
— `DESIGN.md` — the visual system (North Star **"The Pocket Field Recorder"**: a monochrome instrument — Ink actions on paper/charcoal warmed toward the REC lamp's rose hue, flat hairline-bordered single 640px column, system-ui type; chroma reserved for state: the Record Red lamp/glyph, the three status-chip triads, and Danger; the starter violet was retired 2026-07-06). Read both before any UI change; `/impeccable` commands consume them automatically.

Two frontend invariants the components uphold (breaking them is silent, not loud): **Focus Doctrine** — focus is never allowed to drop to `<body>`; every note card carries `data-note-id` + `tabIndex={-1}` and openable ones add `data-note-open`, so `focusAfterPaint(...selectors)` can always land on a real target (opener → card fallback) after a route change, delete, or undo. **Delete is trash, never erase** — a delete is an `os.rename` into `<archive>/.trash/` (recoverable, 409 while transcribing), and its inline Undo is honest: an `'idle' | 'undoing' | 'failed'` status keeps the notice up and names the failure rather than claiming a note returned when `restore` failed.

The keyboard map (`R` record/stop, `Q` cancel recording, `/` search, `Esc` step-out) lives in `App.tsx` + `Recorder.tsx`, is surfaced in-app by `components/ShortcutsLegend.tsx`, and is user-documented in the README's "Using it" section — change all of them together.

## Conventions

- Python: fully type-annotated; Pydantic models over loose dicts; `uv` for everything. A PostToolUse hook auto-runs ruff + pyrefly on `.py` save — keep it green.
  - The ruff `--fix` hook strips a not-yet-used import between edits: when adding an import + its first use, **edit the usage first and add the import last** (batch both, import edit last).
- TypeScript: explicit return types; `const` assertions.
- Descriptive names, composition over inheritance, type the boundaries.
- Documented solutions to past problems live in `docs/solutions/` (by category, with YAML frontmatter: `module`, `tags`, `problem_type`); shared domain vocabulary lives in `CONCEPTS.md`. Both are relevant when implementing or debugging in a documented area.
- Commit/push only when asked; branch first if on `main`.
