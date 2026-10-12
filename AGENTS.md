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

## Developer loop

```sh
nub run test:scope path/to/changed.test.ts   # direct behavior coverage
nub run test:related packages/agent/src/path/to/changed.ts
nub run test:watch:scope path/to/changed.test.ts # persistent scoped loop
nub run test                               # 8 essential behavior files
```

- Default `test`/`check` is a fast feedback loop, not release certification.
- Match verification to changed behavior. Do not repeatedly run the full suite,
  builds, acceptance gates, or live evals during routine edits.
- Use `test:all` / `check:all` for deliberate broad coverage and `check:release`
  before release. Use `test:integration:workers`, `test:sandbox:integration`, and
  `test:e2e` only when validating those real runtime/platform boundaries.
- Report exactly what ran and what remains unverified. Related tests follow
  static imports; select explicit tests for dynamic plugin/runtime wiring.
- See [fast development](docs/engineering/fast-development.md) for scope and
  failure/recovery coverage.

## Conventions

- Match surrounding code style; keep changes additive and well-typed.
- Never add thick focus frames or glows to message inputs or dropdowns. Follow
  the quiet focus treatment in `docs/engineering/doolittle-interface-design.md`.
- Prompt construction for Doolittle-owned model calls goes through the shared
  prompt-cache layer (`runtime/prompt-cache`), never ad hoc.
- Add or update tests alongside changes.
