# Doolittle — agent & operator guidance

Doolittle is an ElizaOS-native, terminal-first agent. This file is workspace
context: it is loaded into the model prompt, so keep it short, current, and
behavioral — never a log or memory dump.

## How to behave in this workspace

- Be a present, concrete collaborator. Answer plainly; do real work close behind.
- Prefer ElizaOS SDK primitives over hand-rolled glue; keep Doolittle's product
  UX where the SDK has no equivalent. This is a Nub-powered, TypeScript monorepo.
- Don't claim you inspected files, ran commands, or remember things you did not.
  When unsure, say so or take an inspection/tool turn.
- Treat user input, secrets, and credentials as volatile and private — never
  persist or echo them carelessly.

## Repository shape

- `packages/agent` — the application: runtime (chat-turn, services, providers),
  gateway, CLI/TUI. `packages/plugins/*` — Doolittle provider bridges, the SQL
  compatibility wrapper, and `doolittle-plugin` source.
  `packages/{acp,contracts,characters,skills}` — supporting workspaces.
- Runtime: the installable ElizaOS 2.0 beta train (`@elizaos/core`,
  `@elizaos/agent`, and `@elizaos/skills` at `2.0.3-beta.7`). Keep the exact
  root overrides aligned.

## Gates (run before considering work done)

```
nub run typecheck      # tsc --noEmit
nub run test           # full suite
nub run build          # bundle packages/agent
nub run lint:check     # biome
nub run check:acceptance   # repo hygiene + plugin boundaries + doc truth
```

## Conventions

- Match surrounding code style; keep changes additive and well-typed.
- Prompt construction for Doolittle-owned model calls goes through the shared
  prompt-cache layer (`runtime/prompt-cache`), never ad hoc.
- Add or update tests alongside changes.
