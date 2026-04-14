# Hermes vs Doolittle Parity Ledger

This ledger tracks the literal Hermes gaps that still remain after the current gateway/API parity wave. Items that are already present in Doolittle are called out briefly so the focus stays on the residual parity debt.

## Covered In This Wave

- Gateway supervision is now represented by live health, supervision, journal, history, and replay surfaces in [`packages/agent/src/gateway/runner/gateway-runner.ts`](/Users/symbiex/dev/elizaos/doolittle/doolittle/packages/agent/src/gateway/runner/gateway-runner.ts) and [`packages/agent/src/server.ts`](/Users/symbiex/dev/elizaos/doolittle/doolittle/packages/agent/src/server.ts).
- Inbox/outbox journaling is now persisted through gateway trace, delivery, attachment, and replay history in [`packages/agent/src/gateway/runner/gateway-runner.ts`](/Users/symbiex/dev/elizaos/doolittle/doolittle/packages/agent/src/gateway/runner/gateway-runner.ts), [`packages/agent/src/services/delivery-service.ts`](/Users/symbiex/dev/elizaos/doolittle/doolittle/packages/agent/src/services/delivery-service.ts), and [`packages/agent/src/services/gateway-session-service.ts`](/Users/symbiex/dev/elizaos/doolittle/doolittle/packages/agent/src/services/gateway-session-service.ts).
- Responses-style API transport is now present through [`packages/agent/src/services/api-transport-service.ts`](/Users/symbiex/dev/elizaos/doolittle/doolittle/packages/agent/src/services/api-transport-service.ts) and the `/v1/responses` routes in [`packages/agent/src/server.ts`](/Users/symbiex/dev/elizaos/doolittle/doolittle/packages/agent/src/server.ts).

## Remaining Literal Gaps

| Hermes claim | Hermes references | Doolittle surfaces | Status | Remaining literal gap |
|---|---|---|---|---|
| Always-on gateway runtime supervision | `gateway/run.py`, `gateway/status.py`, `gateway/platforms/signal.py`, `gateway/platforms/matrix.py`, `gateway/platforms/whatsapp.py`, `gateway/platforms/homeassistant.py` | `packages/agent/src/gateway/runner/gateway-runner.ts`, `packages/agent/src/server.ts`, `packages/agent/src/gateway/platforms/base.ts` | Mostly covered | Doolittle now tracks supervision, heartbeat, and state snapshots, but it still needs stronger daemon-grade reconnect/restart behavior for long-lived native transports and cleaner adapter recovery semantics. |
| Inbox / outbox journaling and replay | `gateway/run.py`, `gateway/platforms/api_server.py`, `gateway/platforms/base.py`, `gateway/platforms/dingtalk.py`, `gateway/platforms/telegram.py`, `gateway/platforms/discord.py`, `gateway/platforms/matrix.py` | `packages/agent/src/gateway/runner/gateway-runner.ts`, `packages/agent/src/services/delivery-service.ts`, `packages/agent/src/services/gateway-session-service.ts`, `packages/agent/src/server.ts` | Mostly covered | The journal/replay path now exists, but Hermes still leads on attachment-aware transcript rewrite, richer per-platform journal retention, and native reply routing fidelity across every transport. |
| Transport UX details | `gateway/platforms/telegram.py`, `gateway/platforms/discord.py`, `gateway/platforms/matrix.py`, `gateway/platforms/dingtalk.py`, `gateway/platforms/whatsapp.py`, `gateway/platforms/signal.py`, `gateway/run.py` | `packages/agent/src/gateway/platforms/*.ts`, `packages/agent/src/gateway/runner/gateway-runner.ts`, `packages/agent/src/server.ts` | Partial | Doolittle supports reply/edit/progressive delivery metadata, but Hermes still has more complete platform-native behavior for typing indicators, edit-in-place, voice memo routing, thread-aware continuity, and session-home delivery semantics. |
| Stateful OpenAI-compatible Responses API transport | `gateway/platforms/api_server.py` | `packages/agent/src/services/api-transport-service.ts`, `packages/agent/src/server.ts` | Mostly covered | Doolittle now persists `previous_response_id` and serves `/v1/responses`, but Hermes still has a more mature stateful transport loop with stricter Responses schema fidelity, richer streamed event behavior, and deeper session continuity semantics. |
| Operator session controls | `cli.py`, `gateway/run.py` | `packages/agent/src/runtime/chat.ts`, `packages/agent/src/cli.ts`, `packages/agent/src/server.ts` | Partial | Doolittle has comparable operator surfaces, but Hermes still exposes a denser live-control loop for retry, undo, rollback, resume, compress, title, home, voice, status, and usage as first-class gateway commands. |
| Home Assistant-style event source | `gateway/platforms/homeassistant.py` | `packages/agent/src/gateway/platforms/homeassistant-adapter.ts`, `packages/agent/src/gateway/runner/gateway-runner.ts`, `packages/agent/src/server.ts` | Partial | Doolittle has a Home Assistant adapter and event routing, but Hermes still treats external event streams as a more complete daemon source with watch filters, sync loops, and REST reply delivery semantics. |

## Priority Local Follow-Ups

1. Finish daemon-grade reconnect and recovery behavior for the enabled native transports.
2. Tighten journal semantics so replay, attachment retention, and transcript rewriting are platform-aware rather than just history-backed.
3. Close the last Responses API fidelity gaps around streaming shape, session continuity, and turn stitching.
4. Expand operator commands so the live gateway/session controls read more like Hermes’s `/retry`, `/undo`, `/compress`, `/usage`, and `/insights` surface.
5. Deepen Home Assistant-style event-source lifecycle handling for watch, sync, and reply loops.

## Current Read

Doolittle now matches the broad gateway/API shape much more closely. The remaining work is less about basic architecture and more about literal parity fidelity: daemon recovery, journal semantics, Responses transport behavior, and platform-native live control.
