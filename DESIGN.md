---
name: voice-notes
description: Personal, local-first voice notes — record, transcribe locally, keep forever as plain files.
colors:
  ink: "#150f0e"
  ink-hover: "#302523"
  ink-dark: "#f6f1ef"
  warm-gray: "#776a67"
  warm-gray-dark: "#ada09c"
  paper-white: "#ffffff"
  casing-charcoal: "#211a18"
  hairline: "#e9e3e1"
  hairline-dark: "#3a312e"
  wash: "#f7f0ee"
  wash-dark: "#2a2220"
  record-red: "#e0245e"
  danger: "#b3261e"
  danger-dark: "#f2b8b5"
  done-green: "#14532d"
  done-green-tint: "#e8f5ec"
  done-green-border: "#7fc796"
  done-green-dark-tint: "#12291a"
  processing-amber: "#7a5d00"
  processing-amber-tint: "#fff7e0"
  processing-amber-border: "#e6c651"
  processing-amber-dark-tint: "#3a3013"
  failed-red: "#8c1d18"
  failed-red-tint: "#fdeceb"
  failed-red-border: "#e79790"
  failed-red-dark-tint: "#3c1513"
typography:
  headline:
    fontFamily: "system-ui, 'Segoe UI', Roboto, sans-serif"
    fontSize: "24px"
    fontWeight: 500
    lineHeight: 1.18
    letterSpacing: "-0.24px"
  title:
    fontFamily: "system-ui, 'Segoe UI', Roboto, sans-serif"
    fontSize: "1.4rem"
    fontWeight: 500
  body:
    fontFamily: "system-ui, 'Segoe UI', Roboto, sans-serif"
    fontSize: "18px"
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "0.18px"
  label:
    fontFamily: "system-ui, 'Segoe UI', Roboto, sans-serif"
    fontSize: "0.82rem"
    fontWeight: 400
  mono:
    fontFamily: "ui-monospace, Consolas, monospace"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.35
rounded:
  sm: "4px"
  md: "8px"
  lg: "10px"
  xl: "12px"
  pill: "999px"
spacing:
  xs: "0.25rem"
  sm: "0.6rem"
  md: "0.75rem"
  lg: "1rem"
  xl: "1.5rem"
components:
  button-default:
    backgroundColor: "{colors.paper-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0.45rem 0.9rem"
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper-white}"
    rounded: "{rounded.md}"
    padding: "0.45rem 0.9rem"
  button-secondary:
    backgroundColor: "{colors.wash}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0.45rem 0.9rem"
  button-record:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper-white}"
    rounded: "{rounded.md}"
    padding: "0.6rem 1.4rem"
  chip-done:
    backgroundColor: "{colors.done-green-tint}"
    textColor: "{colors.done-green}"
    rounded: "{rounded.pill}"
    padding: "0.15rem 0.55rem"
  chip-processing:
    backgroundColor: "{colors.processing-amber-tint}"
    textColor: "{colors.processing-amber}"
    rounded: "{rounded.pill}"
    padding: "0.15rem 0.55rem"
  chip-failed:
    backgroundColor: "{colors.failed-red-tint}"
    textColor: "{colors.failed-red}"
    rounded: "{rounded.pill}"
    padding: "0.15rem 0.55rem"
  note-card:
    backgroundColor: "{colors.paper-white}"
    rounded: "{rounded.lg}"
    padding: "0.7rem 0.9rem"
  input-search:
    backgroundColor: "{colors.paper-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0.4rem 0.7rem"
---

# Design System: voice-notes

## 1. Overview

**Creative North Star: "The Pocket Field Recorder"**

This interface is a trusted instrument, not a destination. Like a field recorder you carry in a pocket: black hardware, one red lamp, one obvious key, honest little status lights, and a spool of labelled recordings you can flip through. Press record and it just works; everything else stays out of the way. The register is product — design serves the task (record → transcript → copy) — but the warmth of the instrument matters: this is a *personal* archive on your own machine, not a SaaS console.

The system is **monochrome by doctrine**: ink on paper (or warm near-white on casing charcoal in dark mode), every neutral tinted a breath toward the REC lamp's rose hue — warmth carried subliminally, never as cream. Color exists only where it means something: the red lamp, the three status chips, danger. Structure is 1px hairlines; the field is flat. Status is always honest: processing, failed, and done are first-class chips, a failed note keeps its retry, and delete is a move to `.trash`, never an erasure. The Vite starter's violet accent was retired on 2026-07-06 — actions are Ink now.

**Key Characteristics:**
- Capture before chrome: Record is the most obvious act on screen — the ink key with the red glyph.
- One narrow column; hairline borders carry all structure; flat by doctrine.
- Monochrome instrument: Ink actions, paper surfaces; chroma is reserved for state.
- System-ui typography at a generous 18px base — legible, native, unbranded.
- Quiet and tactile components: soft radii (8–12px), generous hit areas, wash-tint hover feedback.

## 2. Colors

A monochrome instrument with one lamp: ink and rose-warmed neutrals do all the work; the only saturated color on screen is state.

### Primary
- **Ink** (#150f0e light / #f6f1ef dark, hover #302523): THE action color. Primary buttons (Record, Stop), focus rings, headings, transcript text. White text on light-Ink measures ~18:1; charcoal on dark-Ink ~15:1 — contrast is structural, not audited-in. Derived in OKLCH at hue 20 (the REC lamp's warmth), chroma ≤0.01.

### Neutral
All neutrals carry 0.004–0.012 chroma toward hue 20 — the palette's warmth comes from the brand's own red, not from generic cream.
- **Warm Gray** (#776a67 light / #ada09c dark): supporting text and metadata. Verified 5.2:1 on paper, 6.8:1 on charcoal.
- **Paper White / Casing Charcoal** (#ffffff / #211a18): the page. Paper is honest chroma-0 white; the charcoal is the instrument's warm casing.
- **Hairline** (#e9e3e1 / #3a312e): 1px borders that do all structural work.
- **Wash** (#f7f0ee / #2a2220): hover feedback, secondary-button fill, quiet surfaces.

### Semantic (status)
- **Record Red** (#e0245e): the ● glyph on the record key and the pulsing REC lamp. Nothing else, ever.
- **Done Green** (#14532d on #e8f5ec, border #7fc796; dark: #7fc796 on #12291a): a completed transcript.
- **Processing Amber** (#7a5d00 on #fff7e0, border #e6c651; dark: #e6c651 on #3a3013): transcription in flight.
- **Failed Red** (#8c1d18 on #fdeceb, border #e79790; dark: #e79790 on #3c1513): a note whose transcription failed — always beside its Retry.
- **Danger** (#b3261e light / #f2b8b5 dark): inline error text and the destructive-confirm affordance. 6.5:1 / 10:1 verified.

### Named Rules
**The Monochrome Instrument Rule.** The interface is ink, paper, and hairlines. Chroma appears only as state: the REC lamp, the three chip triads, danger. A new feature that "needs a color" needs a better design instead.

**The REC Lamp Rule.** Record Red appears in exactly two places — the record key's ● glyph and the live pulsing lamp — and both mean the same thing: recording. Its exclusivity is what makes the state unmistakable.

**The Two-Reds Rule.** Record Red (#e0245e, rose) and Danger/Failed red (#b3261e/#8c1d18, blood) are different hues on purpose: one means "live", the other means "wrong". Never substitute one for the other.

## 3. Typography

**Display Font:** none — this system has no display register.
**Body Font:** system-ui ('Segoe UI', Roboto fallbacks)
**Label/Mono Font:** ui-monospace (Consolas fallback)

**Character:** Native, quiet, and generous. One family carries everything — the tool should read like the OS, not like a website. Warmth comes from the 18px base size and roomy 1.45 line-height, not from a typeface.

### Hierarchy
- **Headline** (500, 24px, 1.18, -0.24px): the note title on the detail view.
- **Title** (500, 1.4rem): the app header. Fixed rem scale — this is product UI; nothing is clamp-fluid. The wordmark is **"VoiceNotes"** — one word, capital V and N (owner's decision, 2026-07-07). `voice-notes` is the package/CLI name only; never render it in the UI.
- **Body** (400, 18px, 1.45, +0.18px; 16px below 1024px): transcripts and prose. Transcript paragraphs run in Ink, not Warm Gray — reading the transcript is the product.
- **Label** (400, 0.75–0.85rem): chips (lowercase), note metadata, hints.
- **Mono** (400, 15px, 1.35): the elapsed-time counter.

### Named Rules
**The Tape Counter Rule.** Every duration and elapsed time renders in `font-variant-numeric: tabular-nums` with a reserved minimum width, so the counter never jitters while recording. The same doctrine covers state-swapping labels: the Copy button reserves its widest label's width.

**The One Family Rule.** No second typeface, no display font, no font pairing. Hierarchy is built from size, weight (400/500/600), and color (Ink vs Warm Gray) alone.

## 4. Elevation

Flat by doctrine. There are no shadows anywhere in this system: structure is conveyed by 1px hairline borders, background tints (chip tints, wash, code wash), and dashed borders for "not yet" surfaces (dropzone, empty state). Depth cues would suggest layers and panels — wrong for an instrument whose whole surface is one honest face. The starter's dead `--shadow` token was removed on 2026-07-06.

### Named Rules
**The Flat Field Rule.** No `box-shadow`, no elevation ramps, no glass. If a surface needs separation, it earns a hairline or a tint. Test: if a screenshot shows any blur under any element, the rule is broken.

## 5. Components

Quiet and tactile: soft radii, generous hit areas, gentle feedback. Controls should feel like the well-worn buttons of a device used daily — obvious, sturdy, never decorated. Every interactive element has default, hover (wash shift), focus-visible (2px Ink ring, 2px offset), and active states.

### Buttons
- **Shape:** gently rounded (8px); padding 0.45rem 0.9rem; font inherits body; 150ms ease-out background transitions (none under reduced motion).
- **Default:** paper with hairline border, Ink text — the workhorse (Copy, Delete trigger, Try again). Hover: wash.
- **Primary:** Ink fill, paper text — reserved for the one advancing action (Record / Stop). Hover: ink-hover.
- **Record key:** the primary variant, larger (1.05rem, 0.6rem 1.4rem) with the Record Red ● glyph — the biggest target on the screen, per "capture before chrome".
- **Secondary:** wash fill with hairline border, Ink text — supporting actions (Search, Back, Retry, Cancel). Hover: hairline fill.
- **Danger confirm:** paper fill, Danger text and border — appears only inside a two-step confirm, never as a resting state.

### Chips (status)
- **Style:** pill (999px), 0.75rem lowercase text, tinted background with matching darker border and deep text of the same hue; separate tint sets per scheme (all triads in Colors Semantic). Borders are shared across schemes.
- **State:** exactly three: processing (amber), failed (red), done (green). A chip is a fact, not a control.

### Cards / Containers
- **Note card:** hairline border, 10px radius, 0.7rem 0.9rem padding; two columns — `.note-main` (title, meta) left, `.note-side` (chip, Copy, Delete) stacked right. Interactive only when done — the title underlines on hover *and* focus.
- **Capture surface:** hairline border, 12px radius — recorder and dropzone share one surface at the top of the feed.
- **Empty state / dropzone:** dashed hairline — "nothing here yet" is always dashed, teaching the interface. While a file is dragged over it, the dropzone answers: wash fill, solid hairline, hint swaps to "drop to add it to the archive."
- **Loading:** flat, static skeleton rows (dashed border, wash lines) in both the list and the note detail — never a blank flash, never a spinner mid-content.
- **Shadow Strategy:** none (see Elevation).

### Inputs / Fields
- **Search:** hairline border, 8px radius, 0.4rem 0.7rem padding, inherits body font; min-width 12rem.
- **Focus:** the system 2px Ink ring.
- **Error:** inline Danger text adjacent to the control, never a toast.

### Navigation
- None by design: one screen, with the note detail overlaying the (hidden, state-preserved) list. Back is a secondary button. No router, no nav chrome — do not add any.

### The Recording Indicator (signature)
A 12px Record Red dot pulsing at 1.2s beside a tabular-nums elapsed counter. Under `prefers-reduced-motion` the lamp stays lit, steady — state without pulse.

### Theme Toggle
A quiet icon button (sun/moon, secondary style) at the header's end — after search in tab order, because the task outranks the preference. The resolved theme: the owner's stored choice (`voicenotes-theme` in localStorage, applied pre-paint by an index.html boot script and via `data-theme` on `<html>`) beats the OS scheme; with no stored choice the OS decides. Every themed rule ships three ways: `@media (prefers-color-scheme: dark) :root:not([data-theme='light'])`, `:root[data-theme='dark']`, and a `color-scheme` flip so form controls follow.

### Search Results (recall surface)
Each match shows the transcript fragment around the hit (`match_snippet`, ±45 chars) under the title, with the matched words emphasized by weight and ink — never highlighter yellow (`mark` is transparent). A quiet × inside the field clears the query in one click. Keyboard: `/` focuses search; `R` is one key in both directions — Record while idle, Stop while recording; `Q` cancels the take by pressing the Cancel button for you — same rules, a short take discards at once, a longer one asks first (all list view only, never while typing, absent during the discard confirm; `aria-keyshortcuts` + title hints throughout). Inside the field, Esc clears the query, and a second Esc steps out onto the Search button — never onto `<body>`. Submitting a search lands focus on the first openable hit: recall ends in a paste, not in Tab-Tab-Tab. Esc also backs out of the note detail (hinted on the Back button); when a note is open over a still-pending discard confirm, the most-recently-opened layer unwinds first — Esc closes the note, and a second Esc (now on the list) collapses the confirm.

### Note Metadata (list + detail)
List stamps are relative and second-free — "Today 14:32", "Yesterday 09:12", then "6 Jul, 14:32" (year added once it differs) — because recall thinks in "yesterday", not ISO. The detail view is the archival record: full absolute date, still no seconds. Machine internals never lead: the detail meta is date · duration, with provenance demoted to a second quieter line in plain words ("recorded from the mic · transcribed by Whisper large-v3-turbo" — model names humanized, `mlx-community/` never rendered). Durations everywhere obey the Tape Counter Rule.

### Focus Doctrine
Focus is never abandoned to `<body>`: opening a note focuses its title (`h2[tabindex="-1"]`), Back/Esc returns focus to the exact opener (`data-note-open`), Keep/Esc in a delete confirm returns it to the Delete trigger, "Keep recording"/Esc in the discard confirm returns it to Cancel, and a silent cancel (mouse or `Q`) lands focus on Record rather than `<body>`. Confirms collapse on Esc or focus-out — never on a hidden timer — with one named exception: the recorder's discard confirm ignores focus-out and stays up (the recording keeps running either way; Esc still collapses it back to Cancel).

### Delete (trash, never erase)
A quiet Delete trigger (default button, Danger only on hover) opens a two-step inline confirm — "Move to trash?" with **Move to trash** (danger-styled) and **Keep** (focused by default, so a reflexive Enter does no harm). A quiet hint states the consequence: the note stays recoverable in the archive's `.trash` folder. The confirm collapses on Esc or focus-out, handing focus back to its trigger — never on a hidden timer (Focus Doctrine). After the move, a hairline trace row takes the card's place — "«title» moved to trash." with an **Undo** button that receives focus, so a reflexive Enter reverses the delete (`POST /api/notes/{id}/restore` renames the folder back; focus then lands on the restored note's opener). Recovery is performed in-app, not just promised. Server-side, delete is a rename into `.trash/`, honoring "nothing is ever lost."

## 6. Do's and Don'ts

### Do:
- **Do** keep Record the most obvious act on every screen — biggest target, Ink fill, red glyph, zero steps in front of it.
- **Do** render transcripts in Ink at full body size (18px/1.45, ≤75ch) — reading the transcript is the product.
- **Do** verify every color in **both** schemes; the dark palette is first-class, not derived.
- **Do** honor `prefers-reduced-motion` on every animation — the REC lamp goes steady, transitions drop.
- **Do** give every interactive element the 2px Ink `:focus-visible` ring — keyboard recall is first-class.
- **Do** keep failed notes visible with their retry action, and route every delete through the two-step trash confirm; state is always honest.
- **Do** use `tabular-nums` and reserved widths for anything that changes while watched (The Tape Counter Rule).

### Don't:
- **Don't** ship *generic AI-app gloss*: purple gradients, glassmorphism, chat-bubble styling, hero metrics — PRODUCT.md names these verbatim as anti-references. The violet is gone; do not let it back in.
- **Don't** turn the feed into a *SaaS dashboard*: no card grids, no stat tiles, no marketing polish on a working tool.
- **Don't** imitate *Apple Notes / Voice Memos* — this replaces them; it must not read as a knock-off.
- **Don't** swing to *cold brutalism*: the monochrome is warmed toward the lamp's hue and cushioned by tactile states — keep both.
- **Don't** introduce a new chromatic accent (The Monochrome Instrument Rule) — and never put sub-AA text on any fill.
- **Don't** add shadows, elevation, or glass (The Flat Field Rule).
- **Don't** use Record Red outside the record glyph and the live lamp (The REC Lamp Rule), and never swap it with Danger red (The Two-Reds Rule).
- **Don't** add decorative motion, page-load choreography, side-stripe borders (`border-left` > 1px as accent), or gradient text — banned outright.
- **Don't** add navigation chrome, routers, or modals; the one-column overlay model is the design — even the delete confirm is inline, not a modal.
