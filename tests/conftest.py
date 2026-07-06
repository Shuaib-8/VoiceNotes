"""Shared fixtures: tiny audio samples generated with macOS `say` + the vendored ffmpeg."""

from __future__ import annotations

import subprocess
from pathlib import Path

import imageio_ffmpeg
import pytest

SPOKEN_TEXT = "Remember to call the landlord about the deposit."


@pytest.fixture(scope="session")
def ffmpeg_exe() -> str:
    return imageio_ffmpeg.get_ffmpeg_exe()


def _run(command: list[str]) -> None:
    completed = subprocess.run(command, capture_output=True, text=True, check=False)
    if completed.returncode != 0:
        raise RuntimeError(
            f"fixture generation failed: {' '.join(command)}\n{completed.stderr[-800:]}"
        )


def _encode(ffmpeg: str, source: Path, destination: Path, codec_attempts: list[list[str]]) -> None:
    last_error: RuntimeError | None = None
    for codec_args in codec_attempts:
        try:
            _run([ffmpeg, "-nostdin", "-y", "-i", str(source), *codec_args, str(destination)])
            return
        except RuntimeError as error:
            last_error = error
    raise last_error if last_error else RuntimeError("no codec attempts supplied")


@pytest.fixture(scope="session")
def fixtures_dir(tmp_path_factory: pytest.TempPathFactory, ffmpeg_exe: str) -> Path:
    root = tmp_path_factory.mktemp("audio-fixtures")

    spoken_aiff = root / "spoken.aiff"
    _run(["/usr/bin/say", "-o", str(spoken_aiff), SPOKEN_TEXT])

    _encode(ffmpeg_exe, spoken_aiff, root / "spoken.m4a", [["-c:a", "aac"]])
    _encode(
        ffmpeg_exe,
        spoken_aiff,
        root / "spoken.opus",
        [["-c:a", "libopus"], ["-c:a", "opus", "-strict", "-2"]],
    )
    _encode(
        ffmpeg_exe,
        spoken_aiff,
        root / "spoken.webm",
        [["-c:a", "libopus"], ["-c:a", "libvorbis"]],
    )
    _run(
        [
            ffmpeg_exe,
            "-nostdin",
            "-y",
            "-f",
            "lavfi",
            "-i",
            "anullsrc=r=16000:cl=mono",
            "-t",
            "1",
            "-c:a",
            "pcm_s16le",
            str(root / "silence.wav"),
        ]
    )
    (root / "corrupt.m4a").write_bytes(b"this is not audio at all")
    return root
