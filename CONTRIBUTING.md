# Contributing to Doolittle

Thanks for helping build Doolittle — an ElizaOS-native, terminal-first agent.

## Prerequisites

- [Bun](https://bun.sh) `>= 1.3` (the repo is Bun-first; do not use npm/yarn/pnpm).
- Node `>= 24` headers are used by some native deps.

```bash
bun install
cp .env.example .env   # then fill in provider keys you want
bun run dev            # start the paired shell
```

## Quality gates

Every change must keep these green (CI runs them):

```bash
bun run typecheck      # tsc --noEmit, strict
bun test               # full suite (bun:test)
bun run build          # bundle packages/agent
bun run lint:check     # biome
bun run check:acceptance   # repo hygiene + plugin boundaries + doc truth
```

Run `bun run lint` to auto-fix formatting before committing.

## Repository shape

- `packages/agent` — the application: `runtime/` (chat-turn, services, providers),
  `gateway/`, `cli/`, `server/`.
- `packages/plugins/*` — vendored provider plugins + the consolidated
  `doolittle-plugin`.
- `packages/{acp,contracts,logger,characters,skills}` — supporting workspaces.
- Runtime is ElizaOS 2.0 **beta**; `@elizaos/autonomous` is on `alpha.85` and is
  imported only via its subpaths.

## Extension recipes

The plugin surface only imports Doolittle internals through one seam:
`@doolittle/agent/plugin-api`.

### Add an action

1. Implement `createMyAction(services): Action` in `packages/agent/src/actions/`.
2. Re-export it from `packages/agent/src/plugin-api.ts`.
3. Register it in the assembly's `actions` array
   (`packages/plugins/doolittle-plugin/assembly.ts`).
4. Add a unit test next to the action.

### Add a provider (prompt context)

1. Implement `createMyProvider(services): Provider` in
   `packages/agent/src/providers/`.
2. Re-export it from `plugin-api.ts`.
3. Add it to the `providers` array in `assembly.ts`.

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
