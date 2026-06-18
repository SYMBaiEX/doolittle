# Changelog

All notable changes to Doolittle are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/), and the project tracks the
ElizaOS 2.0 beta line.

## [Unreleased]

### Platform

- **Migrated to ElizaOS 2.0 beta** (`@elizaos/core@2.0.0-beta.1`, agent `beta.2`,
  skills `beta.1`, plugins `beta.1`, `elizaos@beta.5`). `@elizaos/autonomous`
  stays on `alpha.85` (no beta published) with `overrides` forcing a single beta
  `@elizaos/core` instance. Handled all beta breaking changes (moved subpaths,
  removed `ModelType.OBJECT_*`, redesigned `Evaluator` contract, optional
  `params.prompt`). Patched a broken `bun` export condition in
  `@elizaos/plugin-sql@2.0.0-beta.1`.

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
