"""U6: the archive outlives the app — app-level relocation test (AE6, R10).

A fresh app instance pointed at a moved archive lists, opens, plays, and
searches every note with no migration step. The folder is self-describing.
"""

from __future__ import annotations

import shutil
from pathlib import Path

from fastapi.testclient import TestClient

from fakes import FakeTranscriber
from voice_notes.app import create_app
from voice_notes.config import Settings


def _wait_done(client: TestClient, note_id: str) -> None:
    import time

    deadline = time.monotonic() + 5.0
    while time.monotonic() < deadline:
        payload = client.get(f"/api/notes/{note_id}").json()
        if payload.get("status") == "done":
            return
        time.sleep(0.02)
    raise AssertionError(f"{note_id} never completed")


def test_moved_archive_works_in_a_fresh_app_instance(tmp_path: Path, fixtures_dir: Path) -> None:
    original_root = tmp_path / "first-home" / "VoiceNotes"
    blob = (fixtures_dir / "spoken.webm").read_bytes()

    first_settings = Settings(archive_root=original_root, frontend_dist=tmp_path / "none")
    with TestClient(
        create_app(first_settings, transcriber=FakeTranscriber(text="call about the deposit"))
    ) as client:
        first = client.post(
            "/api/notes", files={"file": ("deposit-call.webm", blob, "audio/webm")}
        ).json()["id"]
        second = client.post(
            "/api/notes", files={"file": ("groceries.webm", blob, "audio/webm")}
        ).json()["id"]
        _wait_done(client, first)
        _wait_done(client, second)

    moved_root = tmp_path / "synced-elsewhere" / "VoiceNotes"
    moved_root.parent.mkdir(parents=True)
    shutil.move(str(original_root), str(moved_root))

    fresh_settings = Settings(archive_root=moved_root, frontend_dist=tmp_path / "none")
    with TestClient(create_app(fresh_settings, transcriber=FakeTranscriber())) as fresh:
        notes = fresh.get("/api/notes").json()
        assert len(notes) == 2
        assert all(note["status"] == "done" for note in notes)

        detail = fresh.get(f"/api/notes/{first}").json()
        assert detail["transcript"] == "call about the deposit"

        audio = fresh.get(f"/api/notes/{first}/audio")
        assert audio.status_code == 200
        assert audio.content == blob

        hits = fresh.get("/api/search", params={"q": "deposit"}).json()
        assert first in [hit["id"] for hit in hits]
