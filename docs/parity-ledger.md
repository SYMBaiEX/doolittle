# Hermes vs Eliza Agent Parity Ledger

This ledger compares the local `hermes-agent` repo to the current Eliza Agent workspace and focuses on the highest-value runtime and transport gaps that can still be closed locally.

## Ledger

| Category | Hermes references | Eliza Agent status | Remaining gap |
|---|---|---|---|
| Always-on gateway/runtime supervision | `gateway/run.py`, `gateway/platforms/signal.py`, `gateway/platforms/matrix.py`, `gateway/platforms/whatsapp.py`, `gateway/platforms/homeassistant.py` | Partial | Hermes keeps long-lived platform daemons, health monitors, reconnect loops, and cleanup tasks running continuously. Eliza Agent has stateful gateway scaffolding, but not the same always-on self-healing transport supervision. |
| Inbox / outbox journaling | `gateway/run.py`, `gateway/platforms/api_server.py`, `gateway/platforms/base.py`, `gateway/platforms/dingtalk.py`, `gateway/platforms/telegram.py`, `gateway/platforms/discord.py`, `gateway/platforms/matrix.py` | Partial | Hermes keeps a richer message journal with transcript rewrite/replay behavior, attachment-aware history, and platform-specific reply routing. Eliza Agent has delivery/history surfaces, but not the same durable inbox/outbox journal model. |
| Transport UX details | `gateway/platforms/telegram.py`, `gateway/platforms/discord.py`, `gateway/platforms/matrix.py`, `gateway/platforms/dingtalk.py`, `gateway/platforms/whatsapp.py`, `gateway/platforms/signal.py`, `gateway/run.py` | Partial | Hermes has richer typing indicators, edit-in-place, thread/reply handling, voice mode, session-webhook reply routing, and home-session delivery semantics. Eliza Agent still needs more platform-native UX parity. |
| Stateful OpenAI-compatible API transport | `gateway/platforms/api_server.py` | Missing / partial | Hermes exposes a stateful Responses API path with `previous_response_id`, LRU session state, and streamed SSE responses. Eliza Agent’s HTTP layer is not yet equivalent to that transport model. |
| Operator session controls | `cli.py`, `gateway/run.py` | Partial | Hermes exposes deeper live controls such as retry, undo, rollback, resume, compress, title, home, voice, status, and usage as first-class gateway commands. Eliza Agent has comparable admin surfaces, but the live gateway command behavior is not yet as complete. |
| Home Assistant-style event source | `gateway/platforms/homeassistant.py` | Missing / partial | Hermes treats external event streams as a first-class daemon source with watch filters, sync loops, and REST reply delivery. Eliza Agent has event-routing abstractions, but not the same live event-source lifecycle. |

## Highest-value local follow-ups

1. Add stronger gateway daemon health/reconnect loops for the active platforms.
2. Turn inbox/outbox history into a true journal with replay and attachment retention.
3. Finish platform-native UX details for reply threading, edits, typing, and voice routing.
4. Add a stateful API transport path that preserves previous-response context.
5. Expand live event-source support for Home Assistant-style watchers.

## Current read

Eliza Agent is strongest in its core local operator shell and stateful gateway scaffolding. The largest remaining parity gap is the always-on transport/runtime layer, especially daemon supervision and journaled platform UX.
