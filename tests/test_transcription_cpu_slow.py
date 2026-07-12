"""CPU-engine slow tests: the real faster-whisper engine. First run downloads the model.

Run with: uv run pytest -m slow tests/test_transcription_cpu_slow.py
"""

from __future__ import annotations

import subprocess
import time
from pathlib import Path

import pytest

from voice_notes.transcription import (
    DEFAULT_CPU_MODEL_ID,
    FasterWhisperTranscriber,
    normalize_to_wav,
    wav_duration_seconds,
)

pytestmark = pytest.mark.slow


@pytest.fixture(scope="module")
def transcriber() -> FasterWhisperTranscriber:
    return FasterWhisperTranscriber()


def test_real_cpu_engine_transcribes_the_spoken_keyword(
    fixtures_dir: Path, tmp_path: Path, transcriber: FasterWhisperTranscriber
) -> None:
    wav = tmp_path / "spoken.wav"
    normalize_to_wav(fixtures_dir / "spoken.m4a", wav)
    result = transcriber.transcribe(wav)

    assert "deposit" in result.text.lower()
    assert result.provenance.engine == "faster-whisper"
    assert result.provenance.model == DEFAULT_CPU_MODEL_ID
    assert result.provenance.engine_version
    assert result.provenance.params["compute_type"] == "int8"
    assert result.provenance.transcribed_at.tzinfo is not None
    assert result.language


def test_cpu_engine_transcribes_with_no_ffmpeg_on_path(
    fixtures_dir: Path,
    tmp_path: Path,
    transcriber: FasterWhisperTranscriber,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """KTD-3: array input removes the hidden PATH-ffmpeg dependency on CPU too."""
    wav = tmp_path / "spoken.wav"
    normalize_to_wav(fixtures_dir / "spoken.m4a", wav)  # vendored ffmpeg, before the scrub

    empty_dir = tmp_path / "empty-path"
    empty_dir.mkdir()
    monkeypatch.setenv("PATH", str(empty_dir))
    result = transcriber.transcribe(wav)
    assert "deposit" in result.text.lower()


def test_cpu_model_stays_resident_between_transcriptions(
    fixtures_dir: Path, transcriber: FasterWhisperTranscriber
) -> None:
    """KTD-5: the loaded model is reused, never reloaded per job."""
    transcriber.transcribe(fixtures_dir / "silence.wav")
    handle = transcriber._model
    assert handle is not None
    transcriber.transcribe(fixtures_dir / "silence.wav")
    assert transcriber._model is handle


def test_cpu_latency_for_a_one_minute_note(
    fixtures_dir: Path, tmp_path: Path, transcriber: FasterWhisperTranscriber, ffmpeg_exe: str
) -> None:
    """CPU bound: generous headroom over a local Apple Silicon run for weak 4-vCPU CI runners."""
    minute_m4a = tmp_path / "minute.m4a"
    completed = subprocess.run(
        [
            ffmpeg_exe,
            "-nostdin",
            "-y",
            "-stream_loop",
            "30",
            "-i",
            str(fixtures_dir / "spoken.m4a"),
            "-t",
            "60",
            "-c:a",
            "aac",
            str(minute_m4a),
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    assert completed.returncode == 0, completed.stderr[-500:]

    wav = tmp_path / "minute.wav"
    normalize_to_wav(minute_m4a, wav)
    assert wav_duration_seconds(wav) >= 55.0

    started = time.perf_counter()
    result = transcriber.transcribe(wav)
    elapsed = time.perf_counter() - started

    print(f"\nMEASURED_LATENCY_SECONDS={elapsed:.2f} for {wav_duration_seconds(wav):.0f}s of audio")
    assert result.text.strip()
    # ~10x the 20-33s measured on an Apple Silicon CPU (int8), headroom for 4-vCPU CI runners.
    assert elapsed < 300.0, f"latency {elapsed:.1f}s breaches the CPU bound"


def test_bogus_model_id_surfaces_as_an_engine_error(
    fixtures_dir: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A bad model id raises like any engine failure (the worker marks the note failed).

    A slash-free unknown id fails faster-whisper's own alias lookup before any hub
    call, so nothing downloads; HF_HUB_OFFLINE is belt-and-braces against that changing.
    """
    monkeypatch.setenv("HF_HUB_OFFLINE", "1")
    broken = FasterWhisperTranscriber(model_id="definitely-not-a-model")

    broken.warmup()  # best-effort by contract: must swallow the failure, never raise

    with pytest.raises(Exception, match="definitely-not-a-model"):
        broken.transcribe(fixtures_dir / "silence.wav")
