# Optional server/repro distribution (R14) — explicitly NOT the Windows path;
# Windows runs natively via uv. Built and smoke-tested in CI so it cannot rot
# silently (R15). Official uv multi-stage pattern, pinned versions (KTD-9).
#
# Layout invariant: Settings.frontend_dist resolves to <project-root>/frontend/dist
# relative to the installed source tree, and the venv's editable install points at
# /app/src — so the runtime stage must carry /app (source + venv) and the built
# frontend must land at /app/frontend/dist, or the UI silently fails to mount.

# --- Stage 0: frontend build (dist/ is gitignored; the image must build it) ---
FROM node:22-bookworm-slim AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# --- Stage 1: Python dependencies + project (uv, from the committed lock only) ---
FROM python:3.12-slim AS builder
COPY --from=ghcr.io/astral-sh/uv:0.11.28 /uv /uvx /bin/

ENV UV_LINK_MODE=copy \
    UV_COMPILE_BYTECODE=1

WORKDIR /app
RUN --mount=type=cache,target=/root/.cache/uv \
    --mount=type=bind,source=uv.lock,target=uv.lock \
    --mount=type=bind,source=pyproject.toml,target=pyproject.toml \
    --mount=type=bind,source=README.md,target=README.md \
    uv sync --locked --no-install-project --no-dev

COPY pyproject.toml uv.lock README.md ./
COPY src ./src
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-dev

# --- Stage 2: runtime ---
FROM python:3.12-slim

# ctranslate2 hard-requires OpenMP; slim images do not ship libgomp.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=builder /app /app
COPY --from=frontend /app/frontend/dist /app/frontend/dist

# Model cache and archive live under /data, mounted at run time (docker-compose.yml
# binds the archive to ~/VoiceNotes and keeps the cache in a named volume): model
# swaps survive container recreation and never force an image rebuild (KTD-9).
# No VOLUME directive — compose mounts /data/archive and /data/hf-cache separately,
# and a declared VOLUME /data would spawn a stray anonymous volume on every run.
ENV PATH="/app/.venv/bin:$PATH" \
    HF_HOME=/data/hf-cache \
    VOICE_NOTES_ARCHIVE=/data/archive \
    VOICE_NOTES_HOST=0.0.0.0

EXPOSE 8477

CMD ["voice-notes"]
