"""Ingest pipeline: land original bytes durably, queue transcription, complete the note.

The flow implements KTD-2 end to end: bytes stream to a dot-temp name and are
fsynced + renamed only on clean end-of-stream, so audio at its final name is
always a complete original; ``note.md`` is written exactly once on success;
startup recovery marks orphaned audio-only folders failed (retryable, never
auto-requeued) and sweeps transfer garbage.
"""

from __future__ import annotations

import mimetypes
import os
import re
import tempfile
from datetime import datetime
from pathlib import Path
from typing import BinaryIO, Literal

from pydantic import BaseModel, Field

from voice_notes.archive import (
    AUDIO_EXTENSIONS,
    NoteAlreadyCompleteError,
    NoteFrontmatter,
    NoteState,
    ScannedNote,
    allocate_note_folder,
    normalize_query,
    restore_note_folder,
    sanitize_source_tag,
    scan_archive,
    search_notes,
    sweep_transfer_garbage,
    temp_path_for,
    trash_note_folder,
)
from voice_notes.archive import (
    write_note_md as archive_write_note_md,
)
from voice_notes.transcription import Transcriber, normalize_to_wav, wav_duration_seconds
from voice_notes.worker import JobRecord, JobStatus, TranscriptionWorker

MAX_UPLOAD_BYTES = 200 * 1024 * 1024
STREAM_CHUNK_BYTES = 1024 * 1024

MIME_TO_EXTENSION = {
    "audio/webm": ".webm",
    "audio/mp4": ".m4a",
    "audio/mpeg": ".mp3",
    "audio/ogg": ".ogg",
    "audio/opus": ".opus",
    "audio/wav": ".wav",
    "audio/x-wav": ".wav",
    "audio/flac": ".flac",
    "audio/aac": ".aac",
}


class UnsupportedFormatError(ValueError):
    """The file/recording type is outside the accepted audio formats (R2)."""


class FileTooLargeError(ValueError):
    """The stream exceeded MAX_UPLOAD_BYTES."""


class RetryNotAllowedError(RuntimeError):
    """Retry is only valid for a failed, incomplete note."""


class DeleteNotAllowedError(RuntimeError):
    """Delete is blocked while the note is queued or transcribing."""


NoteStatus = Literal["processing", "failed", "done"]


class NoteSummary(BaseModel):
    id: str
    status: NoteStatus
    title: str
    captured_at: datetime | None = None
    duration_seconds: float | None = None
    error: str | None = None
    has_audio: bool = False
    match_snippet: str | None = Field(
        default=None,
        description="Set only on /api/search results: the transcript line the query matched.",
    )


class NoteDetail(NoteSummary):
    transcript: str | None = None
    source: str | None = None
    original_filename: str | None = None
    mime_type: str | None = None
    transcription_model: str | None = None


def _supported_formats_message() -> str:
    formats = ", ".join(sorted(AUDIO_EXTENSIONS))
    return f"unsupported file type; accepted formats: {formats}"


_SNIPPET_RADIUS = 45


def _match_snippet(transcript: str, needle: str) -> str | None:
    """The fragment around the first match — recall shows the line you half-remember.

    Returns None when the query matched the folder name rather than the words.
    """
    if not needle:
        return None
    index = transcript.casefold().find(needle)
    if index < 0:
        return None
    start = max(0, index - _SNIPPET_RADIUS)
    end = min(len(transcript), index + len(needle) + _SNIPPET_RADIUS)
    prefix = "…" if start > 0 else ""
    suffix = "…" if end < len(transcript) else ""
    return f"{prefix}{transcript[start:end].strip()}{suffix}"


_TITLE_MAX = 80
_TITLE_MIN_CLAUSE = 20  # "Ok." must not become a whole note's title


def _clause_trim(line: str) -> str:
    """Titles read like phrases: end at the first sentence, never cut mid-word.

    The lookahead keeps decimals ("21.5 degrees") from ending a title early.
    """
    for match in re.finditer(r"[.!?](?=\s|$)", line[: _TITLE_MAX + 1]):
        if match.start() >= _TITLE_MIN_CLAUSE:
            return line[: match.start()]
    if len(line) <= _TITLE_MAX:
        return line
    head = line[:_TITLE_MAX]
    cut = max(head.rfind(char) for char in ",;:—")
    if cut < _TITLE_MIN_CLAUSE:
        cut = head.rfind(" ")
    if cut < _TITLE_MIN_CLAUSE:
        cut = _TITLE_MAX
    return head[:cut].rstrip(" ,;:—") + "…"


def _first_line_title(transcript: str, captured_at: datetime) -> str:
    for line in transcript.splitlines():
        stripped = line.strip()
        if stripped:
            return _clause_trim(stripped)
    return f"{captured_at:%Y-%m-%d %H:%M}"


def _captured_at_from_note_id(note_id: str) -> datetime | None:
    try:
        naive = datetime.strptime(note_id[:17], "%Y-%m-%d-%H%M%S")
    except ValueError:
        return None
    return naive.replace(tzinfo=datetime.now().astimezone().tzinfo)


class IngestService:
    """One ingest path for both capture sources (R3), plus the read-side queries."""

    def __init__(
        self, archive_root: Path, worker: TranscriptionWorker, transcriber: Transcriber
    ) -> None:
        self.archive_root = archive_root
        self.worker = worker
        self.transcriber = transcriber

    # --- Write side ---

    def ingest(
        self,
        *,
        source: Literal["mic", "upload"],
        stream: BinaryIO,
        original_filename: str | None = None,
        mime_type: str | None = None,
    ) -> str:
        captured_at = datetime.now().astimezone()
        base_mime = (mime_type or "").split(";")[0].strip().lower() or None

        if source == "upload":
            if original_filename is None:
                raise UnsupportedFormatError(_supported_formats_message())
            suffix = Path(original_filename).suffix.lower()
            if suffix not in AUDIO_EXTENSIONS:
                raise UnsupportedFormatError(_supported_formats_message())
            tag = sanitize_source_tag(Path(original_filename).stem)
        else:
            suffix = MIME_TO_EXTENSION.get(base_mime or "")
            if suffix is None:
                raise UnsupportedFormatError(
                    f"unsupported recording type {mime_type!r}; the recorder must produce one of "
                    f"{sorted(MIME_TO_EXTENSION)}"
                )
            tag = "mic"

        folder = allocate_note_folder(self.archive_root, captured_at, tag)
        final = folder / f"audio{suffix}"
        self._stream_to_final(stream, final)

        stored_mime = base_mime or mimetypes.guess_type(final.name)[0] or "application/octet-stream"
        self._enqueue(
            folder=folder,
            audio=final,
            captured_at=captured_at,
            source=source,
            original_filename=original_filename if source == "upload" else None,
            mime_type=stored_mime,
        )
        return folder.name

    def _stream_to_final(self, stream: BinaryIO, final: Path) -> None:
        """KTD-2: temp name while in flight; fsync + rename only on clean end-of-stream."""
        temp = temp_path_for(final)
        received = 0
        try:
            with temp.open("wb") as out:
                while chunk := stream.read(STREAM_CHUNK_BYTES):
                    received += len(chunk)
                    if received > MAX_UPLOAD_BYTES:
                        raise FileTooLargeError(
                            f"stream exceeded {MAX_UPLOAD_BYTES // (1024 * 1024)} MB"
                        )
                    out.write(chunk)
                out.flush()
                os.fsync(out.fileno())
            os.replace(temp, final)
        except Exception:
            # The transfer never completed: the sender still holds the only real copy,
            # so these bytes are provably not user data. Leave nothing behind.
            temp.unlink(missing_ok=True)
            try:
                final.parent.rmdir()
            except OSError:
                pass  # non-empty (another writer) — the startup sweep is the backstop
            raise

    def _enqueue(
        self,
        *,
        folder: Path,
        audio: Path,
        captured_at: datetime,
        source: Literal["mic", "upload"],
        original_filename: str | None,
        mime_type: str,
    ) -> None:
        def job() -> None:
            with tempfile.TemporaryDirectory(prefix="voice-notes-") as scratch:
                wav = Path(scratch) / "normalized.wav"
                normalize_to_wav(audio, wav)
                duration = wav_duration_seconds(wav)
                result = self.transcriber.transcribe(wav)
            frontmatter = NoteFrontmatter(
                captured_at=captured_at,
                source=source,
                original_filename=original_filename,
                mime_type=mime_type,
                duration_seconds=round(duration, 2),
                audio=audio.name,
                transcription=result.provenance,
            )
            archive_write_note_md(folder, frontmatter, result.text)

        self.worker.submit(folder.name, job)

    @staticmethod
    def _record_in_flight(record: JobRecord | None) -> bool:
        """A job is in flight while it is queued or running — the one predicate that
        defines 'processing' for both the guard rails and the status a note reports."""
        return record is not None and record.status in (JobStatus.QUEUED, JobStatus.TRANSCRIBING)

    def _in_flight(self, note_id: str) -> bool:
        """True while the note's transcription job is queued or running — the window in
        which retry and delete are both refused."""
        return self._record_in_flight(self.worker.status_of(note_id))

    def retry(self, note_id: str) -> None:
        """Re-run transcription for a failed note; its note.md write is still a first write."""
        folder = self.archive_root / note_id
        if not folder.is_dir():
            raise KeyError(note_id)
        if (folder / "note.md").exists():
            raise NoteAlreadyCompleteError(note_id)
        if self._in_flight(note_id):
            raise RetryNotAllowedError(f"{note_id} is already being transcribed")

        scanned = next((n for n in scan_archive(self.archive_root) if n.note_id == note_id), None)
        if scanned is None or scanned.audio_filename is None:
            raise KeyError(note_id)

        audio = folder / scanned.audio_filename
        captured_at = _captured_at_from_note_id(note_id) or datetime.now().astimezone()
        # In-memory metadata is gone after a restart; reconstruct what the folder name
        # and audio extension preserve (the sanitized stem stands in for the original name).
        source: Literal["mic", "upload"] = "mic" if note_id.endswith("-mic") else "upload"
        tag = note_id[18:] if len(note_id) > 18 else note_id
        original_filename = f"{tag}{audio.suffix}" if source == "upload" else None
        mime_type = mimetypes.guess_type(audio.name)[0] or "application/octet-stream"
        self._enqueue(
            folder=folder,
            audio=audio,
            captured_at=captured_at,
            source=source,
            original_filename=original_filename,
            mime_type=mime_type,
        )

    def delete(self, note_id: str) -> None:
        """Move a note to the archive's .trash; blocked only while its job is in flight."""
        if self._in_flight(note_id):
            raise DeleteNotAllowedError(
                f"{note_id} is still being transcribed; wait for it to finish"
            )
        trash_note_folder(self.archive_root, note_id)

    def restore(self, note_id: str) -> None:
        """Undo a delete: move the note back out of the archive's .trash."""
        restore_note_folder(self.archive_root, note_id)

    def recover_at_startup(self) -> None:
        """Sweep transfer garbage; mark orphaned incomplete notes failed — visible, retryable."""
        sweep_transfer_garbage(self.archive_root)
        for note in scan_archive(self.archive_root):
            if note.state == NoteState.INCOMPLETE and self.worker.status_of(note.note_id) is None:
                self.worker.mark_failed(note.note_id, "interrupted before transcription completed")

    # --- Read side ---

    def list_notes(self) -> list[NoteSummary]:
        return [self._summarize(note) for note in scan_archive(self.archive_root)]

    def search(self, query: str) -> list[NoteSummary]:
        needle = normalize_query(query)
        results: list[NoteSummary] = []
        for note in search_notes(self.archive_root, query):
            summary = self._summarize(note)
            summary.match_snippet = _match_snippet(note.transcript or "", needle)
            results.append(summary)
        return results

    def get_note(self, note_id: str) -> NoteDetail | None:
        scanned = next((n for n in scan_archive(self.archive_root) if n.note_id == note_id), None)
        if scanned is None:
            return None
        summary = self._summarize(scanned)
        detail = NoteDetail(**summary.model_dump())
        if scanned.state == NoteState.COMPLETE and scanned.frontmatter is not None:
            frontmatter, transcript = scanned.frontmatter, scanned.transcript
            detail.transcript = transcript
            detail.source = frontmatter.source
            detail.original_filename = frontmatter.original_filename
            detail.mime_type = frontmatter.mime_type
            detail.transcription_model = frontmatter.transcription.model
        return detail

    def audio_path(self, note_id: str) -> Path | None:
        scanned = next((n for n in scan_archive(self.archive_root) if n.note_id == note_id), None)
        if scanned is None or scanned.audio_filename is None:
            return None
        return scanned.path / scanned.audio_filename

    def _summarize(self, note: ScannedNote) -> NoteSummary:
        if note.state == NoteState.COMPLETE:
            if note.frontmatter is not None:
                captured_at = note.frontmatter.captured_at
                title = _first_line_title(note.transcript or "", captured_at)
                duration: float | None = note.frontmatter.duration_seconds
            else:  # foreign-edited note.md we tolerate but cannot parse
                captured_at = _captured_at_from_note_id(note.note_id)
                title = note.note_id
                duration = None
            return NoteSummary(
                id=note.note_id,
                status="done",
                title=title,
                captured_at=captured_at,
                duration_seconds=duration,
                has_audio=note.audio_filename is not None,
            )

        record = self.worker.status_of(note.note_id)
        live = self._record_in_flight(record)
        captured_at = _captured_at_from_note_id(note.note_id)
        return NoteSummary(
            id=note.note_id,
            status="processing" if live else "failed",
            title=f"{captured_at:%Y-%m-%d %H:%M}" if captured_at else note.note_id,
            captured_at=captured_at,
            error=record.error
            if record is not None
            else "interrupted before transcription completed",
            has_audio=note.audio_filename is not None,
        )
