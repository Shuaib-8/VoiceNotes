"""The canonical archive: note folders, frontmatter, atomic writes, scanning, search.

This module is the product's contract (R7-R11). The disk is the only durable
state; a file's final name asserts its integrity (KTD-2):

- final-name audio + ``note.md``  -> complete note
- final-name audio only           -> incomplete note (failed or in-flight; retryable; never deleted)
- neither (only temp artifacts)   -> transfer garbage, provably empty of user data, swept

The app writes only canonical note files into the archive and tolerates
foreign entries other tools drop in (``.obsidian/``, ``.DS_Store``) — R9.
"""

from __future__ import annotations

import os
import re
import shutil
from datetime import datetime
from enum import StrEnum
from pathlib import Path
from typing import Literal

import yaml
from pydantic import BaseModel, field_validator

NOTE_FILENAME = "note.md"
TEMP_SUFFIX = ".part"
AUDIO_EXTENSIONS = frozenset({".m4a", ".opus", ".webm", ".mp3", ".wav", ".ogg", ".flac", ".aac"})

_NOTE_FOLDER_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}-\d{6}-.+$")
_EMBED_LINE_PATTERN = re.compile(r"^!\[[^\]]*\]\([^)]+\)$")
_TAG_FALLBACK = "upload"
_MAX_TAG_LENGTH = 40


class NoteAlreadyCompleteError(RuntimeError):
    """A note's transcript is written exactly once (R11)."""


class TranscriptionProvenance(BaseModel):
    """Who produced the transcript, so the corpus can be re-derived later (R8)."""

    engine: str
    model: str
    engine_version: str
    params: dict[str, str | int | float | bool]
    transcribed_at: datetime
    language: str | None = None

    @field_validator("transcribed_at")
    @classmethod
    def _require_tz(cls, value: datetime) -> datetime:
        if value.tzinfo is None:
            raise ValueError("transcribed_at must be timezone-aware")
        return value


class NoteFrontmatter(BaseModel):
    """The YAML frontmatter schema for note.md (R8)."""

    captured_at: datetime
    source: Literal["mic", "upload"]
    original_filename: str | None = None
    mime_type: str
    duration_seconds: float
    audio: str
    transcription: TranscriptionProvenance

    @field_validator("captured_at")
    @classmethod
    def _require_tz(cls, value: datetime) -> datetime:
        if value.tzinfo is None:
            raise ValueError("captured_at must be timezone-aware")
        return value


class NoteState(StrEnum):
    COMPLETE = "complete"
    INCOMPLETE = "incomplete"


class ScannedNote(BaseModel):
    note_id: str
    path: Path
    state: NoteState
    audio_filename: str | None = None
    frontmatter: NoteFrontmatter | None = None
    transcript: str | None = None


def sanitize_source_tag(stem: str) -> str:
    """Filename stem -> folder-name-safe tag: lowercase, alnum + dashes, bounded length."""
    lowered = stem.casefold()
    dashed = re.sub(r"[^a-z0-9]+", "-", lowered).strip("-")
    return dashed[:_MAX_TAG_LENGTH].rstrip("-") or _TAG_FALLBACK


def allocate_note_folder(archive_root: Path, captured_at: datetime, source_tag: str) -> Path:
    """Create the note folder named for its local timestamp and source (R7, KTD-7)."""
    base = f"{captured_at:%Y-%m-%d-%H%M%S}-{source_tag}"
    suffix = 1
    while True:
        name = base if suffix == 1 else f"{base}-{suffix}"
        candidate = archive_root / name
        try:
            candidate.mkdir(parents=True, exist_ok=False)
        except FileExistsError:
            suffix += 1
            continue
        return candidate


def temp_path_for(final: Path) -> Path:
    """Dot-prefixed temp sibling: same directory, so the finalizing rename stays atomic."""
    return final.parent / f".{final.name}{TEMP_SUFFIX}"


def finalize_file(temp: Path, final: Path) -> None:
    """fsync then rename: the final name asserts the bytes are complete and durable (KTD-2)."""
    with temp.open("rb+") as handle:
        os.fsync(handle.fileno())
    os.replace(temp, final)


def atomic_write_text(final: Path, text: str) -> None:
    temp = temp_path_for(final)
    with temp.open("w", encoding="utf-8") as handle:
        handle.write(text)
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(temp, final)


def compose_note_md(frontmatter: NoteFrontmatter, transcript: str) -> str:
    """Frontmatter, transcript body, then a standard-markdown audio embed (R8, KTD-8)."""
    front = yaml.safe_dump(frontmatter.model_dump(mode="json"), sort_keys=False, allow_unicode=True)
    label = frontmatter.original_filename or "recording"
    body = transcript.rstrip("\n")
    return f"---\n{front}---\n\n{body}\n\n![{label}]({frontmatter.audio})\n"


def parse_note_md(text: str) -> tuple[NoteFrontmatter, str]:
    """Inverse of compose_note_md: returns the frontmatter model and the transcript body."""
    if not text.startswith("---\n"):
        raise ValueError("note.md must start with YAML frontmatter")
    closing = text.index("\n---\n", 4)
    frontmatter = NoteFrontmatter.model_validate(yaml.safe_load(text[4:closing]))
    body = text[closing + len("\n---\n") :]

    lines = body.split("\n")
    last_content = next((i for i in range(len(lines) - 1, -1, -1) if lines[i].strip()), None)
    if last_content is not None and _EMBED_LINE_PATTERN.match(lines[last_content].strip()):
        lines = lines[:last_content]
    transcript = "\n".join(lines).strip("\n")
    return frontmatter, transcript


def write_note_md(folder: Path, frontmatter: NoteFrontmatter, transcript: str) -> Path:
    """Write the transcript exactly once, atomically; a second write is a contract violation."""
    final = folder / NOTE_FILENAME
    if final.exists():
        raise NoteAlreadyCompleteError(f"{final} already exists; notes are write-once (R11)")
    atomic_write_text(final, compose_note_md(frontmatter, transcript))
    return final


def load_note(folder: Path) -> tuple[NoteFrontmatter, str]:
    return parse_note_md((folder / NOTE_FILENAME).read_text(encoding="utf-8"))


def _find_audio(folder: Path) -> str | None:
    for entry in sorted(folder.iterdir()):
        if (
            entry.is_file()
            and not entry.name.startswith(".")
            and entry.suffix.lower() in AUDIO_EXTENSIONS
        ):
            return entry.name
    return None


def _classify(folder: Path) -> tuple[NoteState | None, str | None]:
    """(state, audio_filename); state None means transfer garbage — no user data inside."""
    audio = _find_audio(folder)
    if (folder / NOTE_FILENAME).is_file():
        return NoteState.COMPLETE, audio
    if audio is not None:
        return NoteState.INCOMPLETE, audio
    return None, None


def scan_archive(archive_root: Path) -> list[ScannedNote]:
    """All notes newest-first (R14), sourced from the folder itself; foreign entries ignored."""
    notes: list[ScannedNote] = []
    folders = sorted(
        (
            entry
            for entry in archive_root.iterdir()
            if entry.is_dir() and not entry.name.startswith(".")
        ),
        key=lambda entry: entry.name,
        reverse=True,
    )
    for folder in folders:
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
    return notes


def sweep_transfer_garbage(archive_root: Path) -> list[Path]:
    """Remove app-created folders holding no user data — never incomplete or foreign folders."""
    removed: list[Path] = []
    for folder in archive_root.iterdir():
        if not folder.is_dir() or not _NOTE_FOLDER_PATTERN.match(folder.name):
            continue
        state, _ = _classify(folder)
        if state is None:
            shutil.rmtree(folder)
            removed.append(folder)
    return removed


def search_notes(archive_root: Path, query: str) -> list[ScannedNote]:
    """Case-insensitive keyword match over transcripts and note names, complete notes only (R16)."""
    needle = query.strip().casefold()
    if not needle:
        return []
    return [
        note
        for note in scan_archive(archive_root)
        if note.state == NoteState.COMPLETE
        and (needle in note.note_id.casefold() or needle in (note.transcript or "").casefold())
    ]
