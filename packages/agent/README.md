# @doolittle/agent

Shared runtime assembly, API, gateway, and product services used by Doolittle's
CLI and desktop clients. ElizaOS owns the engine, model and plugin lifecycles,
credentials, tasks, memory, and coding orchestration. This package composes those
services and supplies Doolittle's product contracts and workspace behavior.

## Entry points

Import declared subpaths from [package.json](package.json); there is no root
barrel export. For example:

```ts
import { loadConfig } from "@doolittle/agent/config/env";
import { getAppContext } from "@doolittle/agent/runtime/bootstrap";
```

These are runtime APIs, not browser APIs. Bootstrap can start persistent services
and provider discovery; applications own startup, shutdown, and profile choice.
Use the [CLI entrypoints](../../apps/cli/README.md) to run the application.

## Source map

| Source | Responsibility |
| --- | --- |
| [config](src/config) | Environment parsing, defaults, and runtime configuration. |
| [runtime/bootstrap](src/runtime/bootstrap) | Application context and SDK startup. |
| [runtime/chat-turn](src/runtime/chat-turn) | Turn execution, receipts, cancellation, and continuation. |
| [runtime/engine](src/runtime/engine) | Shared host and named-bot worker lifecycle. |
| [runtime/native/plugin-registry](src/runtime/native/plugin-registry) | Official plugins and product action/provider assembly. |
| [actions](src/actions) and [providers](src/providers) | Doolittle actions and prompt-context projections. |
| [services](src/services) | Product state, workspace tools, and service composition. |
| [server](src/server) and [gateway](src/gateway) | HTTP routes and delivery transports. |

Shared packages must not import application source. Use `packages/contracts`
for serializable cross-client records. Keep bot, conversation, request, and
confirmed workspace identities attached to effects. Transport failures do not
prove completion or cancellation. Doolittle-owned model prompts use the
[prompt-cache layer](src/runtime/prompt-cache/README.md).

## Development

From the repository root:

```sh
nub run --cwd packages/agent typecheck
nub run test:related packages/agent/src/actions/coding-action.ts
nub run check:plugin-boundaries
nub run check:monorepo
```

Select explicit tests under `tests/` for dynamic registration and worker or
transport changes; static related-test discovery cannot prove that wiring.
See [architecture](../../docs/architecture.md), [development](../../docs/development.md),
and [testing](../../docs/testing.md) for the complete workflow.
