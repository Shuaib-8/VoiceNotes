"""Shared fixtures: committed spoken clips + platform-independent generated audio.

The three spoken clips need real speech, which only macOS can synthesize, so they
are committed under tests/fixtures/ and merely copied here — regenerate them with
`uv run python scripts/generate_test_fixtures.py` (macOS only). silence.wav and
corrupt.m4a generate anywhere, so they are produced fresh each session instead.
"""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import imageio_ffmpeg
import pytest

COMMITTED_FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures"
SPOKEN_CLIPS = ("spoken.m4a", "spoken.opus", "spoken.webm")


@pytest.fixture(scope="session")
def ffmpeg_exe() -> str:
    return imageio_ffmpeg.get_ffmpeg_exe()


def _run(command: list[str]) -> None:
    completed = subprocess.run(command, capture_output=True, text=True, check=False)
    if completed.returncode != 0:
        raise RuntimeError(
            f"fixture generation failed: {' '.join(command)}\n{completed.stderr[-800:]}"
        )


@pytest.fixture(scope="session")
def fixtures_dir(tmp_path_factory: pytest.TempPathFactory, ffmpeg_exe: str) -> Path:
    root = tmp_path_factory.mktemp("audio-fixtures")

    missing = [name for name in SPOKEN_CLIPS if not (COMMITTED_FIXTURES_DIR / name).is_file()]
    if missing:
        raise RuntimeError(
            f"committed audio fixtures missing from {COMMITTED_FIXTURES_DIR}: "
            f"{', '.join(missing)} — regenerate on macOS with "
            "`uv run python scripts/generate_test_fixtures.py` and commit the results"
        )
    for name in SPOKEN_CLIPS:
        shutil.copyfile(COMMITTED_FIXTURES_DIR / name, root / name)

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
