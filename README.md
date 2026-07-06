# voice-notes

Personal, local-first voice notes: record from the mic or upload a voice file (Apple Voice Memos `.m4a`, WhatsApp `.opus`, …), get a transcript within seconds from a **local** model, and keep every note as plain files — immutable original audio plus a markdown transcript — in an archive folder any modern notes tool can open. No cloud, no accounts, no database.

**The archive outlives the app.** Each note is one folder holding the original audio byte-for-byte and a `note.md` (YAML frontmatter with full transcription provenance + transcript + audio embed). The archive opens directly as an Obsidian vault, imports into Notion, and reads in any editor. Delete the app and you lose nothing; better models later can re-transcribe the originals.

## Prerequisites

- macOS on Apple Silicon (transcription runs on Metal via MLX)
- [uv](https://docs.astral.sh/uv/) — manages Python and all backend dependencies
- Node.js LTS — only to build the frontend bundle

No Homebrew ffmpeg needed: a vendored ffmpeg ships with the Python dependencies, and the engine receives decoded audio directly.

## Setup

```bash
# 1. Install backend dependencies (uv provisions Python 3.12 automatically)
uv sync

# 2. Build the frontend (served by the backend afterwards)
cd frontend && npm install && npm run build && cd ..

# 3. Run
uv run voice-notes
```

Open http://127.0.0.1:8477 in Chrome (the v1 target browser). Click **● Record**, speak, click **Stop** — the note lands transcribed, with zero keyboard.

**First transcription only:** the local model (`mlx-community/whisper-large-v3-turbo`, ~1.6 GB) is downloaded once from Hugging Face. Everything after that — capture, transcription, browse, search — is fully offline.

**Measured on this machine (2026-07-06):** a 59-second note transcribes in **2.7 s**; a real 3-second memo lands as a complete note about 3 s after upload, cold start included. The success criterion is ~10 s for a one-minute note.

## Where notes live

`~/VoiceNotes` by default; override with the `VOICE_NOTES_ARCHIVE` environment variable. Point it at an existing archive and the app just works — the folder is self-describing, and moving it is a non-event (`tests/test_portability.py` proves it).

A note folder looks like:

```text
2026-07-06-114439-e2e-memo/
├── audio.m4a     # the original, byte-for-byte
└── note.md       # frontmatter (captured_at, source, duration, engine/model/params) + transcript + embed
```

Notes are write-once: the app never mutates a stored note. Failed transcriptions stay visible in the UI with a retry button; retrying writes the transcript for the first time.

Known playback nuance: Obsidian does not play `.opus` embeds (WhatsApp uploads) — the transcript and metadata still carry the note, and this app's own UI plays them fine. Mic recordings (`.webm`) and Voice Memos (`.m4a`) play in Obsidian.

## Verifying the identity claims

`docs/portability-checklist.md` holds the one-time manual checks (Obsidian vault, Notion import, delete-the-app durability, the AE1 stopwatch) with a result log.

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

Layout: `src/voice_notes/` — `archive.py` (the canonical-archive contract: folders, frontmatter, atomic writes, scanning, search), `transcription.py` (engine seam + mlx-whisper adapter), `worker.py` (serial queue), `ingest.py` (pipeline), `app.py` (FastAPI + static serving). `frontend/` — Vite + React + TS. An engine swap is one new adapter behind the `Transcriber` protocol.
