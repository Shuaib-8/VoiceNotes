"""U1 scaffold smoke tests: health endpoint and static frontend serving."""

from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from voice_notes.app import create_app
from voice_notes.config import Settings


def test_health_returns_ok() -> None:
    client = TestClient(create_app(Settings(frontend_dist=Path("/nonexistent"))))
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "app": "voice-notes"}


def test_built_frontend_is_served_at_root(tmp_path: Path) -> None:
    dist = tmp_path / "dist"
    dist.mkdir()
    (dist / "index.html").write_text("<!doctype html><title>voice-notes</title>", encoding="utf-8")
    client = TestClient(create_app(Settings(frontend_dist=dist)))
    response = client.get("/")
    assert response.status_code == 200
    assert "voice-notes" in response.text


def test_no_frontend_dir_still_serves_api() -> None:
    client = TestClient(create_app(Settings(frontend_dist=Path("/nonexistent"))))
    assert client.get("/api/health").status_code == 200
