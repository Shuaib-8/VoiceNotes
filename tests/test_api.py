"""U4 tests: ingest pipeline + HTTP API with a fake engine (AE2, AE4, AE5 + failure paths)."""

from __future__ import annotations

import hashlib
import time
from collections.abc import Callable, Iterator
from contextlib import ExitStack
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import voice_notes.ingest as ingest_module
from fakes import FakeTranscriber
from voice_notes.app import create_app
from voice_notes.config import Settings
from voice_notes.ingest import IngestService
from voice_notes.transcription import Transcriber
from voice_notes.worker import TranscriptionWorker

ClientFactory = Callable[..., TestClient]


@pytest.fixture
def make_client(tmp_path: Path) -> Iterator[ClientFactory]:
    stack = ExitStack()

    def factory(transcriber: Transcriber, archive: Path | None = None) -> TestClient:
        settings = Settings(
            archive_root=archive if archive is not None else tmp_path / "archive",
            frontend_dist=tmp_path / "no-dist",
        )
        return stack.enter_context(TestClient(create_app(settings, transcriber=transcriber)))

    yield factory
    stack.close()


def wait_for_status(
    client: TestClient, note_id: str, wanted: str, timeout: float = 5.0
) -> dict[str, object]:
    deadline = time.monotonic() + timeout
    payload: dict[str, object] = {}
    while time.monotonic() < deadline:
        response = client.get(f"/api/notes/{note_id}")
        if response.status_code == 200:
            payload = response.json()
            if payload["status"] == wanted:
                return payload
        time.sleep(0.02)
    raise AssertionError(f"note {note_id} never reached {wanted!r}; last: {payload}")


# --- Upload path (AE2) ---


def test_upload_stores_byte_identical_original_with_provenance(
    make_client: ClientFactory, fixtures_dir: Path, tmp_path: Path
) -> None:
    original = (fixtures_dir / "spoken.opus").read_bytes()
    client = make_client(FakeTranscriber(text="remember the deposit"))

    response = client.post(
        "/api/notes", files={"file": ("PTT-20260705.opus", original, "audio/ogg")}
    )
    assert response.status_code == 201
    note_id = response.json()["id"]

    detail = wait_for_status(client, note_id, "done")
    assert detail["source"] == "upload"
    assert detail["original_filename"] == "PTT-20260705.opus"
    assert detail["transcript"] == "remember the deposit"

    stored = tmp_path / "archive" / note_id / "audio.opus"
    assert hashlib.sha256(stored.read_bytes()).hexdigest() == hashlib.sha256(original).hexdigest()
    assert (tmp_path / "archive" / note_id / "note.md").is_file()


def test_upload_rejects_unsupported_type_with_named_formats(
    make_client: ClientFactory, tmp_path: Path
) -> None:
    client = make_client(FakeTranscriber())
    response = client.post("/api/notes", files={"file": ("notes.txt", b"words", "text/plain")})
    assert response.status_code == 415
    assert ".m4a" in response.json()["detail"]
    archive = tmp_path / "archive"
    assert [p for p in archive.iterdir() if p.is_dir()] == []


def test_oversized_stream_rejected_and_leaves_nothing(
    make_client: ClientFactory, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(ingest_module, "MAX_UPLOAD_BYTES", 10)
    client = make_client(FakeTranscriber())
    response = client.post("/api/notes", files={"file": ("big.wav", b"x" * 64, "audio/wav")})
    assert response.status_code == 413
    archive = tmp_path / "archive"
    assert [p for p in archive.iterdir() if p.is_dir()] == []


def test_interrupted_stream_leaves_no_final_audio(tmp_path: Path) -> None:
    """KTD-2 at the service seam: a transfer that dies mid-stream leaves nothing behind."""

    class ExplodingStream:
        def __init__(self) -> None:
            self.calls = 0

        def read(self, size: int = -1) -> bytes:
            self.calls += 1
            if self.calls > 1:
                raise OSError("client disconnected")
            return b"first chunk"

    worker = TranscriptionWorker()
    worker.start()
    archive = tmp_path / "archive"
    archive.mkdir()
    service = IngestService(archive, worker, FakeTranscriber())
    try:
        with pytest.raises(OSError, match="client disconnected"):
            service.ingest(
                source="upload",
                stream=ExplodingStream(),  # type: ignore[arg-type]
                original_filename="memo.m4a",
                mime_type="audio/mp4",
            )
        assert service.list_notes() == []
        assert [p for p in archive.iterdir() if p.is_dir()] == []
    finally:
        worker.stop()


# --- Mic path (KTD-4 mapping) ---


@pytest.mark.parametrize(
    ("content_type", "stored_name"),
    [("audio/webm;codecs=opus", "audio.webm"), ("audio/mp4", "audio.m4a")],
)
def test_mic_blob_maps_mime_type_to_extension(
    make_client: ClientFactory,
    fixtures_dir: Path,
    tmp_path: Path,
    content_type: str,
    stored_name: str,
) -> None:
    client = make_client(FakeTranscriber())
    blob = (fixtures_dir / "spoken.webm").read_bytes()
    response = client.post("/api/notes/mic", files={"file": ("blob", blob, content_type)})
    assert response.status_code == 201
    note_id = response.json()["id"]
    assert note_id.endswith("-mic")
    wait_for_status(client, note_id, "done")
    assert (tmp_path / "archive" / note_id / stored_name).is_file()


def test_mic_blob_with_unusable_type_is_rejected(make_client: ClientFactory) -> None:
    client = make_client(FakeTranscriber())
    response = client.post("/api/notes/mic", files={"file": ("blob", b"data", "text/plain")})
    assert response.status_code == 415


# --- Status lifecycle, concurrency (AE4), responsiveness ---


def test_list_shows_processing_then_done(make_client: ClientFactory, fixtures_dir: Path) -> None:
    client = make_client(FakeTranscriber(delay_seconds=0.3))
    blob = (fixtures_dir / "silence.wav").read_bytes()
    note_id = client.post("/api/notes", files={"file": ("thought.wav", blob, "audio/wav")}).json()[
        "id"
    ]

    listed = {note["id"]: note for note in client.get("/api/notes").json()}
    assert listed[note_id]["status"] == "processing"
    wait_for_status(client, note_id, "done")
    listed = {note["id"]: note for note in client.get("/api/notes").json()}
    assert listed[note_id]["status"] == "done"


def test_capture_proceeds_while_another_note_transcribes(
    make_client: ClientFactory, fixtures_dir: Path
) -> None:
    """Covers AE4, plus the KTD-5 responsiveness guarantee."""
    client = make_client(FakeTranscriber(delay_seconds=0.5))
    blob = (fixtures_dir / "silence.wav").read_bytes()

    first = client.post("/api/notes", files={"file": ("one.wav", blob, "audio/wav")}).json()["id"]

    started = time.perf_counter()
    second_response = client.post("/api/notes", files={"file": ("two.wav", blob, "audio/wav")})
    list_response = client.get("/api/notes")
    elapsed = time.perf_counter() - started

    assert second_response.status_code == 201
    assert list_response.status_code == 200
    assert elapsed < 2.0, f"API stalled behind the engine: {elapsed:.2f}s"

    wait_for_status(client, first, "done")
    wait_for_status(client, second_response.json()["id"], "done")


# --- Failure, recovery, retry ---


def test_failed_transcription_is_visible_and_retryable(
    make_client: ClientFactory, fixtures_dir: Path, tmp_path: Path
) -> None:
    failing = FakeTranscriber(fail_with="engine exploded")
    client = make_client(failing)
    blob = (fixtures_dir / "silence.wav").read_bytes()
    note_id = client.post("/api/notes", files={"file": ("x.wav", blob, "audio/wav")}).json()["id"]

    failed = wait_for_status(client, note_id, "failed")
    assert failed["error"] is not None and "engine exploded" in str(failed["error"])
    assert not (tmp_path / "archive" / note_id / "note.md").exists()

    failing.fail_with = None  # the engine recovers; retry re-runs transcription
    assert client.post(f"/api/notes/{note_id}/retry").status_code == 202
    done = wait_for_status(client, note_id, "done")
    assert done["transcript"]


def test_startup_recovery_marks_orphans_and_sweeps_garbage(
    make_client: ClientFactory, tmp_path: Path, fixtures_dir: Path
) -> None:
    archive = tmp_path / "restart-archive"
    orphan = archive / "2026-07-06-090000-mic"
    orphan.mkdir(parents=True)
    (orphan / "audio.webm").write_bytes((fixtures_dir / "spoken.webm").read_bytes())
    garbage = archive / "2026-07-06-090100-mic"
    garbage.mkdir()
    (garbage / ".audio.webm.part").write_bytes(b"truncated transfer")

    client = make_client(FakeTranscriber(), archive=archive)
    listed = {note["id"]: note for note in client.get("/api/notes").json()}
    assert listed[orphan.name]["status"] == "failed"
    assert garbage.name not in listed
    assert not garbage.exists()

    assert client.post(f"/api/notes/{orphan.name}/retry").status_code == 202
    wait_for_status(client, orphan.name, "done")


def test_retry_conflicts_and_unknown_notes(make_client: ClientFactory, fixtures_dir: Path) -> None:
    client = make_client(FakeTranscriber(delay_seconds=0.4))
    blob = (fixtures_dir / "silence.wav").read_bytes()
    note_id = client.post("/api/notes", files={"file": ("x.wav", blob, "audio/wav")}).json()["id"]

    assert client.post(f"/api/notes/{note_id}/retry").status_code == 409  # still transcribing
    wait_for_status(client, note_id, "done")
    assert client.post(f"/api/notes/{note_id}/retry").status_code == 409  # complete: write-once

    assert client.post("/api/notes/nope/retry").status_code == 404
    assert client.get("/api/notes/nope").status_code == 404
    assert client.get("/api/notes/nope/audio").status_code == 404


# --- Playback (Range) and search (AE5) ---


def test_audio_endpoint_honors_range_requests(
    make_client: ClientFactory, fixtures_dir: Path
) -> None:
    client = make_client(FakeTranscriber())
    original = (fixtures_dir / "silence.wav").read_bytes()
    note_id = client.post("/api/notes", files={"file": ("clip.wav", original, "audio/wav")}).json()[
        "id"
    ]
    wait_for_status(client, note_id, "done")

    full = client.get(f"/api/notes/{note_id}/audio")
    assert full.status_code == 200
    assert full.content == original

    partial = client.get(f"/api/notes/{note_id}/audio", headers={"Range": "bytes=0-3"})
    assert partial.status_code == 206
    assert partial.content == original[:4]
    assert partial.headers["content-range"].startswith("bytes 0-3/")


def test_search_finds_keyword_and_empty_query_is_empty(
    make_client: ClientFactory, fixtures_dir: Path
) -> None:
    """Covers AE5."""
    client = make_client(FakeTranscriber(text="remember to call the landlord about the deposit"))
    blob = (fixtures_dir / "silence.wav").read_bytes()
    note_id = client.post("/api/notes", files={"file": ("a.wav", blob, "audio/wav")}).json()["id"]
    wait_for_status(client, note_id, "done")

    hits = client.get("/api/search", params={"q": "deposit"}).json()
    assert [hit["id"] for hit in hits] == [note_id]
    assert client.get("/api/search", params={"q": ""}).json() == []
    assert client.get("/api/search", params={"q": "zebra"}).json() == []


def test_warmup_never_runs_concurrently_with_a_job(
    make_client: ClientFactory, fixtures_dir: Path
) -> None:
    """Regression: a warmup thread racing the first job on the shared MLX model corrupted
    its transcript. Warmup must ride the serial queue like any other engine work."""
    fake = FakeTranscriber(warmup_delay_seconds=0.3)
    client = make_client(fake)
    blob = (fixtures_dir / "silence.wav").read_bytes()
    note_id = client.post("/api/notes", files={"file": ("x.wav", blob, "audio/wav")}).json()["id"]
    wait_for_status(client, note_id, "done")
    assert fake.warmed
    assert fake.overlaps == 0


# --- Silence is a note (G12) ---


def test_empty_transcript_note_completes_with_timestamp_title(
    make_client: ClientFactory, fixtures_dir: Path
) -> None:
    client = make_client(FakeTranscriber(text=""))
    blob = (fixtures_dir / "silence.wav").read_bytes()
    note_id = client.post("/api/notes", files={"file": ("s.wav", blob, "audio/wav")}).json()["id"]
    detail = wait_for_status(client, note_id, "done")
    assert detail["transcript"] == ""
    assert isinstance(detail["title"], str)
    assert detail["title"][:4].isdigit()  # capture-timestamp fallback, not a blank card
