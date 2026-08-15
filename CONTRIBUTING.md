# Contributing to Doolittle

Thanks for helping build Doolittle — an ElizaOS-native, terminal-first agent.

## Prerequisites

- [Nub](https://nubjs.com/docs) `0.7.4` with Node.js `26.5.0`.
- Node `26.5.0` is pinned in `.node-version`; the packaged desktop uses
  Electron's embedded Node.

```bash
nub install --frozen-lockfile --ignore-scripts
cp .env.example .env   # then fill in provider keys you want
nub run dev            # start the paired shell
```

The scriptless install is intentional: dependency lifecycle scripts are not a
trusted bootstrap boundary. Use `nub run desktop:runtime:install` when working
on the Electron app; the source installer and CI follow the same split.

## Quality gates

Every change must keep these green (CI runs them):

```bash
nub run typecheck      # tsc --noEmit, strict
nub run test           # full Vitest suite
nub run build          # bundle packages/agent
nub run lint:check     # biome
nub run check:acceptance   # repo hygiene + plugin boundaries + doc truth
```

Run `nub run lint` to auto-fix formatting before committing.

## Repository shape

- `packages/agent` — the application: `runtime/` (chat-turn, services, providers),
  `gateway/`, `cli/`, `server/`.
- `packages/plugins/*` — Doolittle provider bridges, the SQL compatibility
  wrapper, and the consolidated `doolittle-plugin` source.
- `packages/{acp,contracts,characters,skills}` — protocol, shared contracts,
  character data, and native skill assets.
- `packages/{app-training,cloud-shared,plugin-remote-manifest,plugin-worker-runtime,registry}`
  — declared resolver shims for unpublished packages on the pinned beta train.
- Runtime is the aligned ElizaOS 2.0 beta train declared by the root
  `elizaSdk` contract and exact dependency overrides.

See the [monorepo layout](docs/monorepo.md) and [package ownership
matrix](docs/package-ownership.md) before adding another workspace boundary.

## Extension recipes

Application composition belongs to `packages/agent`; reusable plugin facets
must depend on SDK or `@doolittle/contracts` types and accept host services
through explicit ports. Plugins must not import the application that hosts
them.

### Add an action

1. Implement `createMyAction(services): Action` in `packages/agent/src/actions/`.
2. Register it in the product plugin's `actions` array
   (`packages/agent/src/runtime/native/plugin-registry/product/index.ts`).
3. Add a unit test next to the action and product-composition coverage when the
   registered surface changes.

### Add a provider (prompt context)

1. Implement `createMyProvider(services): Provider` in
   `packages/agent/src/providers/`.
2. Add it to the `providers` array in
   `packages/agent/src/runtime/native/plugin-registry/product/index.ts`.

### Add a model provider

Add a workspace plugin under `packages/plugins/` that registers the model
handlers; wire its selection through the provider registry. To benefit from
prompt caching, make it consume `params.promptSegments` (see
`packages/agent/src/runtime/prompt-cache/README.md`).

## Conventions

- Match the surrounding code style; keep changes additive and strongly typed.
- Doolittle-owned model prompts go through the shared prompt-cache layer, never
  ad hoc.
- Add or update tests alongside implementation.
- Never mark user input, secrets, or per-request data as cache-stable.

## Documentation

- Start with the [documentation index](docs/README.md) and update the narrowest
  canonical guide for the behavior you changed.
- Do not hand-edit `docs/plugin-inventory.md` or `docs/capability-truth.md`;
  update their code-backed sources and run
  `nub scripts/sync-doc-truth.ts --write`.
- Keep every `@doolittle/*` workspace on the root product version. Keep official
  `@elizaos/*` packages and compatibility workspaces pinned independently to the
  exact root `elizaSdk.version`.
- Keep audit and planning notes dated. Do not present them as runtime proof.
- Run `nub run check:docs-truth` and `nub run check:local-links` for every
  documentation change.
