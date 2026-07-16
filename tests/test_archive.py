"""U2 archive-core tests: the product's contract about bytes on disk (R7-R11, R14, R16, AE6).

Written before the implementation — these encode the archive contract:
folder shape, write-once immutability, foreign-file tolerance, the three-way
folder classification, and move-the-archive portability.
"""

from __future__ import annotations

import re
import shutil
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from pydantic import ValidationError

from voice_notes.archive import (
    NOTE_FILENAME,
    TRASH_DIRNAME,
    NoteAlreadyCompleteError,
    NoteFrontmatter,
    NoteState,
    TranscriptionProvenance,
    allocate_note_folder,
    compose_note_md,
    load_note,
    parse_note_md,
    restore_note_folder,
    sanitize_source_tag,
    scan_archive,
    search_notes,
    sweep_transfer_garbage,
    temp_path_for,
    trash_note_folder,
    write_note_md,
)
from voice_notes.config import ensure_archive_root, resolve_archive_root

LOCAL_TZ = timezone(timedelta(hours=1))
CAPTURED_AT = datetime(2026, 7, 6, 10, 0, 0, tzinfo=LOCAL_TZ)


def make_provenance() -> TranscriptionProvenance:
    return TranscriptionProvenance(
        engine="mlx-whisper",
        model="mlx-community/whisper-large-v3-turbo",
        engine_version="0.4.3",
        params={"word_timestamps": False},
        transcribed_at=datetime(2026, 7, 6, 10, 0, 8, tzinfo=LOCAL_TZ),
        language="en",
    )


def make_cpu_provenance() -> TranscriptionProvenance:
    """The faster-whisper provenance shape: params carry mixed str and int values."""
    return TranscriptionProvenance(
        engine="faster-whisper",
        model="large-v3-turbo",
        engine_version="1.2.1",
        params={"compute_type": "int8", "device": "cpu", "num_workers": 1},
        transcribed_at=datetime(2026, 7, 12, 12, 0, 0, tzinfo=LOCAL_TZ),
        language="en",
    )


def make_frontmatter(
    audio: str = "audio.webm",
    source: str = "mic",
    original_filename: str | None = None,
    captured_at: datetime = CAPTURED_AT,
    transcription: TranscriptionProvenance | None = None,
) -> NoteFrontmatter:
    return NoteFrontmatter(
        captured_at=captured_at,
        source=source,  # type: ignore[arg-type]
        original_filename=original_filename,
        mime_type="audio/webm",
        duration_seconds=4.2,
        audio=audio,
        transcription=transcription if transcription is not None else make_provenance(),
    )


def make_complete_note(
    root: Path,
    transcript: str,
    captured_at: datetime = CAPTURED_AT,
    tag: str = "mic",
    audio: str = "audio.webm",
) -> Path:
    folder = allocate_note_folder(root, captured_at, tag)
    (folder / audio).write_bytes(b"fake-audio-bytes")
    write_note_md(folder, make_frontmatter(audio=audio, captured_at=captured_at), transcript)
    return folder


# --- Naming and collisions (R7) ---


def test_folder_name_carries_timestamp_and_tag(tmp_path: Path) -> None:
    folder = allocate_note_folder(tmp_path, CAPTURED_AT, "mic")
    assert folder.name == "2026-07-06-100000-mic"
    assert folder.is_dir()


def test_same_second_collision_gets_suffix(tmp_path: Path) -> None:
    first = allocate_note_folder(tmp_path, CAPTURED_AT, "mic")
    second = allocate_note_folder(tmp_path, CAPTURED_AT, "mic")
    assert first.name != second.name
    assert second.name == "2026-07-06-100000-mic-2"


def test_sanitize_source_tag() -> None:
    assert sanitize_source_tag("My Voice Memo #7 (final)") == "my-voice-memo-7-final"
    assert sanitize_source_tag("PTT-20260705-WA0001") == "ptt-20260705-wa0001"
    assert len(sanitize_source_tag("x" * 100)) <= 40
    assert sanitize_source_tag("???") == "upload"
    assert sanitize_source_tag("") == "upload"


# --- Windows-legal folder names (AE6, R8) ---

_WINDOWS_RESERVED_DEVICE_NAMES = frozenset(
    {"con", "prn", "aux", "nul"}
    | {f"com{digit}" for digit in range(1, 10)}
    | {f"lpt{digit}" for digit in range(1, 10)}
)


def assert_windows_legal_note_folder_name(name: str) -> None:
    """Strict test-local oracle: NTFS/FAT-legal charset behind the timestamp prefix,
    no trailing dot/space/dash, no reserved device name, and the app's own pattern."""
    from voice_notes.archive import _NOTE_FOLDER_PATTERN

    assert re.fullmatch(r"\d{4}-\d{2}-\d{2}-\d{6}-[a-z0-9-]+", name), name
    assert not name.endswith((".", " ", "-")), name
    assert name.casefold() not in _WINDOWS_RESERVED_DEVICE_NAMES, name
    assert _NOTE_FOLDER_PATTERN.match(name), name


WINDOWS_HOSTILE_STEMS = (
    'meeting: notes "final" <v2>',  # : " < > are illegal in Windows filenames
    "pipes|question?stars*",  # | ? *
    "control\x00\x01\x1fchars\tand\nnewlines",  # control characters
    "back\\slash/and/forward",  # both separator kinds
    "trailing dots...",  # Windows strips trailing dots on create
    "trailing spaces   ",  # ...and trailing spaces
    " .mixed trailing junk. . ",
)


def test_windows_hostile_stems_produce_legal_folder_names(tmp_path: Path) -> None:
    """Covers AE6/R8: every Windows-illegal character class, end-to-end through
    sanitize_source_tag -> allocate_note_folder, lands on a legal non-empty name."""
    for index, stem in enumerate(WINDOWS_HOSTILE_STEMS):
        folder = allocate_note_folder(
            tmp_path, CAPTURED_AT + timedelta(seconds=index), sanitize_source_tag(stem)
        )
        assert folder.is_dir()
        assert_windows_legal_note_folder_name(folder.name)


def test_all_symbol_stems_fall_back_to_a_neutral_tag(tmp_path: Path) -> None:
    """A stem that sanitizes to nothing must not compose a name ending in '-' (which
    Windows would take but the folder pattern refuses); the sanitizer's fallback tag
    is the single generation choke point that prevents it."""
    for index, stem in enumerate(("", "???", "***", "....", '\\/:*?"<>|')):
        assert sanitize_source_tag(stem) == "upload"
        folder = allocate_note_folder(
            tmp_path, CAPTURED_AT + timedelta(seconds=index), sanitize_source_tag(stem)
        )
        assert_windows_legal_note_folder_name(folder.name)


def test_long_stems_respect_the_tag_bound_and_stay_legal(tmp_path: Path) -> None:
    from voice_notes.archive import _MAX_TAG_LENGTH

    plain = sanitize_source_tag("x" * 100)
    assert len(plain) == _MAX_TAG_LENGTH

    # Truncation landing exactly on a dash must not leave a trailing dash behind.
    dash_at_boundary = sanitize_source_tag("a" * (_MAX_TAG_LENGTH - 1) + " " + "b" * 20)
    assert len(dash_at_boundary) <= _MAX_TAG_LENGTH
    assert not dash_at_boundary.endswith("-")

    for index, tag in enumerate((plain, dash_at_boundary)):
        folder = allocate_note_folder(tmp_path, CAPTURED_AT + timedelta(seconds=index), tag)
        assert_windows_legal_note_folder_name(folder.name)


def test_same_second_collision_suffixes_stay_windows_legal(tmp_path: Path) -> None:
    tag = sanitize_source_tag('meeting: "notes"')
    names = [allocate_note_folder(tmp_path, CAPTURED_AT, tag).name for _ in range(3)]
    assert len(set(names)) == 3
    for name in names:
        assert_windows_legal_note_folder_name(name)


def test_reserved_device_stems_never_compose_a_reserved_name(tmp_path: Path) -> None:
    """CON/NUL/COM1... are illegal as a whole filename on Windows (with or without an
    extension); the timestamp prefix defeats them by construction — pin that."""
    for index, stem in enumerate(("CON", "con.txt", "NUL", "PRN", "AUX", "COM1", "LPT9")):
        folder = allocate_note_folder(
            tmp_path, CAPTURED_AT + timedelta(seconds=index), sanitize_source_tag(stem)
        )
        assert folder.name.casefold() not in _WINDOWS_RESERVED_DEVICE_NAMES
        assert_windows_legal_note_folder_name(folder.name)


# --- Frontmatter (R8) ---


def test_frontmatter_requires_timezone_aware_timestamps() -> None:
    with pytest.raises(ValidationError):
        make_frontmatter(captured_at=datetime(2026, 7, 6, 10, 0, 0))


def test_frontmatter_round_trips_through_note_md() -> None:
    frontmatter = make_frontmatter(original_filename="PTT-20260705.opus", source="upload")
    text = compose_note_md(frontmatter, "remember to call the landlord about the deposit")
    parsed, transcript = parse_note_md(text)
    assert parsed == frontmatter
    assert parsed.captured_at.tzinfo is not None
    assert transcript == "remember to call the landlord about the deposit"


def test_faster_whisper_provenance_round_trips_through_note_md() -> None:
    """R7: a faster-whisper note is self-describing on disk. Its provenance params mix str
    and int (num_workers is an int), so this pins that the mixed-type dict survives the YAML
    frontmatter round trip — a mixed-engine archive stays readable on any platform."""
    frontmatter = make_frontmatter(transcription=make_cpu_provenance())
    parsed, transcript = parse_note_md(compose_note_md(frontmatter, "call the landlord"))
    assert parsed == frontmatter
    assert parsed.transcription.engine == "faster-whisper"
    assert parsed.transcription.params["num_workers"] == 1
    assert isinstance(parsed.transcription.params["num_workers"], int)
    assert transcript == "call the landlord"


def test_multiline_and_empty_transcripts_round_trip() -> None:
    frontmatter = make_frontmatter()
    multiline = "first thought\n\nsecond thought"
    _, transcript = parse_note_md(compose_note_md(frontmatter, multiline))
    assert transcript == multiline
    _, empty = parse_note_md(compose_note_md(frontmatter, ""))
    assert empty == ""


def test_note_md_embeds_audio_with_standard_markdown() -> None:
    text = compose_note_md(make_frontmatter(audio="audio.webm"), "hello")
    assert "![recording](audio.webm)" in text
    assert text.startswith("---\n")


# --- Write-once and atomicity (R11, KTD-2) ---


def test_note_md_is_write_once(tmp_path: Path) -> None:
    folder = make_complete_note(tmp_path, "original transcript")
    with pytest.raises(NoteAlreadyCompleteError):
        write_note_md(folder, make_frontmatter(), "rewritten transcript")
    _, transcript = load_note(folder)
    assert transcript == "original transcript"


def test_write_leaves_no_temp_artifacts(tmp_path: Path) -> None:
    folder = make_complete_note(tmp_path, "clean write")
    leftovers = [p.name for p in folder.iterdir() if p.name.endswith(".part")]
    assert leftovers == []


def test_temp_path_is_dot_prefixed_sibling(tmp_path: Path) -> None:
    final = tmp_path / "audio.webm"
    temp = temp_path_for(final)
    assert temp.parent == final.parent
    assert temp.name.startswith(".")
    assert temp.name.endswith(".part")


# --- Scanner classification (R9, R14, KTD-2) ---


def test_scanner_classifies_complete_and_incomplete(tmp_path: Path) -> None:
    make_complete_note(tmp_path, "done note")
    incomplete = allocate_note_folder(tmp_path, CAPTURED_AT + timedelta(seconds=5), "mic")
    (incomplete / "audio.webm").write_bytes(b"audio-without-transcript")

    notes = scan_archive(tmp_path)
    states = {note.note_id: note.state for note in notes}
    assert states[incomplete.name] == NoteState.INCOMPLETE
    assert sum(1 for note in notes if note.state == NoteState.COMPLETE) == 1


def test_scanner_ignores_foreign_files_and_dirs(tmp_path: Path) -> None:
    make_complete_note(tmp_path, "the only real note")
    (tmp_path / ".DS_Store").write_bytes(b"\x00")
    (tmp_path / ".obsidian").mkdir()
    (tmp_path / ".obsidian" / "app.json").write_text("{}", encoding="utf-8")
    (tmp_path / "loose-file.txt").write_text("not a note", encoding="utf-8")

    notes = scan_archive(tmp_path)
    assert len(notes) == 1
    assert notes[0].state == NoteState.COMPLETE


def test_stray_temp_file_does_not_change_classification(tmp_path: Path) -> None:
    folder = make_complete_note(tmp_path, "still complete")
    (folder / ".note.md.part").write_text("simulated crash leftover", encoding="utf-8")
    notes = scan_archive(tmp_path)
    assert notes[0].state == NoteState.COMPLETE


def test_newest_first_across_day_boundary(tmp_path: Path) -> None:
    older = make_complete_note(
        tmp_path, "yesterday", captured_at=datetime(2026, 7, 5, 23, 59, 59, tzinfo=LOCAL_TZ)
    )
    newer = make_complete_note(
        tmp_path, "today", captured_at=datetime(2026, 7, 6, 0, 0, 1, tzinfo=LOCAL_TZ)
    )
    notes = scan_archive(tmp_path)
    assert [note.note_id for note in notes] == [newer.name, older.name]


# --- Transfer garbage vs incomplete (KTD-2) ---


def test_garbage_folder_is_excluded_and_swept(tmp_path: Path) -> None:
    garbage = allocate_note_folder(tmp_path, CAPTURED_AT, "mic")
    (garbage / ".audio.webm.part").write_bytes(b"truncated transfer")

    assert all(note.note_id != garbage.name for note in scan_archive(tmp_path))
    removed = sweep_transfer_garbage(tmp_path)
    assert garbage in removed
    assert not garbage.exists()


def test_audio_only_folder_is_never_swept(tmp_path: Path) -> None:
    incomplete = allocate_note_folder(tmp_path, CAPTURED_AT, "mic")
    (incomplete / "audio.webm").write_bytes(b"real audio, failed transcription")
    assert sweep_transfer_garbage(tmp_path) == []
    assert incomplete.exists()


def test_foreign_folders_are_never_swept(tmp_path: Path) -> None:
    foreign = tmp_path / "templates"
    foreign.mkdir()
    dot_foreign = tmp_path / ".obsidian"
    dot_foreign.mkdir()
    assert sweep_transfer_garbage(tmp_path) == []
    assert foreign.exists()
    assert dot_foreign.exists()


# --- Search (R16, AE5) ---


def test_search_matches_transcript_case_insensitively(tmp_path: Path) -> None:
    make_complete_note(tmp_path, "remember the DEPOSIT for the landlord")
    make_complete_note(
        tmp_path, "unrelated groceries list", captured_at=CAPTURED_AT + timedelta(minutes=1)
    )
    hits = search_notes(tmp_path, "deposit")
    assert len(hits) == 1
    assert "deposit" in (hits[0].transcript or "").casefold()


def test_search_matches_folder_name(tmp_path: Path) -> None:
    make_complete_note(tmp_path, "irrelevant words", tag="landlord-call")
    hits = search_notes(tmp_path, "landlord")
    assert len(hits) == 1


def test_search_excludes_incomplete_notes_and_misses(tmp_path: Path) -> None:
    incomplete = allocate_note_folder(tmp_path, CAPTURED_AT, "mic")
    (incomplete / "audio.webm").write_bytes(b"audio")
    assert search_notes(tmp_path, "anything") == []
    make_complete_note(tmp_path, "hello world", captured_at=CAPTURED_AT + timedelta(minutes=2))
    assert search_notes(tmp_path, "no-such-term") == []


# --- Archive location and portability (R10, AE6) ---


def test_resolve_archive_root_env_override_and_default() -> None:
    assert resolve_archive_root({"VOICE_NOTES_ARCHIVE": "/tmp/custom-archive"}) == Path(
        "/tmp/custom-archive"
    )
    assert resolve_archive_root({}) == Path.home() / "VoiceNotes"


def test_ensure_archive_root_creates_directory(tmp_path: Path) -> None:
    target = tmp_path / "nested" / "archive"
    root = ensure_archive_root({"VOICE_NOTES_ARCHIVE": str(target)})
    assert root == target
    assert root.is_dir()


def test_moved_archive_lists_opens_and_searches(tmp_path: Path) -> None:
    """Covers AE6: point the module at a moved folder — everything works, no migration."""
    original = tmp_path / "original-location"
    original.mkdir()
    make_complete_note(original, "note about the deposit")
    make_complete_note(
        original, "note about groceries", captured_at=CAPTURED_AT + timedelta(minutes=1)
    )

    moved = tmp_path / "synced" / "new-location"
    moved.parent.mkdir()
    shutil.move(str(original), str(moved))

    notes = scan_archive(moved)
    assert len(notes) == 2
    assert all(note.state == NoteState.COMPLETE for note in notes)
    frontmatter, transcript = load_note(notes[-1].path)
    assert transcript == "note about the deposit"
    assert frontmatter.audio == "audio.webm"
    assert len(search_notes(moved, "deposit")) == 1


def test_note_folder_contains_only_canonical_files(tmp_path: Path) -> None:
    folder = make_complete_note(tmp_path, "canonical shape")
    names = sorted(p.name for p in folder.iterdir())
    assert names == ["audio.webm", NOTE_FILENAME]


# --- Delete is trash, never erase ---


def test_trash_note_folder_moves_folder_intact(tmp_path: Path) -> None:
    folder = make_complete_note(tmp_path, "note to remove")
    audio_bytes = (folder / "audio.webm").read_bytes()

    destination = trash_note_folder(tmp_path, folder.name)

    assert not folder.exists()
    assert destination == tmp_path / TRASH_DIRNAME / folder.name
    assert (destination / "audio.webm").read_bytes() == audio_bytes
    assert (destination / NOTE_FILENAME).is_file()


def test_trash_collision_keeps_both_copies(tmp_path: Path) -> None:
    folder = make_complete_note(tmp_path, "first delete")
    name = folder.name
    first = trash_note_folder(tmp_path, name)

    rebuilt = tmp_path / name
    rebuilt.mkdir()
    (rebuilt / "audio.webm").write_bytes(b"second copy")
    second = trash_note_folder(tmp_path, name)

    assert first.is_dir()
    assert second.is_dir()
    assert second.name == f"{name}-2"


def test_trash_rejects_unknown_and_foreign_names(tmp_path: Path) -> None:
    with pytest.raises(KeyError):
        trash_note_folder(tmp_path, "2026-07-06-101112-mic")  # nothing on disk

    foreign = tmp_path / ".obsidian"
    foreign.mkdir()
    with pytest.raises(KeyError):
        trash_note_folder(tmp_path, ".obsidian")  # not a note folder
    with pytest.raises(KeyError):
        trash_note_folder(tmp_path, "../outside")  # never leaves the archive
    assert foreign.is_dir()


def test_trashed_notes_leave_scan_and_survive_sweep(tmp_path: Path) -> None:
    folder = make_complete_note(tmp_path, "goes to trash")
    trash_note_folder(tmp_path, folder.name)

    assert scan_archive(tmp_path) == []
    assert sweep_transfer_garbage(tmp_path) == []
    assert (tmp_path / TRASH_DIRNAME / folder.name).is_dir()


def test_restore_brings_a_trashed_note_back_intact(tmp_path: Path) -> None:
    folder = make_complete_note(tmp_path, "second thoughts")
    audio_bytes = (folder / "audio.webm").read_bytes()
    trash_note_folder(tmp_path, folder.name)

    restored = restore_note_folder(tmp_path, folder.name)

    assert restored == folder
    assert (restored / "audio.webm").read_bytes() == audio_bytes
    assert not (tmp_path / TRASH_DIRNAME / folder.name).exists()
    assert len(scan_archive(tmp_path)) == 1  # visible to the app again


def test_restore_rejects_unknown_and_foreign_names(tmp_path: Path) -> None:
    with pytest.raises(KeyError):
        restore_note_folder(tmp_path, "2026-07-06-101112-mic")  # nothing in trash
    with pytest.raises(KeyError):
        restore_note_folder(tmp_path, "../outside")  # never leaves the archive


def test_restore_never_overwrites_a_live_note(tmp_path: Path) -> None:
    folder = make_complete_note(tmp_path, "original")
    name = folder.name
    trash_note_folder(tmp_path, name)
    rebuilt = tmp_path / name
    rebuilt.mkdir()

    with pytest.raises(FileExistsError):
        restore_note_folder(tmp_path, name)
    assert (tmp_path / TRASH_DIRNAME / name).is_dir()  # trash copy untouched


def test_folder_pattern_refuses_path_separators(tmp_path: Path) -> None:
    """The id pattern is the first guard against traversal: a separator must never match,
    so a resolved note dir is always a single component under the archive (never ``a/../b``)."""
    from voice_notes.archive import _NOTE_FOLDER_PATTERN

    assert _NOTE_FOLDER_PATTERN.match("2026-07-06-101112-mic") is not None
    assert _NOTE_FOLDER_PATTERN.match("2026-07-06-101112-my-upload-2") is not None
    assert _NOTE_FOLDER_PATTERN.match("2026-07-06-101112-a/b") is None
    assert _NOTE_FOLDER_PATTERN.match("2026-07-06-101112-a\\b") is None

    # The rename endpoints reject a separator-bearing id outright, never touching disk.
    with pytest.raises(KeyError):
        trash_note_folder(tmp_path, "2026-07-06-101112-a/../evil")
    with pytest.raises(KeyError):
        restore_note_folder(tmp_path, "2026-07-06-101112-a/../evil")


def test_scan_skips_a_folder_removed_mid_scan(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A concurrent delete/restore renames a folder away between the directory listing and
    the per-folder read; the scan skips the vanished entry instead of failing the listing."""
    from voice_notes import archive

    kept = make_complete_note(tmp_path, "still here", tag="kept")
    make_complete_note(tmp_path, "being deleted", tag="racing")

    real_classify = archive._classify
    visited: list[str] = []

    def flaky_classify(folder: Path) -> tuple[NoteState | None, str | None]:
        visited.append(folder.name)
        if folder.name.endswith("-racing"):
            raise FileNotFoundError(folder)  # folder moved into .trash mid-scan
        return real_classify(folder)

    monkeypatch.setattr(archive, "_classify", flaky_classify)

    notes = scan_archive(tmp_path)

    assert [note.note_id for note in notes] == [kept.name]
    assert len(visited) == 2  # both were visited; only the racing folder vanished
