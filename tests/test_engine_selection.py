"""U4: platform-aware engine selection and env-driven settings (fail-loud config).

``select_transcriber`` is the codebase's single platform branch. These tests
inject platform markers and a ``find_spec`` stand-in, so no heavy engine
package is ever imported and every platform combination runs on any machine.
"""

from __future__ import annotations

from collections.abc import Callable

import pytest

from voice_notes.app import EngineUnavailableError, select_transcriber
from voice_notes.config import (
    Settings,
    resolve_engine,
    resolve_host,
    resolve_model,
)
from voice_notes.transcription import (
    DEFAULT_CPU_MODEL_ID,
    DEFAULT_MODEL_ID,
    FasterWhisperTranscriber,
    MlxWhisperTranscriber,
)

BOTH_ENGINES = ("mlx_whisper", "faster_whisper")


def _find_spec_stub(*installed: str) -> Callable[[str], object | None]:
    """Stand-in for importlib.util.find_spec: truthy spec only for installed packages."""

    def find_spec(name: str) -> object | None:
        return object() if name in installed else None

    return find_spec


def test_auto_selects_mlx_on_apple_silicon() -> None:
    engine = select_transcriber(
        Settings(),
        sys_platform="darwin",
        machine="arm64",
        find_spec=_find_spec_stub(*BOTH_ENGINES),
    )
    assert isinstance(engine, MlxWhisperTranscriber)


@pytest.mark.parametrize(
    ("sys_platform", "machine"),
    [("win32", "AMD64"), ("linux", "x86_64"), ("darwin", "x86_64")],
)
def test_auto_selects_faster_whisper_everywhere_else(sys_platform: str, machine: str) -> None:
    engine = select_transcriber(
        Settings(),
        sys_platform=sys_platform,
        machine=machine,
        find_spec=_find_spec_stub(*BOTH_ENGINES),
    )
    assert isinstance(engine, FasterWhisperTranscriber)


def test_explicit_engine_setting_beats_the_platform() -> None:
    cpu_engine_on_mac = select_transcriber(
        Settings(engine="faster-whisper"),
        sys_platform="darwin",
        machine="arm64",
        find_spec=_find_spec_stub(*BOTH_ENGINES),
    )
    assert isinstance(cpu_engine_on_mac, FasterWhisperTranscriber)

    mlx_on_windows = select_transcriber(
        Settings(engine="mlx-whisper"),
        sys_platform="win32",
        machine="AMD64",
        find_spec=_find_spec_stub(*BOTH_ENGINES),
    )
    assert isinstance(mlx_on_windows, MlxWhisperTranscriber)


def test_model_override_reaches_the_selected_adapter() -> None:
    cpu_engine = select_transcriber(
        Settings(engine="faster-whisper", model="small"),
        sys_platform="linux",
        machine="x86_64",
        find_spec=_find_spec_stub(*BOTH_ENGINES),
    )
    assert isinstance(cpu_engine, FasterWhisperTranscriber)
    assert cpu_engine._model_id == "small"

    mlx_engine = select_transcriber(
        Settings(engine="mlx-whisper", model="mlx-community/whisper-small"),
        sys_platform="darwin",
        machine="arm64",
        find_spec=_find_spec_stub(*BOTH_ENGINES),
    )
    assert isinstance(mlx_engine, MlxWhisperTranscriber)
    assert mlx_engine._model_id == "mlx-community/whisper-small"


def test_unset_model_keeps_each_adapters_own_default() -> None:
    mlx_engine = select_transcriber(
        Settings(engine="mlx-whisper"),
        sys_platform="darwin",
        machine="arm64",
        find_spec=_find_spec_stub(*BOTH_ENGINES),
    )
    assert isinstance(mlx_engine, MlxWhisperTranscriber)
    assert mlx_engine._model_id == DEFAULT_MODEL_ID

    cpu_engine = select_transcriber(
        Settings(engine="faster-whisper"),
        sys_platform="linux",
        machine="x86_64",
        find_spec=_find_spec_stub(*BOTH_ENGINES),
    )
    assert isinstance(cpu_engine, FasterWhisperTranscriber)
    assert cpu_engine._model_id == DEFAULT_CPU_MODEL_ID


def test_unknown_engine_value_fails_naming_the_valid_values() -> None:
    with pytest.raises(ValueError, match=r"auto.*mlx-whisper.*faster-whisper"):
        select_transcriber(
            Settings(engine="whisperx"),
            sys_platform="linux",
            machine="x86_64",
            find_spec=_find_spec_stub(*BOTH_ENGINES),
        )


def test_selected_engine_missing_on_this_platform_fails_loudly() -> None:
    with pytest.raises(EngineUnavailableError, match=r"mlx-whisper.*Apple"):
        select_transcriber(
            Settings(engine="mlx-whisper"),
            sys_platform="linux",
            machine="x86_64",
            find_spec=_find_spec_stub("faster_whisper"),
        )
    with pytest.raises(EngineUnavailableError, match=r"faster-whisper"):
        select_transcriber(
            Settings(engine="faster-whisper"),
            sys_platform="win32",
            machine="AMD64",
            find_spec=_find_spec_stub(),
        )


def test_resolve_engine_env_override_default_and_rejection() -> None:
    assert resolve_engine({}) == "auto"
    assert resolve_engine({"VOICE_NOTES_ENGINE": "faster-whisper"}) == "faster-whisper"
    with pytest.raises(ValueError, match=r"auto.*mlx-whisper.*faster-whisper"):
        resolve_engine({"VOICE_NOTES_ENGINE": "whisper.cpp"})


def test_resolve_model_env_override_and_default() -> None:
    assert resolve_model({"VOICE_NOTES_MODEL": "distil-large-v3"}) == "distil-large-v3"
    assert resolve_model({}) is None


def test_resolve_host_env_override_and_default() -> None:
    assert resolve_host({"VOICE_NOTES_HOST": "0.0.0.0"}) == "0.0.0.0"
    assert resolve_host({}) == "127.0.0.1"
