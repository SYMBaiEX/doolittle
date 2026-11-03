# Security development

Use [SECURITY.md](../SECURITY.md) for private vulnerability reporting.

## Trust boundaries

The Electron renderer uses a context-isolated preload transport. Host code
validates the sender, route, bot, conversation, workspace, and action authority.
Do not expose generic filesystem, shell, or network access through preload.
Runtime routes live in [the server](../packages/agent/src/server/); desktop host
policy lives in [main-process code](../apps/desktop/src/main/).

A project picker or renderer value does not grant workspace access. File,
terminal, and coding actions use confirmed host-owned workspace grants. Keep
identity and canonical-path checks at the effect boundary and preserve their
failure behavior across retries and recovery.

The API defaults to loopback. Remote API access and terminal execution have
separate authorization requirements; use the SDK HTTP policy and existing route
adapters rather than adding a second authorization layer. Do not log tokens,
raw credentials, or private prompt and tool content.

Worker threads isolate runtime state, not operating-system authority. Plugins
and tools may execute code with the current user's permissions. Approval,
cancellation, and ownership controls must remain effective in every client.

Configured execution targets fail explicitly when unavailable; they never fall
back to local execution. Required cancellation is admitted through the backend's
actual capability. A deadline settling or a cancellation signal being sent does
not establish that underlying work stopped. Surface unconfirmed termination and
retain operation ownership until the outcome is authoritative.

## Persistent state and credentials

Keep `.env`, `.doolittle/`, provider homes, evaluation evidence, and runtime data
out of commits. Store credentials through the SDK's account and secret services;
return secret-free status records to the desktop and API.

Optional state may be absent. Corrupt or unreadable state must remain visible;
use [the storage helper](../packages/storage/src/index.ts) for shared strict JSON
reads. Scope cleanup and migration to owned files, and preserve recoverable data
when publication or cancellation is uncertain.

## Local checks

```sh
nub run check:plugin-boundaries
nub run check:repo-hygiene
nub run check:workflow-security
nub run check:eliza-sdk
nub run audit:production:critical
nub run audit:production:high
```

The audit commands query current dependency advisory data. Their exit status is
specific to the configured threshold; it is not a complete application security
review. SDK integrity checks compare source archives and installed provenance;
they do not establish the safety of every upstream behavior.

Add regression cases under `tests/boundary/` for permission admission, cross-bot
access, cancellation, replay, corrupted state, and source changes relevant to a
security fix. Use real process or desktop journeys when the boundary depends on
runtime registration or native behavior; see [testing](testing.md).
