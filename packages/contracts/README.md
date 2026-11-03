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

The source layout follows domain ownership: coding sessions and verification,
workspace results, repositories, bots, model routes, themes, UI hosts and plugins,
and cross-surface records under `src/types`. Keep runtime validation beside the
contract it protects. Use the existing Zod schemas rather than unchecked casts
when accepting persisted or external data.

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
