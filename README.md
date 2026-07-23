# VoiceNotes

[![CI](https://github.com/Shuaib-8/VoiceNotes/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/Shuaib-8/VoiceNotes/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/Shuaib-8/VoiceNotes/branch/main/graph/badge.svg)](https://codecov.io/gh/Shuaib-8/VoiceNotes)
[![Python 3.12](https://img.shields.io/badge/python-3.12-3776AB?logo=python&logoColor=white)](pyproject.toml)
[![Platforms](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey)](#prerequisites)
[![Ruff](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/astral-sh/ruff/main/assets/badge/v2.json)](https://github.com/astral-sh/ruff)
[![uv](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/astral-sh/uv/main/assets/badge/v0.json)](https://github.com/astral-sh/uv)
[![License: MIT](https://img.shields.io/github/license/Shuaib-8/VoiceNotes)](LICENSE)

Personal, local-first voice notes: record from the mic or upload a voice file (Apple Voice Memos `.m4a`, WhatsApp `.opus`, …), get a transcript within seconds from a **local** model, and keep every note as plain files — immutable original audio plus a markdown transcript — in an archive folder any modern notes tool can open. No cloud, no accounts, no database.

**The archive outlives the app.** Each note is one folder holding the original audio byte-for-byte and a `note.md` (YAML frontmatter with full transcription provenance + transcript + audio embed). 

## Prerequisites

Runs on macOS (Apple Silicon), Windows 11, and Linux. On every OS you need:

- git
- [uv](https://docs.astral.sh/uv/) — manages Python and all backend dependencies
- Node.js LTS — only to build the frontend bundle

Transcription picks its engine automatically at startup:

- **macOS on Apple Silicon** — mlx-whisper on Metal (GPU-fast).
- **Windows 11 / Linux** — faster-whisper (CTranslate2) on the CPU, int8-quantized. Same Whisper model family, near-parity transcripts; slower than Metal, but faster than real-time on a modern CPU.

Windows and Linux support is **CI-verified**: a GitHub Actions matrix (macOS / Windows / Ubuntu) runs the full backend and frontend suites on every merge to `main`, and a real-engine smoke transcribes committed audio fixtures on Windows and Ubuntu runners. No human-run Windows hardware is in the loop — the support claim is exactly as strong as that automation.

No compiler and no system ffmpeg needed on any OS: a vendored ffmpeg ships with the Python dependencies, and the engine receives decoded audio directly.

## Setup

On macOS, Linux, or WSL2, two commands install everything and start the app:

```bash
make setup   # backend deps (uv provisions Python 3.12) + frontend build
make run     # serve UI + API on http://127.0.0.1:8477
```

(`make` alone lists every target: tests, lint/types, the Docker compose service.)

The equivalent manual steps — and the only path on native Windows, which has no `make`:

```bash
# 1. Install backend dependencies (uv provisions Python 3.12 automatically)
uv sync

# 2. Build the frontend (served by the backend afterwards)
cd frontend && npm install && npm run build && cd ..

# 3. Run
uv run voice-notes
```

The steps are identical on every OS; only the shell syntax differs. On Windows PowerShell, chain step 2 with `;` instead of `&&`:

```powershell
cd frontend; npm install; npm run build; cd ..
```

**WSL2** works via the Linux path. Keep the archive on the WSL-side filesystem (the default `~/VoiceNotes` is fine), not under `/mnt/c` — the archive's durability leans on full rename/fsync semantics.

If `uv run voice-notes` fails with `ModuleNotFoundError: No module named 'voice_notes'`
on a project stored under iCloud-synced Desktop/Documents, clear macOS hidden flags from the
virtualenv and retry:

```bash
chflags -R nohidden .venv
uv run voice-notes
```

Open http://127.0.0.1:8477 in Chrome (the v1 target browser). Click **● Record**, speak, click **Stop** — the note lands transcribed, with zero keyboard.

**First transcription only:** the local model is downloaded once from Hugging Face — `mlx-community/whisper-large-v3-turbo` (~1.6 GB) on macOS; the `large-v3-turbo` CTranslate2 weights on Windows/Linux (roughly 1.5 GB of float16 weights, quantized to int8 at load). Everything after that — capture, transcription, browse, search — is fully offline.

**Measured on this machine (2026-07-06, Apple Silicon / Metal):** a 59-second note transcribes in **2.7 s**; a real 3-second memo lands as a complete note about 3 s after upload, cold start included. The success criterion is ~10 s for a one-minute note. On GPU-less Windows/Linux the CPU engine is slower but still faster than real-time — roughly 25–35 s for a one-minute note on an Apple-Silicon-class CPU. CI proves the CPU path works; it doesn't benchmark speed.

## Using it

Open http://127.0.0.1:8477 in your browser. Everything is one scrolling column — no menus, no router.

**Capture** — click **● Record**, speak, click **Stop**; the note transcribes and appears at the top. Or drag a voice file onto the upload area (or click to pick one). Cancelling a longer take asks first, so you can't lose the only copy by a misclick.

**Keyboard shortcuts** (ignored while you're typing in a field):

| Key | Action |
| --- | --- |
| `R` | Start recording — press again to Stop |
| `Q` | Cancel the recording — a short take discards at once; a longer take asks first |
| `/` | Jump to the search box |
| `Esc` | Step back: clear the search, then leave the field; close an open note; or keep recording when asked to confirm a discard |

**Navigation & actions** — click a note's title to open it; **← Back** (or `Esc`) returns to the list with your search and any in-progress recording intact. Each done note has one-click **Copy** (transcript to clipboard) and **Delete** (moves to the archive's `.trash` with an inline **Undo** — nothing is ever erased). Failed notes show **Retry**. The sun/moon toggle switches light/dark and otherwise follows your system.

## Where notes live

`~/VoiceNotes` by default; override with the `VOICE_NOTES_ARCHIVE` environment variable. Point it at an existing archive and the app just works — the folder is self-describing, and moving it is a non-event (`tests/test_portability.py` proves it).

A note folder looks like:

```text
2026-07-06-114439-e2e-memo/
├── audio.m4a     # the original, byte-for-byte
└── note.md       # frontmatter (captured_at, source, duration, engine/model/params) + transcript + embed
```

Notes are write-once: the app never mutates a stored note. Failed transcriptions stay visible in the UI with a retry button; retrying writes the transcript for the first time.

## Choosing the engine and model

Engine selection is automatic at startup — mlx-whisper on Apple Silicon, faster-whisper everywhere else. Environment variables override it:

| Variable | Meaning | Default |
| --- | --- | --- |
| `VOICE_NOTES_ENGINE` | `auto`, `mlx-whisper`, or `faster-whisper` | `auto` |
| `VOICE_NOTES_MODEL` | Model id/alias for the selected engine | `mlx-community/whisper-large-v3-turbo` (mlx-whisper) / `large-v3-turbo` (faster-whisper) |
| `VOICE_NOTES_HOST` | Bind address | `127.0.0.1` (loopback) |
| `VOICE_NOTES_ARCHIVE` | Archive folder (see "Where notes live") | `~/VoiceNotes` |

A bad engine value — or asking for an engine that isn't installed on this platform — fails at startup with a clear message rather than limping along.

## Docker (optional)

For server or reproducibility use — **not** the way to run this on Windows (Windows runs natively via uv, above). The image is multi-stage, and CI builds and boot-smokes it on every merge to `main`.

The compose file is the preferred way to run it, and it makes the container behave like the native app: the archive is bind-mounted to **`~/VoiceNotes` on the host** — the same folder, same plain-files format as a native install.

```bash
docker compose up -d --build     # or: make docker-up
```

- Notes land in `~/VoiceNotes/<note-folder>/` on the host. Override the location with `VOICE_NOTES_DIR=/path docker compose up -d`.
- The model cache lives in a named volume (`voice-notes-hf-cache`), so the ~1.5 GB first-run download survives container recreation and re-clones. Point `HF_CACHE_DIR` at a host folder to reuse an existing cache.
- Run one instance at a time against a given archive — native **or** container, not both at once.
- On a Linux host the container writes archive files as root; on macOS/Windows (Docker Desktop, OrbStack) bind mounts map to your user.
- On native Windows, run compose from WSL2 or Git Bash (both set `$HOME`) — native PowerShell/CMD don't, so the default archive path resolves incorrectly there. Pass `VOICE_NOTES_DIR` explicitly if you must run compose from PowerShell.

> **The image ships no authentication.** Like the native app it serves every note to anyone who can reach the port — but the container binds `0.0.0.0` internally, so publishing it on all host interfaces would expose your notes to the whole network. The compose file scopes the port to `127.0.0.1` (loopback), matching the native default. To reach it from other machines, front it with an authenticating reverse proxy — do not publish it directly on an untrusted network.

Without compose, the equivalent single-image run:

```bash
docker build -t voice-notes .
docker run -d -p 127.0.0.1:8477:8477 \
  -v ~/VoiceNotes:/data/archive -v voice-notes-hf-cache:/data/hf-cache voice-notes
```

To verify a container by hand: open http://localhost:8477, upload a voice file through the UI, and confirm a **Complete** note lands in `~/VoiceNotes/` on the host.

## Development

```bash
uv run pytest              # backend suite (fast; fake engine)
uv run pytest -m slow      # real-engine integration + latency measurement (model download)
uv run ruff format --check . && uv run ruff check .
uv run pyrefly check       # types
cd frontend && npm test    # UI tests (Vitest + Testing Library)
cd frontend && npm run lint
cd frontend && npm run build
```

Layout: `src/voice_notes/` — `archive.py` (the canonical-archive contract: folders, frontmatter, atomic writes, scanning, search), `transcription.py` (engine seam: `Transcriber` protocol + mlx-whisper and faster-whisper adapters), `worker.py` (serial queue), `ingest.py` (pipeline), `app.py` (FastAPI + static serving + engine selection). `frontend/` — Vite + React + TS. An engine swap is one new adapter behind the `Transcriber` protocol.
