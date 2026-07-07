# Product

## Register

product

## Users

One person: the owner, on macOS (Chrome, Apple Silicon), capturing thoughts by voice throughout the day — walking in with a memo, uploading a WhatsApp voice note, recording at the desk. Context is "I have a thought, get it down with zero keyboard"; later, "find that note and paste its transcript wherever I'm working." The job: frictionless capture in, frictionless recall out (recall ends in a paste, not an export).

## Product Purpose

Personal, local-first voice notes: record from the mic or upload a voice file, get a transcript within seconds from a local mlx-whisper model, and keep every note as plain files (immutable original audio + markdown transcript) in an archive folder that outlives the app. No cloud, no accounts, no database. Success looks like: a note lands transcribed seconds after you stop talking, every transcript is one click from the clipboard, and the archive stays readable by any tool forever.

## Brand Personality

Warm, personal, archival. This is a private voice journal, not a SaaS console — it should feel like *your* notes: a touch of warmth and materiality in the surface, while staying utilitarian and instant in the workflow. Emotional goals: trust (nothing is ever lost), calm (capture without ceremony), quiet ownership (this is mine, on my machine).

## Anti-references

- **Generic AI-app gloss**: purple gradients, glassmorphism, chat-bubble styling, hero metrics — the saturated AI-tool template. (Note: the current violet accent is inherited from the Vite starter, not a brand decision.)
- **SaaS dashboard**: card grids, stat tiles, marketing polish on a working tool.
- **Apple Notes / Voice Memos clone**: it replaces those apps; it should not read as a knock-off of them.
- **Cold brutalism**: unstyled, stark developer-tool austerity with no warmth at all.

## Design Principles

1. **Capture before chrome.** Recording is the product's one hot path — Record must be the most obvious act on the screen, and nothing may delay or decorate it. Zero keyboard, zero ceremony.
2. **The archive is the truth; the UI is a window.** Notes are immutable plain files that outlive the app. The interface should feel like leafing through a durable personal archive, never like data trapped in an app.
3. **Recall ends in a paste.** Every transcript is one click from the clipboard, from the feed and from the note. Optimize the read-find-copy loop over any browsing aesthetics.
4. **Warmth without gloss.** Personal and material, not corporate or decorated. Delight lives in small moments (the recording pulse, the copy confirmation), never in page-level theatrics.
5. **State is always honest.** Processing, failed, and done are first-class visible states; a failed note stays present with its retry. Nothing pretends, nothing disappears.

## Accessibility & Inclusion

AA defaults: WCAG AA contrast (≥4.5:1 body text, ≥3:1 large text) in both light and dark schemes, `prefers-reduced-motion` honored on every animation, visible focus states on all interactive elements. Single-user personal tool, so no assistive-tech mandate beyond these defaults — but both color schemes are verified, not just the developer's.
