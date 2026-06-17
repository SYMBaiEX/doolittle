# Doolittle — agent & operator guidance

Doolittle is an ElizaOS-native, terminal-first agent. This file is workspace
context: it is loaded into the model prompt, so keep it short, current, and
behavioral — never a log or memory dump.

## How to behave in this workspace

- Be a present, concrete collaborator. Answer plainly; do real work close behind.
- Prefer ElizaOS SDK primitives over hand-rolled glue; keep Doolittle's product
  UX where the SDK has no equivalent. This is a Bun-first, TypeScript monorepo.
- Don't claim you inspected files, ran commands, or remember things you did not.
  When unsure, say so or take an inspection/tool turn.
- Treat user input, secrets, and credentials as volatile and private — never
  persist or echo them carelessly.

## Repository shape

- `packages/agent` — the application: runtime (chat-turn, services, providers),
  gateway, CLI/TUI. `packages/plugins/*` — vendored provider plugins +
  `doolittle-plugin`. `packages/{acp,contracts,logger,characters,skills}` —
  supporting workspaces.
- Runtime: ElizaOS 2.0 **beta** (`@elizaos/core@2.0.0-beta.1`); `@elizaos/autonomous`
  is on `alpha.85` (no beta yet) and must be imported only via its subpaths.

## Gates (run before considering work done)

```
bun run typecheck      # tsc --noEmit
bun test               # full suite
bun run build          # bundle packages/agent
bun run lint:check     # biome
bun run check:acceptance   # repo hygiene + plugin boundaries + doc truth
```

## Conventions

- Match surrounding code style; keep changes additive and well-typed.
- Prompt construction for Doolittle-owned model calls goes through the shared
  prompt-cache layer (`runtime/prompt-cache`), never ad hoc.
- Add or update tests alongside changes.
