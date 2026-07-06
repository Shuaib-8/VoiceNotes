**Research value: high** -- deep, convergent signal across a fast-moving but well-documented 2026 local-STT ecosystem, plus a rare, structurally decisive cross-domain cautionary tale (Rewind→Meta) that directly bears on the local-first thesis.

### Prior Art
- **Whishper** (pluja/whishper, GitHub) — closest architectural match: 100% local, web-UI transcription suite, Python/faster-whisper transcription-API + backend + frontend containers, v4 adding WhisperX + speaker diarization. Proves the "local Python backend + web UI" shape works but stays batch/file-upload, not voice-note capture+recall.
- **Speaches** (speaches-ai, née faster-whisper-server) — OpenAI-API-compatible local STT/TTS server ("Ollama for TTS/STT"), SSE streaming. Good swappable building block, not a notes product.
- **VoiceInk** (beingpax, GPLv3, 3.7k★) — native macOS, whisper.cpp + switchable Parakeet, system-wide hotkey capture, per-app "Power Mode," $39.99 or free-to-build. Capture-excellent, recall-absent.
- **OpenWhispr**, **FluidVoice** — newer fully-open, cross-platform local dictation apps (Parakeet/Whisper + optional cloud BYOK); crowded, capture-only niche.
- **Hyprnote** (fastrepl, project later split into MIT successor "anarlog") — local-first AI notepad for meetings, live local transcript, offline by default, swappable LLM. Nearest "local-first + AI-enhanced notes" prior art, but meeting-scoped, not personal voice journaling.
- **Voicenotes** (cloud) — the clearest *product-level* template for the target idea: capture → transcribe → "AskMyAI" chat over entire note history + "Related Notes." A detailed critical review (nerdymomocat) found real cracks: no auto-tagging/boolean/tag-scoped search, keyword search misses synonyms ("headache" vs "migraine"), cosine-similarity related-notes breaks on long or bilingual/code-switched notes, alpha-quality offline mobile, and privacy policy silent on transcription being sent to OpenAI despite "no training on your data" promises.
- **AudioPen**, **MacWhisper** — explicitly *not* memory systems (prose-rewrite and batch-file-transcribe respectively), confirming the market still treats "capture→output text" and "capture→searchable memory" as separate categories.

### Adjacent Solutions
- **Screenpipe** (YC S26, OSS Rewind alternative) — 24/7 local screen+audio capture, local SQLite index, fully offline Ollama-powered natural-language recall, zero telemetry. Its capture→local-index→NL-recall loop is directly portable even though its capture domain (screen) differs.
- **Granola** — "jot rough bullets, AI enhances against full transcript" pattern, calendar-based auto-titling, AI-added text visually distinguished and hyperlinked back to the transcript timestamp it came from. Strong portable pattern for trustworthy recall (claims traceable to source audio) and for turning raw transcript into a legible artifact.
- **Obsidian Whisper plugins** (whisper-obsidian-plugin, obsidian-voice-notes) — record/upload → local Whisper → optional local-LLM post-process (grammar, action items) via Ollama/LM Studio. Lightweight template for voice→structured-markdown without a bespoke app.
- **sqlite-vec + FTS5 hybrid search** — multiple independent sources (sqlite-vec author Alex Garcia, Simon Willison, sqlite.ai) converge on FTS5-for-precision + vector-for-recall + Reciprocal Rank Fusion as the standard embeddable local pattern — no server, single file, directly reusable for "recall your notes."
- **Kyutai Unmute** — fully open local voice-agent stack (STT→LLM→TTS, ~450ms latency, Docker Compose, Ollama/vLLM compatible) — reference architecture for a local "chat with your notes" loop.

### Market and Competitor Signals
- **Whisper family**: whisper.cpp is the recommended Mac default (Metal, ~10x realtime on M5 Pro, no Python/CUDA needed); faster-whisper is CPU-only on Mac (no Metal support), ~3x realtime; MLX Whisper squeezes more GPU throughput; distil-whisper remains actively maintained in 2026, ~99% of large-v3 quality at ~6x speed — still the "production balance" pick.
- **NVIDIA Parakeet TDT 0.6B-v3** beats Whisper large-v3 on accuracy (6.32% vs 7.44% WER) at under half the size, 3–10x faster, and was trained on 36k hours of non-speech audio specifically to suppress silence-hallucination — but English-only/25-language vs Whisper's 99. Canary-Qwen-2.5B tops the Open ASR Leaderboard (5.63% WER).
- **Moonshine** (27M–245M params) targets streaming/edge, matches Whisper large-v3 on English at ~6x smaller. **Kyutai STT** (2.6B) does streaming with ~2.5s delay, punctuation, robust to 2-hour audio. **Voxtral** (Mistral, Feb 2026, Apache 2.0, 3B edge / 24B variants) hits 2.1% WER vs Whisper's 2.4%, 13 languages.
- **Apple Silicon frontier is shifting toward CoreML/ANE, not MLX or whisper.cpp**: FluidAudio (Swift SDK, Neural Engine, ~110x realtime for Parakeet-v3 on M4 Pro) and macparakeet show this; one head-to-head on one Mac ranked fluidaudio-coreml (0.19s) < parakeet-mlx (0.50s) < mlx-whisper (1.02s) < whisper.cpp (1.23s) on the same clip — worth re-benchmarking close to build time since rankings are moving fast and current tooling is Swift-first, not Python-first.
- **Dictation-app pricing segmentation**: Wispr Flow (cloud-only, $15/mo, explicitly no offline mode) vs Superwhisper (local-first, $8.49/mo or $249.99 lifetime) vs VoiceInk (OSS, $39.99/free-to-build) — local-first correlates with one-time-cost/free, cloud correlates with subscription.
- **Local embeddings**: BGE-M3 and Qwen3-Embedding lead self-hosted quality; Google's EmbeddingGemma is explicitly positioned for fully-offline on-device personal-assistant RAG.

### Cross-Domain Analogies
- **Rewind AI → Limitless → Meta acquisition (Dec 2025)**: Rewind's entire pitch was "your data never leaves your device"; it pivoted to Limitless hardware/cloud, got acquired by Meta, and killed the Mac app with two weeks' notice to export data, cutting off several regions entirely and forcing remaining users onto Meta's ToS. This is a structurally decisive cautionary tale, not a hypothetical: it's the concrete argument for why a *personal* tool must be genuinely local rather than "local-sounding," and it's why Screenpipe explicitly markets itself as rebuilding what Rewind promised, in the open. Directly load-bearing for any pitch of this project's local-first value.
- **Passive continuous capture (Rewind/Screenpipe) vs. deliberate on-demand capture (this project)**: passive capture buys total recall at the cost of huge always-on storage/index and surveillance-adjacent trust exposure (screen contents, everything heard 24/7); on-demand voice notes trade completeness for lower friction-to-trust. The unmet-needs research below shows users still want passive-capture-grade recall (chat across full history) from deliberate-capture tools — that gap between capture models and recall ambition is a live design tension worth naming explicitly, not solving away.

### Unmet Needs / Opportunity Gaps
- Auto-tagging, tag-scoped/boolean queries, and hybrid keyword+semantic search (toggleable, not forced) are consistently requested and consistently missing or weak in incumbents.
- Semantic "related notes" via naive cosine similarity degrades on long or bilingual/code-switched content — an unresolved gap across the whole landscape, not one vendor's bug.
- Whisper-family hallucination during silence/noise (~1% of transcripts, worse under noise/code-switching, manifests as looping repeated phrases) is a known reliability gap addressable via VAD segmentation (WhisperX-style) or model choice (Parakeet's anti-hallucination training) — an ideation lever independent of UI.
- Privacy claims in this category often don't cover the transcription step itself (Voicenotes sends audio to OpenAI while promising "no training on your data") — a real, fully-local pipeline (capture→transcribe→embed→chat, all on-device) closes a trust gap competitors advertise around but don't structurally deliver.
- No monetization tension: since this is a personal, non-monetized tool, it inherits none of the subscription-vs-lifetime pricing compromises visible across the whole competitive set — a structural advantage worth designing around rather than replicating vendor tiering.

### Sources
- [Whisper.cpp vs faster-whisper 2026 benchmarks](https://www.promptquorum.com/power-local-llm/local-whisper-stt-comparison-2026) — Mac STT implementation comparison
- [mac-whisper-speedtest (GitHub)](https://github.com/anvanvan/mac-whisper-speedtest) — head-to-head Apple Silicon STT benchmark
- [Parakeet vs Whisper: Best Local Speech Model 2026](https://spokenly.app/blog/parakeet-vs-whisper) — accuracy/speed comparison
- [Northflank: Best open source STT model 2026](https://northflank.com/blog/best-open-source-speech-to-text-stt-model-in-2026-benchmarks) — model landscape survey
- [Moonshine GitHub](https://github.com/moonshine-ai/moonshine) and [arXiv 2410.15608](https://arxiv.org/abs/2410.15608) — edge streaming STT
- [Kyutai STT](https://kyutai.org/stt/) and [kyutai-labs/unmute](https://github.com/kyutai-labs/unmute) — streaming STT and local voice-agent stack
- [Voxtral vs Whisper 2026](https://weesperneonflow.ai/en/blog/2026-03-31-voxtral-whisper-open-source-speech-models-comparison-2026/) and [Mistral Voxtral announcement](https://mistral.ai/news/voxtral/)
- [VoiceInk GitHub](https://github.com/beingpax/VoiceInk), [OpenWhispr GitHub](https://github.com/OpenWhispr/openwhispr), [FluidVoice GitHub](https://github.com/altic-dev/FluidVoice)
- [Wispr Flow vs Superwhisper vs MacWhisper 2026](https://spokenly.app/blog/wispr-flow-vs-superwhisper-vs-macwhisper) — dictation app market comparison
- [Voicenotes: Hitting Half of the Right Notes](https://nerdymomocat.github.io/posts/voicenotes-hitting-half-of-the-right-notes/) — detailed user critique/unmet needs
- [AudioPen](https://www.audiopen.ai/), [Voicenotes App Store](https://apps.apple.com/us/app/voicenotes-ai-notes-meetings/id6483293628)
- [Hyprnote GitHub](https://github.com/bahodirr/hyprnote), [anarlog GitHub](https://github.com/fastrepl/anarlog)
- [Whishper GitHub](https://github.com/pluja/whishper), [Speaches GitHub](https://github.com/speaches-ai/speaches)
- [Obsidian Whisper plugin GitHub](https://github.com/nikdanilov/whisper-obsidian-plugin)
- [FluidAudio GitHub](https://github.com/FluidInference/FluidAudio), [macparakeet GitHub](https://github.com/moona3k/macparakeet)
- [Hybrid FTS5 + vector search with SQLite (Alex Garcia)](https://alexgarcia.xyz/blog/2024/sqlite-vec-hybrid-search/index.html), [sqlite-vec GitHub](https://github.com/asg017/sqlite-vec)
- [Granola: Chat with your meetings](https://www.granola.ai/blog/chat-with-meetings-search-analyze-ai-2026) — AI-note UX pattern
- [Screenpipe GitHub](https://github.com/screenpipe/screenpipe) — open-source local Rewind alternative
- [What Happened to Rewind AI](https://rewind.ai/what-happened-to-rewind/) and [9to5Mac: Rewind shutting down](https://9to5mac.com/2025/12/05/rewind-limitless-meta-acquisition/) — Meta acquisition/shutdown case study
- [Whisper Hallucination on Silence](https://dev.to/nareshipme/whisper-hallucination-on-silence-why-your-transcript-loops-the-same-phrase-2pg4) — hallucination mechanics