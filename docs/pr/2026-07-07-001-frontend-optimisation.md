# Frontend optimisation: designed UI, trash/undo, search recall, backend hardening

**Branch:** `worktree-frontend-optimisation` · **Base:** `42c85b7` (Initial Commit)
**Trace:** [walking-skeleton plan](../plans/2026-07-06-001-feat-voice-notes-walking-skeleton-plan.md) → `PRODUCT.md` + `DESIGN.md` → this branch.
**Status:** green across `uv run pytest` (81), `npx vitest run` (46), ruff + pyrefly + oxlint, and `tsc -b` + vite build.

This document is the *why*. The diff shows the *what*; read this for the decisions and traps a future
reader (human or agent) can't recover from the code alone.

---

## Summary

Turns the walking-skeleton UI into a designed, honest, keyboard-driven interface, and hardens the
backend seams the new delete/undo/search features exposed. Three quality passes ran on the work:
impeccable critique (score **24 → 31 → 36 / 40**), `ce-simplify-code` (9 behaviour-preserving
simplifications), and `ce-code-review` (11 reviewers; 4 real P2s + several P3s fixed and tested).

## What changed (grouped)

- **Design system, now governed.** New `PRODUCT.md` (register: product) and `DESIGN.md` (North Star
  "The Pocket Field Recorder": monochrome instrument, single 640 px hairline column, chroma reserved
  for state, starter violet retired). `AGENTS.md` gained a Design Context section pointing at both.
- **Frontend reskin + features.** Every component/view moved onto the design system (light + dark);
  new `ThemeToggle` + `theme.ts` (persisted, follows OS when unset, live-subscribes), `DeleteNoteButton`,
  `ContextSuffix` (distinct accessible names per icon button), `format.ts` (human stamps, `humanizeModel`,
  `describeSource`). Header regression fixed (`voice-notes` → `VoiceNotes`).
- **Delete = trash + inline Undo.** `DELETE` / `POST …/restore` routes; recoverable rename into `.trash`;
  409 mid-transcription; honest inline Undo trace.
- **Search recall.** `normalize_query`, match-snippet extraction with query highlight, title-derivation,
  first-hit focus on submit, title-echo snippet suppression.
- **Backend hardening (from review).** `scan_archive` mid-scan race guard; traversal-tightened note-id
  regex; `Cache-Control` middleware (no-cache shell, immutable hashed assets).

## Non-obvious decisions & gotchas (read this before extending)

1. **HTTP handlers run on a threadpool → archive reads race renames.** FastAPI runs each
   `run_in_threadpool` handler on its own thread, so a delete/restore `os.rename` can fire while
   `scan_archive` walks the same directory (the 2 s poll routinely overlaps a delete). `scan_archive`'s
   loop body is wrapped in `try/except OSError: continue`; **any new read path must do the same** or a
   note trashed mid-walk 500s list/search/get. Guarded by `test_scan_skips_a_folder_removed_mid_scan`.

2. **`note_id` is URL-supplied — treated as hostile.** `_NOTE_FOLDER_PATTERN` excludes path separators
   (`[^/\\]+`), so `_validated_note_dir` can only ever resolve a single component under the archive
   (never `a/../b`). Keep the class tight; keep the docstring truthful. Guarded by
   `test_folder_pattern_refuses_path_separators`. (The HTTP router also 405s a slash-bearing id, but the
   regex is the guarantee the code owns.)

3. **Focus Doctrine — focus never drops to `<body>`.** Every note card carries `data-note-id` +
   `tabIndex={-1}`; openable cards additionally carry `data-note-open`. `focusAfterPaint(...selectors)`
   takes ordered fallbacks so a restored note lands focus on its opener, or its card when the note
   **failed** (no opener). This is silent when broken — only the keyboard/SR path notices.

4. **Undo is honest about its own outcome.** The trace is an `'idle' | 'undoing' | 'failed'` status, not
   an optimistic clear. It disables mid-flight (no double-restore) and, if `restore` fails (the trash
   entry moved in Finder), keeps the notice and names the failure instead of pretending the note came
   back. Ties to PRODUCT principle "state is always honest."

5. **Delete = trash, never erase.** Destroying the only copy of user audio is unacceptable, so "delete"
   is a rename into `<archive>/.trash/` (collision-suffixed, recoverable, 409 while transcribing). The
   archive contract's write-once durability still holds: notes are never mutated in place.

6. **Harness/tooling gotchas that cost time here.**
   - The PostToolUse ruff hook strips as-yet-unused imports, so **edit the usage before adding the
     import** (bit us on `normalize_query`, `restore_note_folder`, `JobRecord`, `Field`).
   - `chflags -R nohidden .venv` before `uv run` (macOS `UF_HIDDEN` re-flags `.pth` files → import fails).
   - All MLX/Metal work — including warmup — stays serialized on the single worker queue.

## Testing & verification

- Backend **81 passing**: added archive trash/restore, traversal-rejection, mid-scan-race, title tests.
- Frontend **46 passing**: added delete/undo, honest undo-failure, failed-note focus fallback,
  note-open title focus, theme, format, dropzone tests.
- Live smoke on `:8477`: `GET /api/notes` → 200 (was the race 500), traversal id → 405, health OK,
  served shell references the rebuilt bundle.
- Design-critique evidence under `docs/evidence/critique3/` (the assessment set behind the 36/40
  score). Walking-skeleton acceptance shots under `docs/evidence/` are indexed from
  `docs/portability-checklist.md`. (The interim `redesign-*.png` snapshots were dropped as noise.)

## Deliberate non-fixes (do not "fix" these without cause)

- **`allocate_note_folder` suffix loop** — that loop *is* the atomic `mkdir(exist_ok=False)` write-once
  guarantee. A dedupe "simplification" would break it. Left as-is on purpose.
- **Per-request full `scan_archive`** (get/audio/retry re-scan) — fine at localhost single-user scale;
  add a write-invalidated cache only if archives grow large.
- **`delete_note` not catching trash-rename `FileExistsError`** — unreachable unless a foreign process
  puts a *non-directory* file at `.trash/<name>`; a guard would be churn without a real trigger.

## Merge-time reconciliation (required before this lands on `main`)

`main` is one commit ahead (`75a6e39 "Setup Agent file configs"`) that this branch is based *before*.
That commit added `.gitignore` lines, `AGENTS.md`, and `CLAUDE.md`. Expect an add/add + modify/modify
merge; resolve as:

- **`AGENTS.md`** — keep **this branch's** version (superset: it adds the Design Context + the two new
  gotchas + frontend invariants). `main`'s is a strict subset.
- **`CLAUDE.md`** — identical on both sides; either resolves cleanly.
- **`.gitignore`** — **union both** additions: this branch's `# impeccable` / `.impeccable/` **and**
  `main`'s `# claude` / `.claude/` + `.claude/worktrees/`. (This branch, based on `42c85b7`, is missing
  the `.claude/` block — don't let the merge drop it.)

Recommended: rebase the branch onto `75a6e39` before opening the eventual PR so the branch→main merge is
a clean fast-forward. No git remote exists yet — add one (or `git init` a remote) to open an actual PR;
until then this file is the reference and can seed the merge-commit message.

## Follow-ups

- Add a git remote and open the PR proper.
- Revisit the scan-cache (non-fix #2 above) if/when archive size grows.
