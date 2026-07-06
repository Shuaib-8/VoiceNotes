"""U3 slow tests: the real mlx-whisper engine. First run downloads the model (~1.6 GB).

Run with: uv run pytest -m slow
"""

from __future__ import annotations

import subprocess
import time
from pathlib import Path

import pytest

from voice_notes.transcription import (
    MlxWhisperTranscriber,
    normalize_to_wav,
    wav_duration_seconds,
)

pytestmark = pytest.mark.slow


@pytest.fixture(scope="module")
def transcriber() -> MlxWhisperTranscriber:
    return MlxWhisperTranscriber()


def test_real_engine_transcribes_the_spoken_keyword(
    fixtures_dir: Path, tmp_path: Path, transcriber: MlxWhisperTranscriber
) -> None:
    wav = tmp_path / "spoken.wav"
    normalize_to_wav(fixtures_dir / "spoken.m4a", wav)
    result = transcriber.transcribe(wav)

    assert "deposit" in result.text.lower()
    assert result.provenance.engine == "mlx-whisper"
    assert result.provenance.model
    assert result.provenance.engine_version
    assert result.provenance.transcribed_at.tzinfo is not None


def test_silence_completes_without_error(
    fixtures_dir: Path, transcriber: MlxWhisperTranscriber
) -> None:
    result = transcriber.transcribe(fixtures_dir / "silence.wav")
    assert isinstance(result.text, str)
    assert len(result.text) < 80  # silence must not fail; minor hallucination tolerated


def test_transcribes_with_no_ffmpeg_on_path(
    fixtures_dir: Path,
    tmp_path: Path,
    transcriber: MlxWhisperTranscriber,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """KTD-3: array input removes the hidden PATH-ffmpeg dependency."""
    wav = tmp_path / "spoken.wav"
    normalize_to_wav(fixtures_dir / "spoken.m4a", wav)  # vendored ffmpeg, before the scrub

    empty_dir = tmp_path / "empty-path"
    empty_dir.mkdir()
    monkeypatch.setenv("PATH", str(empty_dir))
    result = transcriber.transcribe(wav)
    assert "deposit" in result.text.lower()


def test_latency_for_a_one_minute_note(
    fixtures_dir: Path, tmp_path: Path, transcriber: MlxWhisperTranscriber, ffmpeg_exe: str
) -> None:
    """Success criterion: transcript within ~10s for a <=1-minute note; stop condition at 2x."""
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
    assert elapsed < 20.0, f"latency {elapsed:.1f}s breaches the 2x stop-condition bound"
