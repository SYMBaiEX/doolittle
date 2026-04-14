# ElizaOS Research Notes

This document captures framework-level findings that matter for expanding Doolittle toward deeper ElizaOS alignment.

## Dist-tag status observed on March 19, 2026

- `elizaos@latest` resolved to `2.0.0-alpha.77`
- `elizaos@alpha` resolved to `2.0.0-alpha.76`
- `@elizaos/core@latest` resolved to `2.0.0-alpha.77`
- `@elizaos/plugin-sql@alpha` resolved to `2.0.0-alpha.17`
- `@elizaos/plugin-bootstrap@latest` resolved to `1.7.2`
- `@elizaos/plugin-bootstrap@alpha` resolved to `1.7.3-alpha.4`

Implication:

- The ElizaOS ecosystem is not publishing every package in lockstep.
- Tag selection should be validated package-by-package, not assumed globally.
- `@elizaos/plugin-sql@alpha` was required for runtime compatibility with `@elizaos/core@latest` in this repo.

## Core architectural findings

### 1. Runtime-centered architecture

ElizaOS is centered around `AgentRuntime` from `@elizaos/core`.

What that means for Doolittle:

- character, plugins, and runtime settings should remain the center of the app
- HTTP, CLI, gateway, and scheduling layers should wrap the runtime rather than replace it

### 2. Services are the native long-running integration model

Official documentation and installed type definitions both show that ElizaOS expects long-lived integrations to be implemented as `Service` subclasses.

Relevant framework contract from the installed `@elizaos/core` types:

- `Service` has a static `start(runtime)` lifecycle
- `Service` instances are singleton-like per runtime
- services are where persistent connections, background processes, and integration state belong

Implication for Doolittle:

- gateway, background schedulers, delivery routers, and adapter lifecycles should eventually be promoted from standalone app services into ElizaOS plugin services

### 3. Task workers are the native recurring-job mechanism

The official services documentation describes a built-in task system:

- runtime task workers are registered in memory
- tasks are persisted
- recurring tasks use metadata such as `updateInterval`

Implication for Doolittle:

- the current custom cron service works, but long-term parity should move recurring automation toward ElizaOS task workers where possible
- scheduled reports, sync jobs, and repeating maintenance tasks are strong candidates for native task-worker execution

### 4. Message service is the canonical processing path

The official examples consistently route input through:

- `runtime.ensureConnection(...)`
- `createMessageMemory(...)`
- `runtime.messageService.handleMessage(...)`

Implication for Doolittle:

- local CLI, HTTP chat, and gateway-originated messages should keep using this shared pipeline
- custom platform behavior should adapt into this path instead of bypassing it

### 5. Plugin surface is broader than just actions

ElizaOS plugins can contribute:

- actions
- providers
- evaluators
- services
- routes
- model handlers

Implication for Doolittle:

- today the custom plugin mostly uses actions/providers/evaluators/models
- deeper parity work should use `services` for gateway and background work
- framework-native HTTP `routes` may be useful for parts of the API that belong directly to the runtime

## Application-specific direction for Doolittle

### Good current alignment

The current codebase already aligns well with ElizaOS in several places:

- runtime-centered bootstrapping
- custom plugin for actions/providers/evaluators/models
- SQL-backed runtime initialization
- canonical message processing path for chat requests

### Highest-value next refactors

1. Promote gateway lifecycle into real ElizaOS `Service` classes.
2. Promote recurring automations into task workers where ElizaOS fits cleanly.
3. Evaluate whether parts of the Bun API should move into plugin-provided runtime routes.
4. Add transport-specific adapters against the existing gateway abstractions.
5. Expand model/provider support using official ElizaOS plugins when the published package versions line up cleanly.

## Sources consulted

Primary sources:

- Official ElizaOS services documentation: [docs.elizaos.ai/runtime/services](https://docs.elizaos.ai/runtime/services)
- Official ElizaOS GitHub repository: [github.com/elizaOS/eliza](https://github.com/elizaOS/eliza)
- Installed `@elizaos/core` type definitions in this workspace
- npm package metadata for `elizaos`, `@elizaos/core`, `@elizaos/plugin-sql`, and `@elizaos/plugin-bootstrap`
