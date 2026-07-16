---
title: "Docker Compose bind-mount default: use $HOME, not a bare ~"
date: 2026-07-14
category: integration-issues
module: docker-compose
problem_type: integration_issue
component: tooling
symptoms:
  - "Archive does not appear at ~/VoiceNotes on the host as documented"
  - "On some Compose versions, notes land in a literal directory named '~' under the project folder"
  - "Behavior differs between machines with the same docker-compose.yml — 'works on mine'"
  - "No error is raised; the wrong bind-mount source is created silently"
root_cause: config_error
resolution_type: config_change
severity: high
tags: [docker, docker-compose, bind-mount, home-directory, tilde-expansion, variable-interpolation, portability, container]
related_components: [archive, deployment]
---

# Docker Compose bind-mount default: use $HOME, not a bare ~

## Problem

The compose file promises the archive appears at the host's `~/VoiceNotes` — native-identical layout. A default written as `${VOICE_NOTES_DIR:-~/VoiceNotes}` relies on Docker Compose expanding a leading `~` to the home directory. Compose does **not** guarantee that: `~` expansion is a shell feature, not part of Compose's `${VAR:-default}` interpolation contract. On a Compose version that treats `~` literally, the bind mount silently sources from a directory literally named `~` under the project folder instead of the user's home — no error, wrong location.

## Symptoms

- The documented `~/VoiceNotes` archive folder never appears in the host home directory after `docker compose up`.
- On an affected Compose version, a directory literally named `~` is created under the compose project directory and notes accumulate there.
- Two machines running the byte-identical `docker-compose.yml` disagree on where the archive lands — a classic version-dependent "works on my machine."
- The failure is silent: no interpolation warning, no mount error. The container writes happily to the wrong host path.

## What Didn't Work

Assuming `~` behaves the same as it does in a shell. It doesn't, and the confusion is compounded by version drift: on **Docker Compose v5.1.2** (the version on the dev machine, verified live with `docker compose config`) a bare `~` *is* expanded to the home directory, so the original `~/VoiceNotes` default appeared to work in local testing. That green result is a trap — it proves the config works on *one* Compose version, not that it is portable. A first-time cloner on an older or more spec-strict Compose build would silently get the wrong mount. Testing on the machine that happens to expand `~` cannot surface a defect that only appears where it doesn't.

## Solution

Interpolate `$HOME` instead of relying on `~` expansion. `$HOME` is an environment-variable substitution, which is core Compose `${VAR:-default}` behavior and works identically on every version. In `docker-compose.yml`:

BEFORE:
```yaml
volumes:
  - "${VOICE_NOTES_DIR:-~/VoiceNotes}:/data/archive"   # bare ~ — expansion is version-dependent
```

AFTER (`docker-compose.yml:25`):
```yaml
volumes:
  - "${VOICE_NOTES_DIR:-$HOME/VoiceNotes}:/data/archive"
```

Verified with the real tool on both forms:

```bash
docker compose config    # default -> /Users/<you>/VoiceNotes ; VOICE_NOTES_DIR=/custom -> /custom
```

The accompanying comment in the file states the rationale so the next editor does not "simplify" it back to `~`, and flags the one edge case: set `VOICE_NOTES_DIR` explicitly on any host where `$HOME` is unset.

## Why This Works

`${VAR:-default}` interpolation and `~` expansion are two different mechanisms. Compose *always* interpolates `$HOME` / `${HOME}` from the environment — that is the documented, portable behavior of its variable syntax. A leading `~`, by contrast, is tilde expansion, which is a shell-level convenience Compose is under no obligation to perform; whether it does is an implementation detail that has changed across versions. Swapping `~` for `$HOME` moves the default from the undefined-behavior path onto the guaranteed one, resolving to the identical directory on the machine where `~` already worked while also being correct where it wouldn't. Zero downside, one less version-dependency.

## Prevention

- **Config rule**: in any Compose file, write host-home paths as `$HOME/...`, never a bare `~/...`. The same applies to any env-var default that must resolve to a real path — prefer an interpolated variable over a shell-expansion glyph (`~`, `*`, brace expansion) that Compose does not promise to process.
- **Test the mechanism, not the machine**: `docker compose config` renders the fully-interpolated config without starting anything. Assert the resolved path is what you intend — it would have shown `~/VoiceNotes` collapsing to a literal `~` on an affected version. A green `up` on a `~`-expanding host is not evidence of portability.
- **Coverage gap that let this land**: CI builds and boot-smokes the image with `docker build` / `docker run`, but never exercises `docker-compose.yml` at all — so the compose default is untested by automation. Cheapest fix: add a `docker compose config` assertion (or a grep for the resolved archive path) to the Docker CI job. Until then, compose changes need a manual `docker compose config` check.
- **Document the `$HOME`-unset edge**: containers/CI runners with no `HOME` set will interpolate `$HOME` to empty, yielding `/VoiceNotes`. The compose comment tells users to set `VOICE_NOTES_DIR` explicitly there; keep that note truthful if the default changes.

## Related Issues

- The archive-location contract (`~/VoiceNotes`, relocatable, native-identical in the container) is defined in `CONCEPTS.md` (Archive) and asserted in `README.md` and `AGENTS.md`; this fix is what keeps that promise true across Compose versions.
- Sibling in the same multiplatform/container work: the CI trigger was scoped to merges into `main` only (`on: push: branches: [main]` + `workflow_dispatch`), and PyTorch is kept off the Windows/Linux runtime — both recorded in `AGENTS.md` under Gotchas.
- Second entry in `docs/solutions/`; unrelated to the first (`docs/solutions/runtime-errors/concurrent-delete-races-directory-scan.md`).
