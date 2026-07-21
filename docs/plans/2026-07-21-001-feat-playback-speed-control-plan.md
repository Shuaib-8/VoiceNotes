---
title: Playback Speed Control - Plan
type: feat
date: 2026-07-21
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# Playback Speed Control - Plan

## Goal Capsule

- **Objective:** Add a playback-speed control (0.5×–2× in 0.25× steps) to the note detail view's audio player, with the chosen speed applied immediately and remembered across notes and sessions.
- **Authority:** This plan → repo conventions (`AGENTS.md`, `DESIGN.md`, `PRODUCT.md`) → implementer judgment. Where the plan is silent on visual detail, `DESIGN.md` governs.
- **Execution profile:** Frontend-only. Two implementation units in dependency order (U1 → U2). No backend, API, or archive changes.
- **Stop conditions:** Stop and surface if the work would require touching the backend, the keyboard map, or persisting anything into `note.md` — each contradicts this plan's scope.
- **Tail ownership:** Work ends at a verified, uncommitted working-tree diff; the owner writes all commits.

---

## Product Contract

### Summary

A compact speed control beside the existing audio player in the note detail view: seven fixed speeds from 0.5× to 2× in 0.25× steps, default 1×, applied live through the audio element's playback rate and persisted as a single owner preference.

### Problem Frame

Re-listening is part of recall — checking a transcript against the take, or skimming a long memo. Today playback speed is only reachable through Chrome's native overflow menu on the `<audio>` element: buried, non-persistent, browser-dependent, and outside the app's design. The backlog has carried this since 2026-07-14 (`docs/ideation/backlog.md`, "Playback speed control"); the speed ladder is owner-specified (YouTube-style: 0.5× floor, 0.25× increments, 2× ceiling).

### Requirements

- R1. The note detail view offers exactly seven playback speeds — 0.5×, 0.75×, 1×, 1.25×, 1.5×, 1.75×, 2× — defaulting to 1×.
- R2. Selecting a speed applies immediately to the current audio, playing or paused, without restarting or reloading it.
- R3. The chosen speed persists across note opens and app sessions; a missing or invalid stored value falls back to 1× without error.
- R4. The control renders only when the note has audio, adjacent to the player.
- R5. The control follows the design system: monochrome (no new chroma), hairline structure, visible focus ring, verified in both light and dark schemes.
- R6. The control is keyboard-operable and exposes the active speed programmatically (WCAG AA defaults per `PRODUCT.md`).

### Scope Boundaries

- No speed hotkeys (e.g. `Shift+<` / `Shift+>`): the documented keyboard map (R, Q, /, Esc) is untouched — `App.tsx`, `Recorder.tsx`, `ShortcutsLegend.tsx`, and the README stay as-is.
- No backend, API, or archive changes; speed is a UI preference and is never written into `note.md` (notes are write-once).
- No changes to the list view, Recorder, or upload flow.
- No custom rebuild of the audio player — the native `<audio controls>` element stays.

#### Deferred to Follow-Up Work

- Speed hotkeys, if wanted later — a change to the keyboard map must update `App.tsx`/`Recorder.tsx`, `ShortcutsLegend.tsx`, and the README's "Using it" section together (repo rule in `AGENTS.md`).

---

## Planning Contract

### Key Technical Decisions

- KTD-1. **Fixed speed ladder as one shared constant.** The seven speeds live in a single exported constant used by the UI, storage validation, and tests. No free-form rate entry — the ladder is owner-specified product behavior.
- KTD-2. **Persistence mirrors the theme pattern.** One global localStorage key, like `voicenotes-theme` in `frontend/src/theme.ts`: validated read in try/catch, silent-degrade write, fallback 1×. Listening speed is a trait of the listener, not of a note — per-note persistence would also need storage the archive contract forbids. Reads validate against the ladder so a corrupted value can never yield an out-of-range rate.
- KTD-3. **Always-visible segmented row with radio-group semantics — not a cycle button, not a menu.** All seven speeds sit in one compact hairline-bordered row, active speed marked. One click reaches any speed (the YouTube mental model), and the active speed is always visible — "state is always honest." Rejected: a cycle button (hides six options; up to six presses) and a disclosure menu (hidden chrome on a flat one-column instrument that bans modal layering). Directional note: native radio inputs styled as the segment give one-of-N keyboard behavior for free; ARIA-role buttons are the fallback if styling fights native inputs — implementer's call.
- KTD-4. **The native player stays; the control drives `playbackRate` through a ref.** The rate is applied whenever the audio element mounts (each note open remounts it) and whenever the selection changes. `playbackRate` is a live property — no reload, no seek, works while paused or playing.
- KTD-5. **No pitch handling.** `preservesPitch` defaults to true in current Chrome (the v1 browser), so sped-up speech stays intelligible with zero code. Revisit only if the real-app check hears pitch distortion.

### Deferred to Implementation

- Exact component API (whether the control receives the audio ref or emits an `onChange` the view applies) — U1's approach leans `onChange`, but the implementer may adjust.
- CSS wrap/compression behavior of the seven-option row at narrow viewports.
- If jsdom's `HTMLMediaElement` proves unable to reflect `playbackRate` in tests, assert through the component's state and the applying effect instead.

---

## Implementation Units

### U1. Speed ladder, persistence helpers, and the PlaybackSpeedControl component

- **Goal:** A self-contained, tested control that renders the seven speeds, marks the active one, and persists changes.
- **Requirements:** R1, R3 (storage half), R5, R6.
- **Dependencies:** none.
- **Files:** `frontend/src/playbackSpeed.ts` (new — ladder constant, storage key, validated read/write), `frontend/src/components/PlaybackSpeedControl.tsx` (new), `frontend/src/components/PlaybackSpeedControl.test.tsx` (new), `frontend/src/App.css`.
- **Approach:** Mirror `theme.ts` for storage (try/catch both directions, validate against the ladder, fallback 1). The component owns selection state initialized from storage, persists on change, and reports the numeric rate upward — keeping it player-agnostic and unit-testable. Labels ("0.5×" … "2×") render in the Label type scale with `tabular-nums`/reserved width so the active-state swap never jitters (Tape Counter Rule); the group carries an accessible "Playback speed" name.
- **Patterns to follow:** `frontend/src/theme.ts` and `frontend/src/components/ThemeToggle.test.tsx` (storage shape and its tests); `DESIGN.md` component rules — hairline border, wash hover, 2px Ink focus ring, no new chroma, both themes.
- **Test scenarios:**
  - Renders all seven options with 1× active when storage is empty.
  - Stored `1.75` → 1.75× active on mount.
  - Clicking 1.5× marks it active, reports 1.5, and writes the storage key.
  - Invalid stored values (`3`, `fast`, empty string) → 1× active, no crash.
  - `localStorage` get/set throwing (private browsing) → control still works for the session, no crash.
  - Keyboard: the control is reachable by Tab, a speed can be activated by keyboard, and the active option is queryable by role/checked state.
- **Verification:** New component tests pass in `frontend` (`npm test`); lint clean. Visual correctness in both themes lands with U2's real-app pass.

### U2. Wire the control into NoteDetail and close out docs

- **Goal:** The control appears beside the player on notes with audio, the persisted speed applies on open and on change, and the backlog row is flipped to done.
- **Requirements:** R2, R3 (apply half), R4.
- **Dependencies:** U1.
- **Files:** `frontend/src/views/NoteDetail.tsx`, `frontend/src/App.test.tsx`, `docs/ideation/backlog.md`.
- **Approach:** Add an audio ref in `NoteDetail`; render the control only when `note.has_audio`; apply the current rate in an effect that runs when the note loads and when the rate changes (the audio element remounts per note, so the effect must re-apply). The control joins normal tab order — no focus stealing; the Focus Doctrine paths (title focus on open, Back/Esc) are untouched.
- **Patterns to follow:** existing `NoteDetail` effect structure; the detail-view tests in `frontend/src/App.test.tsx` (e.g. the `audio-player` src assertion) with `frontend/src/test-helpers.ts`.
- **Test scenarios:**
  - Opening a note with audio shows the speed control and a default `playbackRate` of 1.
  - Selecting 2× sets the audio element's `playbackRate` to 2 without changing its `src`.
  - With `1.5` stored, opening a note applies `playbackRate` 1.5 on mount.
  - A note with `has_audio: false` renders no speed control.
  - Open note A, pick 1.5×, go back, open note B → note B's audio is at 1.5×.
- **Verification:** Full frontend suite, lint, and build green. Real-app check: rebuild `frontend/dist` and restart `uv run voice-notes` first (`docs/solutions/developer-experience/rebuild-frontend-before-verifying-against-running-app.md`), then confirm an audible speed change, persistence across a reload, and both themes. `docs/ideation/backlog.md` "Playback speed control" row moved to `done`.

---

## Verification Contract

| Gate | Command | Proves |
|---|---|---|
| UI tests | `cd frontend && npm test` | R1–R4, R6 scenarios across both units |
| Lint | `cd frontend && npm run lint` | repo conventions |
| Types + build | `cd frontend && npm run build` | explicit return types hold; bundle builds |
| Real app | `cd frontend && npm run build`, then `uv run voice-notes` from the repo root | audible rate change, persistence across reload, both themes (R5) |
| Backend sanity | `uv run pytest` | untouched backend still green |

---

## Definition of Done

- R1–R6 demonstrably satisfied through the test scenarios and the real-app check.
- Both units complete; every Verification Contract gate green.
- Design-system audit clean: no new chroma, no shadows, focus ring present, both schemes verified (`DESIGN.md` Do's and Don'ts).
- `docs/ideation/backlog.md` playback-speed row reads `done`.
- No abandoned experimental code in the diff; the change rests as an uncommitted working-tree diff for the owner to review and commit.
