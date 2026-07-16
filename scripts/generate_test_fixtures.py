"""Regenerate the committed spoken-audio test fixtures in tests/fixtures/.

macOS-only maintenance tool: real speech comes from `/usr/bin/say`, which CI
lanes (Windows/Ubuntu) cannot run, so the three spoken clips are committed and
the test suite merely copies them (see tests/conftest.py). Run this only when
the spoken phrase or encodings must change, then commit the results:

    uv run python scripts/generate_test_fixtures.py

The platform-independent fixtures (silence.wav, corrupt.m4a) are still
generated at test time by conftest and are intentionally NOT committed.
"""

from __future__ import annotations

import subprocess
import sys
import tempfile
from pathlib import Path

import imageio_ffmpeg

SPOKEN_TEXT = "Remember to call the landlord about the deposit."
FIXTURES_DIR = Path(__file__).resolve().parent.parent / "tests" / "fixtures"


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


def generate_spoken_fixtures(destination_dir: Path) -> list[Path]:
    """Synthesize the spoken phrase with `say` and encode it into each container."""
    if sys.platform != "darwin":
        raise SystemExit("This script requires macOS: spoken clips are synthesized with `say`.")

    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    destination_dir.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory() as scratch:
        spoken_aiff = Path(scratch) / "spoken.aiff"
        _run(["/usr/bin/say", "-o", str(spoken_aiff), SPOKEN_TEXT])

        _encode(ffmpeg, spoken_aiff, destination_dir / "spoken.m4a", [["-c:a", "aac"]])
        _encode(
            ffmpeg,
            spoken_aiff,
            destination_dir / "spoken.opus",
            [["-c:a", "libopus"], ["-c:a", "opus", "-strict", "-2"]],
        )
        _encode(
            ffmpeg,
            spoken_aiff,
            destination_dir / "spoken.webm",
            [["-c:a", "libopus"], ["-c:a", "libvorbis"]],
        )

    return sorted(destination_dir.glob("spoken.*"))


def main() -> None:
    written = generate_spoken_fixtures(FIXTURES_DIR)
    for path in written:
        print(f"wrote {path} ({path.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
