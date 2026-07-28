# Changelog

All notable changes to Doolittle are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/), and the project tracks the
ElizaOS 2.0 beta line.

## [Unreleased]

### Platform

- **Aligned the complete ElizaOS runtime train on `2.0.3-beta.7`**:
  `@elizaos/core`, `@elizaos/agent`, `@elizaos/skills`, `elizaos`, shared, and
  official provider plugins now resolve to one exact beta through root
  overrides and an acceptance check.
- **Completed the native message-lifecycle migration**: normal chat turns now
  enter `DefaultMessageService` directly. Removed the parallel regex
  classifier, direct informational/profile/soul model bypasses, local-intent
  pre-executor, and post-planner rescue executor. Doolittle retains only
  product shell/session projection, provider readiness, and post-action
  mutation-receipt safety around the SDK-owned lifecycle.
- Split Doolittle context into official always-on core and context-routed
  workspace/operations providers. Selected-project grounding now resolves
  through the SDK session envelope.

### Added

- **Provider-aware prompt caching** for Doolittle-owned model calls
  (`runtime/prompt-cache`): lossless stable/volatile segmentation emitting SDK
  `promptSegments` + `providerOptions`, deterministic versioned cache keys, and
  cache metrics surfaced in `/status`.
- Full SDK adoption: self-awareness provider, `/research` deep-research action,
  tool-audit hook, autonomous triggers, a recurring maintenance task, and
  per-ModelType sampling settings.

### Security

- **Local-first API**: the HTTP API binds to `127.0.0.1` by default; non-loopback
  binds now **require** `DOOLITTLE_API_TOKEN` (fail-safe — no token means every
  request on a public bind is rejected). Previously it bound `0.0.0.0` with no
  authentication.

### Fixed / Reliability

- `/mcp` · `/acp` no longer crash on malformed JSON; `/cron <bad-id>` no longer
  crashes the turn.
- Per-item failure isolation for deferred plugin hydration, the cron tick, and
  the gateway watchdog (one failure no longer aborts the rest).
- Turns are always finished on exception (no more runs stranded in "thinking").
- `AGENTS.md` is real guidance again (it had become a memory dump injected into
  the live prompt).

### Performance

- `SettingsService.get()` and `SOUL.md` reads are now mtime-cached on hot paths.

### Docs

- Added LICENSE (MIT), SECURITY, CONTRIBUTING; `/commands` no longer truncates
  the browse list; version docs corrected from alpha to beta.
