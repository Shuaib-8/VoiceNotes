"""A fake Transcriber for fast tests: real seam, no engine."""

from __future__ import annotations

import threading
import time
from datetime import datetime
from pathlib import Path

from voice_notes.archive import TranscriptionProvenance
from voice_notes.transcription import TranscriptionResult


class FakeTranscriber:
    """Also detects engine-concurrency violations: real MLX corrupts results if two
    transcriptions share the model, so the seam must never be entered twice at once."""

    def __init__(
        self,
        text: str = "remember to call the landlord about the deposit",
        delay_seconds: float = 0.0,
        fail_with: str | None = None,
        warmup_delay_seconds: float = 0.0,
    ) -> None:
        self.text = text
        self.delay_seconds = delay_seconds
        self.fail_with = fail_with
        self.warmup_delay_seconds = warmup_delay_seconds
        self.warmed = False
        self.transcribed: list[Path] = []
        self.overlaps = 0
        self._active = 0
        self._lock = threading.Lock()

    def _enter(self) -> None:
        with self._lock:
            self._active += 1
            if self._active > 1:
                self.overlaps += 1

    def _exit(self) -> None:
        with self._lock:
            self._active -= 1

    def warmup(self) -> None:
        self._enter()
        try:
            if self.warmup_delay_seconds:
                time.sleep(self.warmup_delay_seconds)
        finally:
            self._exit()
        self.warmed = True

    def transcribe(self, wav_path: Path) -> TranscriptionResult:
        self._enter()
        try:
            if self.delay_seconds:
                time.sleep(self.delay_seconds)
            self.transcribed.append(wav_path)
            if self.fail_with is not None:
                raise RuntimeError(self.fail_with)
            return TranscriptionResult(
                text=self.text,
                language="en",
                provenance=TranscriptionProvenance(
                    engine="fake",
                    model="fake-1",
                    engine_version="0.0",
                    params={"fixture": True},
                    transcribed_at=datetime.now().astimezone(),
                    language="en",
                ),
            )
        finally:
            self._exit()
