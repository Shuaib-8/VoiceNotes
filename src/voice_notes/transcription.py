"""The transcription seam: ffmpeg normalization and the mlx-whisper adapter (KTD-1, KTD-3).

Adapters take a normalized WAV path and return plain data with provenance —
no engine types leak, so an engine swap (or a future subprocess sidecar) is
just another adapter. The mlx adapter never hands the library a file path:
path input makes ``mlx_whisper`` shell out to a PATH-resolved ``ffmpeg``
(a hidden Homebrew dependency); we decode the WAV in-process instead.
"""

from __future__ import annotations

import subprocess
import wave
from datetime import datetime
from importlib.metadata import version
from pathlib import Path
from typing import Protocol, runtime_checkable

import imageio_ffmpeg
import numpy as np
from pydantic import BaseModel

from voice_notes.archive import TranscriptionProvenance

DEFAULT_MODEL_ID = "mlx-community/whisper-large-v3-turbo"
TARGET_SAMPLE_RATE = 16_000


class NormalizationError(RuntimeError):
    """The source audio could not be decoded to the engine's input format."""


class TranscriptionResult(BaseModel):
    text: str
    language: str | None
    provenance: TranscriptionProvenance


@runtime_checkable
class Transcriber(Protocol):
    """The engine seam: normalized WAV in, plain result with provenance out."""

    def warmup(self) -> None: ...

    def transcribe(self, wav_path: Path) -> TranscriptionResult: ...


def normalize_to_wav(source: Path, destination: Path) -> None:
    """Decode any supported container to 16 kHz mono s16 WAV via the vendored ffmpeg."""
    command = [
        imageio_ffmpeg.get_ffmpeg_exe(),
        "-nostdin",
        "-y",
        "-i",
        str(source),
        "-ar",
        str(TARGET_SAMPLE_RATE),
        "-ac",
        "1",
        "-c:a",
        "pcm_s16le",
        str(destination),
    ]
    completed = subprocess.run(command, capture_output=True, text=True, check=False)
    if completed.returncode != 0 or not destination.is_file():
        detail = (
            completed.stderr.strip().splitlines()[-1] if completed.stderr.strip() else "unknown"
        )
        raise NormalizationError(f"could not decode {source.name}: {detail}")


def wav_duration_seconds(wav_path: Path) -> float:
    with wave.open(str(wav_path), "rb") as handle:
        frames = handle.getnframes()
        rate = handle.getframerate()
    return frames / float(rate)


def read_waveform(wav_path: Path) -> np.ndarray:
    """Decode the normalized WAV to the float32 waveform the engine expects."""
    with wave.open(str(wav_path), "rb") as handle:
        if handle.getnchannels() != 1 or handle.getframerate() != TARGET_SAMPLE_RATE:
            raise NormalizationError(
                f"{wav_path.name} is not {TARGET_SAMPLE_RATE} Hz mono; normalize it first"
            )
        frames = handle.readframes(handle.getnframes())
    return np.frombuffer(frames, dtype=np.int16).astype(np.float32) / 32768.0


class MlxWhisperTranscriber:
    """mlx-whisper on Metal; the model loads lazily and stays resident (KTD-5)."""

    def __init__(self, model_id: str = DEFAULT_MODEL_ID) -> None:
        self._model_id = model_id

    def warmup(self) -> None:
        """Best-effort model load so the first real note doesn't pay it (non-blocking caller)."""
        try:
            self._run_engine(np.zeros(TARGET_SAMPLE_RATE // 2, dtype=np.float32))
        except Exception:  # noqa: BLE001 - warmup must never take the app down
            pass

    def transcribe(self, wav_path: Path) -> TranscriptionResult:
        output = self._run_engine(read_waveform(wav_path))
        raw_language = output.get("language")
        return TranscriptionResult(
            text=str(output.get("text", "")).strip(),
            language=str(raw_language) if raw_language is not None else None,
            provenance=TranscriptionProvenance(
                engine="mlx-whisper",
                model=self._model_id,
                engine_version=version("mlx-whisper"),
                params={"path_or_hf_repo": self._model_id},
                transcribed_at=datetime.now().astimezone(),
                language=str(raw_language) if raw_language is not None else None,
            ),
        )

    def _run_engine(self, waveform: np.ndarray) -> dict[str, object]:
        import mlx_whisper  # heavy import deferred so fast paths never pay it

        result = mlx_whisper.transcribe(waveform, path_or_hf_repo=self._model_id)
        return dict(result)
