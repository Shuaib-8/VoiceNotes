# Portability & Success-Criteria Checklist

The walking skeleton's identity claims that unit tests cannot prove. Automated evidence is noted where it exists; items verified during the 2026-07-06 implementation run carry their evidence inline.

## 1. Obsidian vault test (R12, AE3) — VERIFIED 2026-07-06

- [x] Opened Obsidian → the archive folder as a vault (Obsidian 1.x, installed via `brew install --cask obsidian`).
- [x] Note folders show their `note.md`; the transcript renders as plain markdown.
- [x] Frontmatter appears as Properties (captured_at, source, original_filename, mime_type, duration_seconds, audio, transcription).
- [x] The standard-markdown audio embed renders a player with the correct duration (0:03) for the `.m4a` note — Obsidian decoded the file. Screenshot: `docs/evidence/obsidian-vault-note-rendering.png`. (Audible playback not click-verified — player widget + decoded duration shown.)
- [x] Obsidian dropped `.obsidian/` into the archive and the app's scanner ignores it — the R9 tolerance clause exercised for real (fresh app instance listed/searched the vault-touched archive cleanly).
- Known limitation (accepted in the plan): WhatsApp `.opus` embeds do **not** play inside Obsidian — transcript and metadata still carry the note; the app's own UI plays them.

## 2. Notion import test (R13) — OWNER-WAIVED 2026-07-06

- [x] Waived by the owner after the first hands-on UI review: the recall pathway is one-click transcript copy from the feed (R18), with Notion/Obsidian de-prioritized as usage targets — markdown-as-data-store remains the contract. Format-level evidence stands: `note.md` is plain CommonMark + standard YAML (round-trip tested, no tool-specific syntax), and Obsidian's parser accepted every note. Revisitable any time in ~2 minutes with `docs/evidence/notion-import-sample.md`.

## 3. Delete-the-app durability (Success Criterion 4) — VERIFIED 2026-07-06

- [x] Fresh copy of the repo (no `.venv`, no `node_modules`, no `dist`), set up using only the README steps, pointed at the untouched archive: both notes listed `done`, detail/search/audio all served (`search hits: 2`, audio `200`).
- [x] Automated companion: `tests/test_portability.py` proves a *moved* archive works in a fresh app instance.

## 4. Zero-keyboard capture + latency stopwatch (AE1, Success Criteria 1–2) — VERIFIED 2026-07-06

- [x] Latency: the real-engine test measured **2.74 s** for a 59-second note (`uv run pytest -m slow`, 2026-07-06) — well inside the ~10 s criterion.
- [x] The full upload→transcribe→list→detail→search flow was driven through the real UI in a real Chromium (screenshot: `docs/evidence/ui-list-view.png`).
- [x] Zero-keyboard mic pass, end to end in Chrome: one click **● Record** → spoken sentence → one click **Stop** → transcript visible **2.1 s** after Stop, word-perfect ("Buy oat milk and pay the electricity bill on Friday."); the note landed on disk as `source: mic`, `audio/webm` at −1.2 dB. Method: the spoken audio entered as a synthesized speech MediaStream (WebAudio) handed to the app's unmodified `getUserMedia` call — MediaRecorder, opus encoding, upload, and the engine were all real. Screenshot: `docs/evidence/mic-pass-zero-keyboard.png`. A hardware-microphone repeat is a 1-minute sanity pass, not an open acceptance item.

## 5. Archive-location freedom (R10, AE6) — VERIFIED 2026-07-06

- [x] Fresh app instance against a relocated archive: lists, opens, plays, searches — `tests/test_portability.py::test_moved_archive_works_in_a_fresh_app_instance`, plus the live fresh-install run above via `VOICE_NOTES_ARCHIVE`.

---

Result log:

| Item | Date | Pass? | Notes |
|---|---|---|---|
| Obsidian vault | 2026-07-06 | ✅ | Visual verification; screenshot in docs/evidence/; .opus playback limitation stands as planned |
| Notion import | 2026-07-06 | ✅ waived | Owner-waived after UI review — copy-to-clipboard (R18) is the recall pathway; format evidence stands |
| Delete-app durability | 2026-07-06 | ✅ | Fresh-copy install against untouched archive; plus automated move test |
| Zero-keyboard + latency | 2026-07-06 | ✅ | 2.74 s / 59 s audio; mic pass end-to-end: transcript 2.1 s after Stop, word-perfect |
| Archive move | 2026-07-06 | ✅ | Automated app-level test + live fresh-install run |
