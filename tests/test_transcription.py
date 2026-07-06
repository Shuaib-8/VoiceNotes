"""U3 fast tests: normalization, waveform decode, and the Transcriber seam (no real engine)."""

from __future__ import annotations

import wave
from pathlib import Path

import numpy as np
import pytest

from fakes import FakeTranscriber
from voice_notes.transcription import (
    TARGET_SAMPLE_RATE,
    MlxWhisperTranscriber,
    NormalizationError,
    Transcriber,
    normalize_to_wav,
    read_waveform,
    wav_duration_seconds,
)


@pytest.mark.parametrize("name", ["spoken.m4a", "spoken.opus", "spoken.webm"])
def test_normalize_each_supported_container(fixtures_dir: Path, tmp_path: Path, name: str) -> None:
    destination = tmp_path / f"{name}.wav"
    normalize_to_wav(fixtures_dir / name, destination)
    with wave.open(str(destination), "rb") as handle:
        assert handle.getframerate() == TARGET_SAMPLE_RATE
        assert handle.getnchannels() == 1
        assert handle.getsampwidth() == 2
    assert wav_duration_seconds(destination) > 1.0


def test_normalize_corrupt_file_raises_typed_error(fixtures_dir: Path, tmp_path: Path) -> None:
    with pytest.raises(NormalizationError, match="corrupt.m4a"):
        normalize_to_wav(fixtures_dir / "corrupt.m4a", tmp_path / "out.wav")


def test_wav_duration_of_silence_fixture(fixtures_dir: Path) -> None:
    assert wav_duration_seconds(fixtures_dir / "silence.wav") == pytest.approx(1.0, abs=0.05)


def test_read_waveform_produces_normalized_float32(fixtures_dir: Path) -> None:
    waveform = read_waveform(fixtures_dir / "silence.wav")
    assert waveform.dtype == np.float32
    assert waveform.ndim == 1
    assert len(waveform) == pytest.approx(TARGET_SAMPLE_RATE, abs=200)
    assert float(np.abs(waveform).max()) <= 1.0


def test_read_waveform_rejects_non_normalized_audio(tmp_path: Path) -> None:
    wrong_rate = tmp_path / "wrong.wav"
    with wave.open(str(wrong_rate), "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(8000)
        handle.writeframes(b"\x00\x00" * 800)
    with pytest.raises(NormalizationError, match="normalize"):
        read_waveform(wrong_rate)


def test_fake_and_real_adapters_satisfy_the_seam(fixtures_dir: Path) -> None:
    fake = FakeTranscriber()
    assert isinstance(fake, Transcriber)
    assert isinstance(MlxWhisperTranscriber(), Transcriber)

    result = fake.transcribe(fixtures_dir / "silence.wav")
    assert result.text
    assert result.provenance.engine == "fake"
    assert result.provenance.transcribed_at.tzinfo is not None
