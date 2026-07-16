"""FastAPI application: API routes plus static serving of the built frontend."""

from __future__ import annotations

import importlib.util
import mimetypes
import platform
import sys
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager
from typing import Annotated

import uvicorn
from fastapi import APIRouter, Depends, FastAPI, HTTPException, Request, Response, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from voice_notes.archive import NoteAlreadyCompleteError
from voice_notes.config import (
    DEFAULT_ENGINE,
    ENGINE_ENV_VAR,
    VALID_ENGINES,
    Settings,
    ensure_archive_root,
    resolve_engine,
    resolve_host,
    resolve_model,
)
from voice_notes.ingest import (
    DeleteNotAllowedError,
    FileTooLargeError,
    IngestService,
    NoteDetail,
    NoteSummary,
    RetryNotAllowedError,
    UnsupportedFormatError,
)
from voice_notes.transcription import (
    FasterWhisperTranscriber,
    MlxWhisperTranscriber,
    Transcriber,
)
from voice_notes.worker import TranscriptionWorker


class HealthResponse(BaseModel):
    status: str
    app: str


class NoteCreatedResponse(BaseModel):
    id: str
    status: str = "processing"


def get_service(request: Request) -> IngestService:
    return request.app.state.ingest_service


ServiceDep = Annotated[IngestService, Depends(get_service)]

API_PREFIX = "/api"
api_router = APIRouter(prefix=API_PREFIX)


@api_router.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(status="ok", app="voice-notes")


@api_router.post("/notes", response_model=NoteCreatedResponse, status_code=201)
async def upload_note(file: UploadFile, service: ServiceDep) -> NoteCreatedResponse:
    try:
        note_id = await run_in_threadpool(
            lambda: service.ingest(
                source="upload",
                stream=file.file,
                original_filename=file.filename,
                mime_type=file.content_type,
            )
        )
    except UnsupportedFormatError as error:
        raise HTTPException(status_code=415, detail=str(error)) from error
    except FileTooLargeError as error:
        raise HTTPException(status_code=413, detail=str(error)) from error
    return NoteCreatedResponse(id=note_id)


@api_router.post("/notes/mic", response_model=NoteCreatedResponse, status_code=201)
async def record_note(file: UploadFile, service: ServiceDep) -> NoteCreatedResponse:
    try:
        note_id = await run_in_threadpool(
            lambda: service.ingest(source="mic", stream=file.file, mime_type=file.content_type)
        )
    except UnsupportedFormatError as error:
        raise HTTPException(status_code=415, detail=str(error)) from error
    except FileTooLargeError as error:
        raise HTTPException(status_code=413, detail=str(error)) from error
    return NoteCreatedResponse(id=note_id)


@api_router.get("/notes", response_model=list[NoteSummary])
async def list_notes(service: ServiceDep) -> list[NoteSummary]:
    return await run_in_threadpool(service.list_notes)


@api_router.get("/notes/{note_id}", response_model=NoteDetail)
async def get_note(note_id: str, service: ServiceDep) -> NoteDetail:
    detail = await run_in_threadpool(service.get_note, note_id)
    if detail is None:
        raise HTTPException(status_code=404, detail=f"no note {note_id!r}")
    return detail


@api_router.get("/notes/{note_id}/audio")
async def get_note_audio(note_id: str, service: ServiceDep) -> FileResponse:
    path = await run_in_threadpool(service.audio_path, note_id)
    if path is None or not path.is_file():
        raise HTTPException(status_code=404, detail=f"no audio for note {note_id!r}")
    media_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    return FileResponse(path, media_type=media_type)


@api_router.post("/notes/{note_id}/retry", response_model=NoteCreatedResponse, status_code=202)
async def retry_note(note_id: str, service: ServiceDep) -> NoteCreatedResponse:
    try:
        await run_in_threadpool(service.retry, note_id)
    except KeyError as error:
        raise HTTPException(status_code=404, detail=f"no retryable note {note_id!r}") from error
    except (NoteAlreadyCompleteError, RetryNotAllowedError) as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    return NoteCreatedResponse(id=note_id)


@api_router.delete("/notes/{note_id}", status_code=204)
async def delete_note(note_id: str, service: ServiceDep) -> Response:
    """Move a note to the archive's .trash — recoverable on disk, gone from the app."""
    try:
        await run_in_threadpool(service.delete, note_id)
    except KeyError as error:
        raise HTTPException(status_code=404, detail=f"no note {note_id!r}") from error
    except DeleteNotAllowedError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    return Response(status_code=204)


@api_router.post("/notes/{note_id}/restore", status_code=204)
async def restore_note(note_id: str, service: ServiceDep) -> Response:
    """Undo a delete: move the note back out of the archive's .trash."""
    try:
        await run_in_threadpool(service.restore, note_id)
    except KeyError as error:
        raise HTTPException(
            status_code=404, detail=f"nothing to restore for {note_id!r}"
        ) from error
    except FileExistsError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    return Response(status_code=204)


@api_router.get("/search", response_model=list[NoteSummary])
async def search(service: ServiceDep, q: str = "") -> list[NoteSummary]:
    return await run_in_threadpool(service.search, q)


class EngineUnavailableError(RuntimeError):
    """The selected transcription engine's package is not installed on this platform."""


def select_transcriber(
    settings: Settings,
    *,
    sys_platform: str | None = None,
    machine: str | None = None,
    find_spec: Callable[[str], object | None] | None = None,
) -> Transcriber:
    """Pick the engine for this platform — the codebase's single platform branch.

    ``auto`` maps to mlx-whisper on macOS/Apple Silicon (Metal) and to
    faster-whisper (CPU) everywhere else. Availability is probed with
    ``find_spec`` so a missing engine *package* fails loudly at startup without
    importing a heavy engine package; constructing an adapter stays lazy. Note
    this catches an absent package, not a present-but-unloadable native runtime
    (e.g. a broken ctranslate2/libgomp1): that surfaces on the first capture as
    a failed, retryable note, since warmup is best-effort.
    """
    resolved_platform = sys.platform if sys_platform is None else sys_platform
    resolved_machine = platform.machine() if machine is None else machine
    probe = importlib.util.find_spec if find_spec is None else find_spec

    engine = settings.engine
    if engine == DEFAULT_ENGINE:
        on_apple_silicon = resolved_platform == "darwin" and resolved_machine == "arm64"
        engine = "mlx-whisper" if on_apple_silicon else "faster-whisper"

    if engine == "mlx-whisper":
        if probe("mlx_whisper") is None:
            raise EngineUnavailableError(
                "engine 'mlx-whisper' is not installed — it requires macOS on Apple Silicon; "
                f"unset {ENGINE_ENV_VAR} (auto) or set it to 'faster-whisper'"
            )
        if settings.model is not None:
            return MlxWhisperTranscriber(model_id=settings.model)
        return MlxWhisperTranscriber()

    if engine == "faster-whisper":
        if probe("faster_whisper") is None:
            raise EngineUnavailableError(
                "engine 'faster-whisper' is not installed — install the faster-whisper "
                f"package or unset {ENGINE_ENV_VAR} (auto)"
            )
        if settings.model is not None:
            return FasterWhisperTranscriber(model_id=settings.model)
        return FasterWhisperTranscriber()

    raise ValueError(
        f"unknown engine {settings.engine!r}; valid values: {', '.join(VALID_ENGINES)}"
    )


def create_app(settings: Settings | None = None, transcriber: Transcriber | None = None) -> FastAPI:
    """Build the app; the static mount is added only when a built frontend exists."""
    resolved = settings or Settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        if resolved.archive_root is not None:
            archive_root = resolved.archive_root
            archive_root.mkdir(parents=True, exist_ok=True)
        else:
            archive_root = ensure_archive_root()
        engine: Transcriber = (
            transcriber if transcriber is not None else select_transcriber(resolved)
        )
        worker = TranscriptionWorker()
        worker.start()
        service = IngestService(archive_root, worker, engine)
        service.recover_at_startup()
        # Warmup rides the serial queue: a free thread here raced the first real job on
        # the same Metal model and corrupted its transcript. Startup stays non-blocking.
        worker.submit("__warmup__", engine.warmup)
        app.state.ingest_service = service
        yield
        worker.stop()

    app = FastAPI(title="voice-notes", lifespan=lifespan)
    app.include_router(api_router)

    @app.middleware("http")
    async def static_cache_policy(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        response = await call_next(request)
        if request.url.path.startswith("/assets/"):
            # Vite content-hashes these filenames: safe to cache forever.
            response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        elif not request.url.path.startswith(f"{API_PREFIX}/"):
            # index.html must revalidate on every load, or long-lived tabs resurrect
            # retired UIs from the browser's heuristic cache (no header = cached).
            response.headers["Cache-Control"] = "no-cache"
        return response

    if resolved.frontend_dist.is_dir():
        app.mount("/", StaticFiles(directory=resolved.frontend_dist, html=True), name="frontend")
    return app


def main() -> None:
    # Env overrides resolve here, once, so bad config fails before uvicorn binds.
    settings = Settings(engine=resolve_engine(), model=resolve_model(), host=resolve_host())
    uvicorn.run(create_app(settings), host=settings.host, port=settings.port)
