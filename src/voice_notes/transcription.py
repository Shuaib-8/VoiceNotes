"""The transcription seam: ffmpeg normalization and the engine adapters (KTD-1, KTD-3).

Adapters take a normalized WAV path and return plain data with provenance —
no engine types leak, so an engine swap (or a future subprocess sidecar) is
just another adapter. Neither adapter hands its library a file path: path
input makes ``mlx_whisper`` shell out to a PATH-resolved ``ffmpeg`` (a hidden
Homebrew dependency); we decode the WAV in-process instead, and faster-whisper
consumes the decoded waveform as-is.
"""

from __future__ import annotations

import subprocess
import wave
from collections.abc import Callable
from datetime import datetime
from importlib.metadata import version
from pathlib import Path
from typing import TYPE_CHECKING, Protocol, runtime_checkable

import imageio_ffmpeg
import numpy as np
from pydantic import BaseModel

from voice_notes.archive import TranscriptionProvenance

if TYPE_CHECKING:
    from faster_whisper import WhisperModel

DEFAULT_MODEL_ID = "mlx-community/whisper-large-v3-turbo"
# Canonical faster-whisper alias (in faster_whisper.utils.available_models());
# resolves to the mobiuslabsgmbh/faster-whisper-large-v3-turbo CTranslate2 weights.
DEFAULT_CPU_MODEL_ID = "large-v3-turbo"
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


def _best_effort_warmup(run_engine: Callable[[np.ndarray], object]) -> None:
    """Best-effort model load so the first real note doesn't pay it (non-blocking caller)."""
    try:
        run_engine(np.zeros(TARGET_SAMPLE_RATE // 2, dtype=np.float32))
    except Exception:  # noqa: BLE001 - warmup must never take the app down
        pass


class MlxWhisperTranscriber:
    """mlx-whisper on Metal; the model loads lazily and stays resident (KTD-5)."""

    def __init__(self, model_id: str = DEFAULT_MODEL_ID) -> None:
        self._model_id = model_id

    def warmup(self) -> None:
        _best_effort_warmup(self._run_engine)

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
        # Heavy import deferred so fast paths never pay it. The package is absent
        # by design off Apple Silicon (platform marker), so the type-checker cannot
        # resolve it on Windows/Linux lanes.
        import mlx_whisper  # pyrefly: ignore[missing-import]

        result = mlx_whisper.transcribe(waveform, path_or_hf_repo=self._model_id)
        return dict(result)


class FasterWhisperTranscriber:
    """faster-whisper (CTranslate2) on CPU; the model loads lazily and stays resident (KTD-5).

    Device is always ``"cpu"`` with ``num_workers=1``: the serial worker queue is the
    concurrency model, so extra workers would only add OpenMP thread contention.
    ``cpu_threads`` stays at the library's auto default.
    """

    def __init__(self, model_id: str = DEFAULT_CPU_MODEL_ID, compute_type: str = "int8") -> None:
        self._model_id = model_id
        self._compute_type = compute_type
        self._model: WhisperModel | None = None

    def warmup(self) -> None:
        _best_effort_warmup(self._run_engine)

    def transcribe(self, wav_path: Path) -> TranscriptionResult:
        text, language = self._run_engine(read_waveform(wav_path))
        return TranscriptionResult(
            text=text,
            language=language,
            provenance=TranscriptionProvenance(
                engine="faster-whisper",
                model=self._model_id,
                engine_version=version("faster-whisper"),
                params={
                    "compute_type": self._compute_type,
                    "device": "cpu",
                    "num_workers": 1,
                },
                transcribed_at=datetime.now().astimezone(),
                language=language,
            ),
        )

    def _run_engine(self, waveform: np.ndarray) -> tuple[str, str | None]:
        # faster-whisper consumes an ndarray as-is (no decode/resample of its own), so
        # guard the contract read_waveform upholds: float32 mono at TARGET_SAMPLE_RATE.
        if waveform.dtype != np.float32 or waveform.ndim != 1:
            raise NormalizationError("engine input must be a float32 mono waveform")
        if self._model is None:
            # heavy import deferred so fast paths never pay it
            from faster_whisper import WhisperModel

            self._model = WhisperModel(
                self._model_id,
                device="cpu",
                compute_type=self._compute_type,
                num_workers=1,
            )
        segments, info = self._model.transcribe(waveform)
        # segments is a lazy generator: drain it eagerly inside this serial job.
        segment_texts = [segment.text for segment in segments]
        raw_language = info.language
        return "".join(segment_texts).strip(), (
            str(raw_language) if raw_language is not None else None
        )
