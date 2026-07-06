"""Runtime settings and archive-root resolution for the voice-notes app."""

from __future__ import annotations

import os
from collections.abc import Mapping
from pathlib import Path

from pydantic import BaseModel

_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent

ARCHIVE_ENV_VAR = "VOICE_NOTES_ARCHIVE"
DEFAULT_ARCHIVE_DIRNAME = "VoiceNotes"


class Settings(BaseModel):
    """App-level settings; the archive location is resolved separately below."""

    host: str = "127.0.0.1"
    port: int = 8477
    frontend_dist: Path = _PROJECT_ROOT / "frontend" / "dist"
    archive_root: Path | None = None  # None -> resolve via env / ~/VoiceNotes


def resolve_archive_root(env: Mapping[str, str] | None = None) -> Path:
    """Owner-choosable archive location (R10): env override, else ~/VoiceNotes."""
    source = os.environ if env is None else env
    override = source.get(ARCHIVE_ENV_VAR)
    if override:
        return Path(override).expanduser()
    return Path.home() / DEFAULT_ARCHIVE_DIRNAME


def ensure_archive_root(env: Mapping[str, str] | None = None) -> Path:
    root = resolve_archive_root(env)
    root.mkdir(parents=True, exist_ok=True)
    return root
