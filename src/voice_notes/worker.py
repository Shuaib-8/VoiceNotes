"""Serial transcription worker: one job at a time, status registry, polling-friendly (KTD-5).

The registry is disposable in-memory app state — deliberately outside the
archive (R9). The disk remains the only durable truth about a note.
"""

from __future__ import annotations

import queue
import threading
from collections.abc import Callable
from enum import StrEnum

from pydantic import BaseModel


class JobStatus(StrEnum):
    QUEUED = "queued"
    TRANSCRIBING = "transcribing"
    DONE = "done"
    FAILED = "failed"


class JobRecord(BaseModel):
    note_id: str
    status: JobStatus
    error: str | None = None


class TranscriptionWorker:
    """Single consumer thread over a FIFO queue; capture never blocks on the engine (R6)."""

    def __init__(self) -> None:
        self._queue: queue.Queue[tuple[str, Callable[[], None]] | None] = queue.Queue()
        self._records: dict[str, JobRecord] = {}
        self._lock = threading.Lock()
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        if self._thread is not None:
            return
        self._thread = threading.Thread(target=self._run, name="transcription-worker", daemon=True)
        self._thread.start()

    def submit(self, note_id: str, job: Callable[[], None]) -> None:
        with self._lock:
            self._records[note_id] = JobRecord(note_id=note_id, status=JobStatus.QUEUED)
        self._queue.put((note_id, job))

    def status_of(self, note_id: str) -> JobRecord | None:
        with self._lock:
            record = self._records.get(note_id)
        return record.model_copy() if record is not None else None

    def mark_failed(self, note_id: str, error: str) -> None:
        """Record a failure discovered outside the queue (e.g. startup recovery)."""
        with self._lock:
            self._records[note_id] = JobRecord(
                note_id=note_id, status=JobStatus.FAILED, error=error
            )

    def wait_idle(self, timeout: float) -> bool:
        """Test helper: block until every submitted job has finished."""
        deadline = threading.Event()
        done = threading.Thread(target=self._queue.join, daemon=True)
        done.start()
        done.join(timeout)
        alive = done.is_alive()
        del deadline
        return not alive

    def stop(self, timeout: float = 5.0) -> None:
        if self._thread is None:
            return
        self._queue.put(None)
        self._thread.join(timeout)
        self._thread = None

    def _set_status(self, note_id: str, status: JobStatus, error: str | None = None) -> None:
        with self._lock:
            self._records[note_id] = JobRecord(note_id=note_id, status=status, error=error)

    def _run(self) -> None:
        while True:
            item = self._queue.get()
            if item is None:
                self._queue.task_done()
                return
            note_id, job = item
            self._set_status(note_id, JobStatus.TRANSCRIBING)
            try:
                job()
            except Exception as error:  # noqa: BLE001 - a failed job must not kill the worker
                self._set_status(note_id, JobStatus.FAILED, error=str(error))
            else:
                self._set_status(note_id, JobStatus.DONE)
            finally:
                self._queue.task_done()
