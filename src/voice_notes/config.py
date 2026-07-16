"""Runtime settings and archive-root resolution for the voice-notes app."""

from __future__ import annotations

import os
from collections.abc import Mapping
from pathlib import Path
from typing import Literal, cast, get_args

from pydantic import BaseModel

_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent

ARCHIVE_ENV_VAR = "VOICE_NOTES_ARCHIVE"
DEFAULT_ARCHIVE_DIRNAME = "VoiceNotes"

ENGINE_ENV_VAR = "VOICE_NOTES_ENGINE"
MODEL_ENV_VAR = "VOICE_NOTES_MODEL"
HOST_ENV_VAR = "VOICE_NOTES_HOST"

DEFAULT_HOST = "127.0.0.1"
EngineName = Literal["auto", "mlx-whisper", "faster-whisper"]
DEFAULT_ENGINE: EngineName = "auto"
VALID_ENGINES: tuple[str, ...] = get_args(EngineName)


class Settings(BaseModel):
    """App-level settings; the archive location is resolved separately below."""

    host: str = DEFAULT_HOST
    port: int = 8477
    frontend_dist: Path = _PROJECT_ROOT / "frontend" / "dist"
    archive_root: Path | None = None  # None -> resolve via env / ~/VoiceNotes
    engine: EngineName = DEFAULT_ENGINE  # "auto" -> platform pick in app.select_transcriber
    model: str | None = None  # None -> the selected engine's own default


def _env_source(env: Mapping[str, str] | None) -> Mapping[str, str]:
    return os.environ if env is None else env


def resolve_archive_root(env: Mapping[str, str] | None = None) -> Path:
    """Owner-choosable archive location (R10): env override, else ~/VoiceNotes."""
    source = _env_source(env)
    override = source.get(ARCHIVE_ENV_VAR)
    if override:
        return Path(override).expanduser()
    return Path.home() / DEFAULT_ARCHIVE_DIRNAME


def ensure_archive_root(env: Mapping[str, str] | None = None) -> Path:
    root = resolve_archive_root(env)
    root.mkdir(parents=True, exist_ok=True)
    return root


def resolve_engine(env: Mapping[str, str] | None = None) -> EngineName:
    """Engine choice: env override, else "auto" (platform pick); bad values fail at startup."""
    source = _env_source(env)
    value = source.get(ENGINE_ENV_VAR) or DEFAULT_ENGINE
    if value not in VALID_ENGINES:
        raise ValueError(
            f"{ENGINE_ENV_VAR}={value!r} is not a supported engine; "
            f"valid values: {', '.join(VALID_ENGINES)}"
        )
    return cast("EngineName", value)


def resolve_model(env: Mapping[str, str] | None = None) -> str | None:
    """Model-id override for the selected engine: env value, else the engine's own default."""
    source = _env_source(env)
    return source.get(MODEL_ENV_VAR) or None


def resolve_host(env: Mapping[str, str] | None = None) -> str:
    """Bind address: env override (containers bind all interfaces), else loopback."""
    source = _env_source(env)
    return source.get(HOST_ENV_VAR) or DEFAULT_HOST
