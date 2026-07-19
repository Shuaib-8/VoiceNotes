---
title: "Rebuild frontend/dist before verifying UI changes against the running app"
date: 2026-07-19
category: developer-experience
module: frontend build/serve/verify loop
problem_type: developer_experience
component: development_workflow
severity: medium
applies_when:
  - "Verifying a frontend change against the running app (uv run voice-notes) or a browser (Playwright/manual)"
  - "You edited frontend source and ran tsc/tests/lint but not npm run build"
  - "Real-app behavior contradicts the current source and passing unit tests"
tags: [frontend, vite-build, dist, verification, playwright, stale-artifact, uv-run-voice-notes]
related_components: [frontend, fastapi_static_serving]
---

# Rebuild frontend/dist before verifying UI changes against the running app

## Context

The FastAPI backend serves the prebuilt frontend from `frontend/dist/` (a gitignored Vite build artifact) via `StaticFiles`. `uv run voice-notes` serves whatever `dist/` currently contains — there is no build-freshness check at serve time. Nothing in the normal edit-and-check loop regenerates `dist/`: `npx tsc -b`, `uv run pytest`, `cd frontend && npm test` (Vitest), and `npm run lint` all validate **source** (`.ts`/`.tsx`), never the compiled bundle. Only `cd frontend && npm run build` (which runs `tsc -b` **and** `vite build`) regenerates `dist/`.

This surfaced while verifying a keyboard-shortcut feature end-to-end in a real browser (Playwright). A just-applied Esc-handling fix appeared **broken** in the running app — one Escape both closed the open note and collapsed the discard confirm (the exact double-fire the fix removed) — even though the source was correct and all unit tests were green. Root cause: `dist/` had last been built before that fix (and two other same-session changes) landed. The fix-applying steps had run `tsc -b`/tests but not `npm run build`, so the served bundle was stale compiled code. `npm run build` + restarting the server made the browser match source, and the fix verified correct.

## Guidance

Before verifying any frontend change against the running app or a browser, **rebuild the bundle and restart the server**:

```bash
cd frontend && npm run build && cd ..   # regenerates frontend/dist/ (tsc -b + vite build)
# restart uv run voice-notes so it picks up the fresh dist/
```

Optionally confirm the served bundle actually changed — Vite content-hashes asset filenames, so a changed hash between builds proves a fresh compile:

```bash
ls frontend/dist/assets/index-*.js   # e.g. index-B18xasBC.js -> index-3V_1k0Gg.js after a real rebuild
```

Treat "green source + stale `dist/`" as a first-class hypothesis whenever real-app behavior disagrees with the source and unit tests. Check the `dist/` build time against your last source edit before concluding the code is wrong.

## Why This Matters

A stale `dist/` makes real-app verification lie in **both** directions:

- **False negative** — a correct fix looks broken (what happened here), sending you to "fix" code that is already right.
- **False positive** — an old bug looks fixed, or an old fix looks present, so a regression or a not-yet-built change passes a manual/browser check it should have failed.

Unit tests and type-checks cannot catch this: they run against source, so they stay green while the served artifact lags. The verification pass is supposed to be the backstop that catches what tests miss; a stale bundle silently defeats it. Because `dist/` is gitignored this is a **local-run concern only** — CI, `make run`, and `make setup` build fresh — but any agent or developer doing local real-app verification after touching frontend source is exposed.

## When to Apply

- Any manual or Playwright verification of frontend behavior against `uv run voice-notes`.
- Immediately after applying frontend source edits (feature work, review fixes, refactors) and before trusting a real-app observation.
- Whenever a browser/manual result contradicts the source and a passing `npm test`.

## Examples

Stale-bundle failure vs. fresh-bundle success for the same source and the same test sequence (record a take past the confirm threshold, press the cancel shortcut to raise the discard confirm, open a note, then press Escape once):

```text
Against a dist/ built BEFORE the fix (stale):
  one Escape -> note closes AND confirm collapses   (looks like the fix failed)

After `cd frontend && npm run build` + server restart (fresh):
  one Escape -> note closes, confirm stays up        (fix works; second Escape collapses it)
```

The source and the unit tests were identical in both runs — only the served `dist/` differed.

## Related

- `AGENTS.md` already notes that `frontend/dist/` (gitignored) *must exist* for `uv run voice-notes` to serve the UI; the compounding refinement is that it must also be **rebuilt after source changes**, not merely exist.
- Adjacent local-run gotcha when restarting the server on this machine: `uv run voice-notes` can fail with `ModuleNotFoundError: No module named 'voice_notes'` due to macOS `UF_HIDDEN` flags on the venv — fix with `chflags -R nohidden .venv` (see README "Setup").
