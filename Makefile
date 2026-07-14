# First-time setup and daily-driver targets. `make` alone lists them.
# Works on macOS, Linux, and WSL2. Native Windows has no make by default —
# run the three commands from README "Setup" directly (same steps).

.DEFAULT_GOAL := help
.PHONY: help setup run test test-slow check build docker-up docker-down docker-logs

help: ## List available targets
	@awk 'BEGIN {FS = ":.*## "} /^[a-zA-Z_-]+:.*## / {printf "  make %-12s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

setup: ## First-time install: backend deps + frontend build — everything `make run` needs
	uv sync
	@if [ "$$(uname)" = "Darwin" ]; then chflags -R nohidden .venv 2>/dev/null || true; fi  # iCloud-synced folders re-flag .pth files hidden (see README)
	cd frontend && npm install && npm run build

run: ## Serve UI + API on http://127.0.0.1:8477
	uv run voice-notes

test: ## Fast suites: backend (fake engine) + frontend
	uv run pytest
	cd frontend && npm test

test-slow: ## Real-engine tests (first run downloads the model, ~1.5 GB)
	uv run pytest -m slow

check: ## Format check, lint, and types — backend + frontend
	uv run ruff format --check .
	uv run ruff check .
	uv run pyrefly check src tests
	cd frontend && npm run lint

build: ## Rebuild the frontend bundle the backend serves
	cd frontend && npm run build

docker-up: ## Build + serve via compose; archive appears at ~/VoiceNotes (see docker-compose.yml)
	docker compose up -d --build

docker-down: ## Stop the compose service (archive and model cache persist)
	docker compose down

docker-logs: ## Tail the container logs
	docker compose logs -f
