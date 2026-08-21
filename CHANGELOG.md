# Changelog

All notable changes to Doolittle are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/), and the project tracks the
ElizaOS 2.0 beta line.

## [Unreleased]

### Added

- Added one-command, verified macOS ARM64, Windows x64, and Linux x64 desktop
  packaging with target-native runtime checks, an exact source/artifact
  manifest, portable SHA-256 sums, and updater SHA-512/size verification for
  every generated installer.
- Added a deterministic packaged-runtime dependency inventory and release gate
  that checks only emitted bundle bytes plus copied native packages, verifies
  their actual package identities, and stops for newly published unreviewed
  high-severity advisories.

### Fixed / Reliability

- Kept the MIT desktop runtime license-compatible by excluding the optional
  Telegram and WhatsApp native connectors from distributed binaries while
  preserving them for source installs, and by using the host's FFmpeg for
  Discord voice. Linux in-app updates now remain disabled until their metadata
  has an independently pinned signature, while signed Windows releases bind
  updater publisher metadata to the certificate's full subject identity.
- Upgraded the computer-use plugin's scoped Puppeteer runtime to 25.8.0,
  removing the vulnerable `extract-zip` closure from the shipped desktop while
  preserving the exact ElizaOS beta train. Provider CLI packages now use the
  audited Doolittle transport directly instead of importing the full Eliza
  Agent package into their published consumers.

- Refreshed the supported desktop and repository toolchain to current stable
  releases: Electron 43.4.1, Vite 8.2.2, Vitest 4.1.11, Nub 0.7.5, Biome
  2.5.9, PGlite 0.5.5, and their compatible companion packages. Monaco's
  renderer dependency is now constrained to DOMPurify 3.4.14, while the full
  ElizaOS runtime remains coherently pinned to the newest published beta train,
  `2.0.3-beta.7`.
- Preserved the selected project, workspace, and chat session across Chat,
  Code, and Work navigation. Chat turns now hold a workspace lease, stale
  cross-workspace requests are rejected, and terminal handoffs close only after
  their target chat has accepted the context capsule. Code and Work also retain
  their scoped file, pane, tab, search, task, and run focus across route swaps.
- Made gateway delivery outcomes restart-durable and safely idempotent. Failed
  outbound messages retain a private retry payload, expose a guarded desktop
  **Retry delivery** action, and can be resent without rerunning the agent or
  its tools; public history projections remain redacted.
- Isolated gateway conversation history by connector account across Slack,
  Discord, WhatsApp, Signal, and Telegram while preserving attributable legacy
  sessions. Missing-account ingress now receives a separate unattributed room
  instead of inheriting an attributed legacy session. Native Discord accepts
  valid attachment-only messages without relaxing bot, channel, direct-message,
  or mention policy.
- Kept reasoning effort atomic with provider and model selection in the chat
  composer, model settings, and header route controls. Unsupported models now
  clear stale effort explicitly instead of sending an invalid settings change
  that could make the route appear to revert.
- Made Responses API streams cancel their underlying gateway/model work when a
  consumer disconnects, and replaced millisecond message IDs with collision-
  resistant request identities.
- Propagated turn cancellation through explicit shell actions and slash-command
  terminal execution on local and remote backends, including Windows process-
  tree termination, suppressing buffered output after cancellation and
  revoking approvals created by a turn even when cancel races prompt delivery.
  Native workspace picker failures now preserve the current workspace and
  surface recoverable error feedback.
- Made desktop update installation single-flight in both the renderer and main
  process. Accepted restarts stay visibly locked while duplicate clicks are
  ignored, while synchronous throws and asynchronous provider errors remain
  retryable.
- Kept generated desktop skills and their metadata in writable user data while
  loading bundled skills from the signed application resources. The macOS
  release smoke test now uses absolute packaged paths and the same split, so it
  cannot write into or misresolve the sealed notarized bundle.
- Moved the desktop sidebar behind a dedicated, budgeted lazy boundary and
  tightened the initial renderer entry cap to preserve release-build headroom
  without changing mobile focus or navigation behavior.
- Kept attachment descriptors from imported session archives displayable while
  remapping them into an inert namespace, so `/retry` cannot substitute a
  same-ID local managed file for a binary that the archive intentionally omits.
- Marked persisted terminal tabs stale and closed when returning after a real
  workspace switch, preventing disposed PTY session IDs from appearing active
  or being polled and clearly prompting the user to start a new shell.
- Kept optimistic Review notes available when the runtime is offline and made
  persistence feedback truthful when browser storage is also unavailable,
  instead of claiming a window-only note was saved locally.
- Bounded cached MCP schema-description responses and their slash-command
  equivalent to 20 tools, rejecting non-finite, fractional, duplicated, or
  oversized limits before any cached catalog serialization.
- Made Browser evidence handoffs await the destination chat transition before
  reporting success, preserving editable evidence when navigation is rejected
  or fails and preventing duplicate sends while one handoff is pending.
- Returned native pairing and authorization responses through Discord, Slack,
  Signal, and WhatsApp with their original account, channel, thread, and reply
  context, while avoiding duplicate replies after an agent turn has completed.
  Signal group authorization replies are sent privately to the originating
  sender because the pinned connector drops quote context from group sends.
- Kept gateway home routes independent per connector account, and made Slack
  mention/self filtering use the active account's bot identity instead of the
  default workspace identity.
- Captured resize pointers across embedded Browser previews and reliably
  restored cursor and selection state after release, cancellation, capture
  loss, or unmount.
- Added explicit confirmation before permanently stopping and removing a local
  sandbox, with duplicate-submit protection and automatic dismissal when the
  sandbox panel is no longer active.
- Made native conversation deletion compensating and rollback-safe. Partial
  Eliza memory failures during `/undo`, `/retry`, or `/compress` now restore the
  authoritative transcript, retries validate attachments before deletion, and
  failed replacements remove any summary they created instead of leaving
  native and projected history out of sync. Failed retries also remove their
  partial replay memories, restore the exact prior projection, and regenerate
  embeddings for every restored native message.
- Isolated pairing approvals by connector account across Slack, Discord,
  Signal, WhatsApp, and Telegram. Native Slack now honors the active account's
  mention and bot policy without double-routing app mentions, while Signal
  preserves its configured group-message policy before gateway authorization.
- Allowed remote Slack and WhatsApp callbacks to reach their protocol-native
  signature or verification-token checks without weakening Doolittle API auth;
  missing signing secrets now fail closed, Slack rejects replayed timestamps,
  every other webhook remains private, and public provider paths cannot be
  intercepted by runtime plugin routes or an unavailable automation service.
- Made signed Slack and WhatsApp callbacks acknowledge only after their full
  normalized payload is durably queued, while agent execution continues on a
  gateway-owned lifecycle. Exact provider retries coalesce, queued work resumes
  after restart, and crash-ambiguous claimed work is exposed as interrupted
  instead of being automatically run twice.
- Kept Chat's reasoning-effort selector synchronized with the active runtime
  after a model-route update, even while the model catalog cache is still
  fresh.
- Made paused webhook automations reject without executing or creating a run
  receipt, while preserving explicit operator `runNow` behavior and binding
  successful webhook dispatch to its exact persisted token and receipt.
- Limited reusable desktop release workflows to the signing secrets required
  by their operating system; Linux receives none, Windows receives only its
  certificate pair, and macOS receives only its signing and notarization set.

## [0.1.0] - 2026-08-14

### Platform

- Removed benchmark, distribution, and modeling placeholder workspaces with
  their metadata-only projections; checked-in generated skill residue; and an
  internal planning contract that had no runtime consumers. Generated skill
  bookkeeping is now local-only, and public tests use neutral fixtures.
- **Aligned the complete ElizaOS runtime train on `2.0.3-beta.7`**:
  `@elizaos/core`, `@elizaos/agent`, `@elizaos/skills`, `elizaos`, shared, and
  published official plugins now resolve to one exact beta through root
  overrides and an acceptance check. Doolittle's private
  `@doolittle/plugin-sql-relationships@0.1.0` compatibility wrapper remains
  layered over the same official `@elizaos/plugin-sql@2.0.3-beta.7` package.
- **Completed the native message-lifecycle migration**: normal chat turns now
  enter `DefaultMessageService` directly. Removed the parallel regex
  classifier, direct informational/profile/soul model bypasses, local-intent
  pre-executor, and post-planner rescue executor. Doolittle retains only
  product shell/session projection, provider readiness, and post-action
  mutation-receipt safety around the SDK-owned lifecycle.
- Removed post-migration source debris: obsolete private barrel files,
  superseded provider and terminal helpers, duplicate CLI job rendering,
  retired delegation types, redundant contract aliases, and the Claude Code
  status compatibility facade. Supported one-time user-data import paths remain
  intact for upgrades from older Doolittle installations.
- Completed a repository-wide migration cleanup: removed the stale chat-turn
  tscheck fixture, consolidated provider settings, plugin record IDs, and
  autocoder workflow lifecycle helpers, repaired source/documentation paths,
  declared application-owned runtime dependencies, and added guards for local
  documentation links and contract paths.
- Split Doolittle context into official always-on core and context-routed
  workspace/operations providers. Selected-project grounding now resolves
  through the SDK session envelope.
- **Made Eliza Trigger Tasks the only automation authority**. Job definitions,
  lifecycle, manual/webhook dispatch, conditions, action execution, and durable
  run receipts now flow through SDK tasks; command, diagnostics, activity, and
  provider consumers no longer fall back to the retired local scheduler.
- Adopted the official agent orchestrator, skills plugin, database trajectory
  logger, `SandboxManager`, SDK action-result mutation receipts, and runtime
  command catalog. Removed the dormant custom orchestrator and natural-language
  regex routing shadows.

### Added

- **Provider-aware prompt caching** for Doolittle-owned model calls
  (`runtime/prompt-cache`): lossless stable/volatile segmentation emitting SDK
  `promptSegments` + `providerOptions`, deterministic versioned cache keys, and
  cache metrics surfaced in `/status`.
- Full SDK adoption: self-awareness provider, `/research` deep-research action,
  tool-audit hook, autonomous triggers, a recurring maintenance task, and
  per-ModelType sampling settings.
- Git-backed workspace checkpoints with protected-data filtering, automatic
  pre-write safety snapshots, recovery snapshots before restore, explicit
  confirmation, and a desktop Changes panel.

### Desktop

- Added opt-in background lifecycle, privacy-safe completion notifications, and
  an explicit signed-update flow using generated `app-update.yml` metadata.
- Replaced plain terminal transcript rendering with an xterm-based interactive
  PTY surface, while retaining bounded command and IPC policy.
- Added runtime-backed slash-command completion, the unified activity center,
  durable per-thread drafts and queues, conversation branching and portable
  archives, managed dictation, read-aloud, multi-folder project resources, and
  project-aware global search.
- Added native Windows, macOS, and Linux release workflows. Tagged Windows
  releases require Authenticode signatures; tagged macOS releases require
  signing and notarization credentials; every workflow smoke-tests the bundled
  runtime before publishing artifacts.

### Security

- Replaced direct JSON persistence across desktop, gateway, credentials,
  configuration, product services, Skills Hub, media/web artifacts, and
  trajectory tooling with Eliza's public atomic JSON writer. Acceptance now
  blocks ordinary direct JSON writes while preserving staged multi-file imports
  and newline-delimited datasets.
- Migrated autocoder secrets from a Doolittle plaintext JSON store to the
  official encrypted Eliza Vault. Existing entries are imported once and the
  legacy plaintext file is removed only after successful storage.
- Replaced Doolittle's parallel HTTP auth/CORS implementation with Eliza's
  native API security helpers, including DNS-rebinding protection and canonical
  terminal-token policy. Existing `DOOLITTLE_*` API settings remain boot-time
  compatibility aliases for `ELIZA_API_*`.
- **Local-first API**: the HTTP API binds to `127.0.0.1` by default. Non-loopback
  binds are secured by `ELIZA_API_TOKEN`; Eliza generates a temporary process
  token when none is configured. Previously the API bound to `0.0.0.0` with no
  authentication.

### Fixed / Reliability

- Packaged desktop runtimes now include the dynamically loaded SDK workspace
  helper and its Node stream dependency, with a packaging test that fails when
  a bundled runtime requirement is missing.
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
- Added a documentation index, separated generated runtime truth from dated
  maintainer records, corrected workspace and Eliza ownership maps, and removed
  stale migration-era wording and checkout-specific verification claims.

[Unreleased]: https://github.com/SYMBaiEX/doolittle/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/SYMBaiEX/doolittle/releases/tag/v0.1.0
