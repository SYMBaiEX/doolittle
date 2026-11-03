# Doolittle contracts

`@doolittle/contracts` owns serializable product contracts shared by the agent,
desktop, CLI, and plugins. It contains records, validators, and stable service
identifiers; engine lifecycle types remain owned by ElizaOS.

## Usage

Import ordinary shared contracts from the package root. Use a declared subpath
when a consumer needs a focused surface, for example:

```ts
import { DEFAULT_MODEL_ROUTE } from "@doolittle/contracts/model-route";
```

Check [`package.json`](package.json) for supported subpaths and
[`src/index.ts`](src/index.ts) for root exports. Do not import private source
paths from another workspace.

## Canonical primitives

| Contract | Ownership |
| --- | --- |
| [worker-host](src/worker-host.ts) | RPC envelopes, operation vocabulary, request identity, and framing limits. |
| [run](src/run.ts) | Serializable run evidence, lifecycle status vocabulary, and receipt admission. |
| [model-route](src/model-route.ts) | Product provider identities, reasoning vocabulary, settings, and model catalog. |
| [execution](src/execution.ts) | Execution targets, supported capabilities, and execution records. |
| [bots](src/bots.ts) and [ui-host](src/ui-host.ts) | Bot definitions and explicitly projected client interactions. |

Contracts describe evidence and boundary shapes. They do not attest a sender,
grant workspace access, run processes, or own application/service lifetimes.
Use each guard or schema only for the guarantee it documents; a known status
value is not a validated run receipt. Preserve the distinction between persisted
open identifiers and finite input choices.

Other contracts cover coding sessions, verification, workspaces, repositories,
themes, plugins, and cross-surface records under `src/types`. Producers and
consumers import the same vocabulary rather than redeclaring matching shapes.

## Development

From the repository root:

```sh
nub run --cwd packages/contracts typecheck
nub run check:monorepo
```

A contract change can affect several clients. Update the producers, consumers,
and relevant behavior tests together; select those tests using
[testing](../../docs/testing.md). See [architecture](../../docs/architecture.md)
before adding another shared package or lifecycle abstraction.
