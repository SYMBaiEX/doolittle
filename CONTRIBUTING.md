# Contributing to Doolittle

Thanks for helping build Doolittle — an ElizaOS-native, terminal-first agent.

## Prerequisites

- [Nub](https://nubjs.com/docs) `0.6.0` with Node.js `26.5.0`.
- Node `26.5.0` is pinned in `.node-version`; the packaged desktop uses
  Electron's embedded Node.

```bash
nub install
cp .env.example .env   # then fill in provider keys you want
nub run dev            # start the paired shell
```

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
- `packages/plugins/*` — vendored provider plugins + the consolidated
  `doolittle-plugin`.
- `packages/{acp,contracts,logger,characters,skills}` — supporting workspaces.
- Runtime is the aligned ElizaOS 2.0 beta train declared by the root
  `elizaSdk` contract and exact dependency overrides.

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
