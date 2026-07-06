"""U3 worker tests: strict serialization, status lifecycle, failure isolation (KTD-5)."""

from __future__ import annotations

import threading
import time
from collections.abc import Iterator

import pytest

from voice_notes.worker import JobStatus, TranscriptionWorker


@pytest.fixture
def worker() -> Iterator[TranscriptionWorker]:
    instance = TranscriptionWorker()
    instance.start()
    yield instance
    instance.stop()


def test_status_lifecycle_reaches_done(worker: TranscriptionWorker) -> None:
    worker.submit("note-1", lambda: None)
    assert worker.wait_idle(timeout=5.0)
    record = worker.status_of("note-1")
    assert record is not None
    assert record.status == JobStatus.DONE
    assert record.error is None


def test_jobs_run_strictly_serially(worker: TranscriptionWorker) -> None:
    release_first = threading.Event()
    order: list[str] = []

    def first_job() -> None:
        release_first.wait(timeout=5.0)
        order.append("first")

    def second_job() -> None:
        order.append("second")

    worker.submit("note-first", first_job)
    worker.submit("note-second", second_job)

    deadline = time.monotonic() + 5.0
    while time.monotonic() < deadline:
        first = worker.status_of("note-first")
        if first is not None and first.status == JobStatus.TRANSCRIBING:
            break
        time.sleep(0.01)
    second = worker.status_of("note-second")
    assert second is not None
    assert second.status == JobStatus.QUEUED

    release_first.set()
    assert worker.wait_idle(timeout=5.0)
    assert order == ["first", "second"]


def test_failure_records_message_and_worker_survives(worker: TranscriptionWorker) -> None:
    def failing_job() -> None:
        raise ValueError("decode exploded")

    worker.submit("note-bad", failing_job)
    worker.submit("note-good", lambda: None)
    assert worker.wait_idle(timeout=5.0)

    bad = worker.status_of("note-bad")
    good = worker.status_of("note-good")
    assert bad is not None and bad.status == JobStatus.FAILED
    assert bad.error is not None and "decode exploded" in bad.error
    assert good is not None and good.status == JobStatus.DONE


def test_mark_failed_supports_startup_recovery(worker: TranscriptionWorker) -> None:
    worker.mark_failed("note-orphan", "app restarted while transcribing")
    record = worker.status_of("note-orphan")
    assert record is not None
    assert record.status == JobStatus.FAILED


def test_unknown_note_has_no_status(worker: TranscriptionWorker) -> None:
    assert worker.status_of("nope") is None
