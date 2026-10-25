# Doolittle — agent & operator guidance

Doolittle is the desktop and CLI client for ElizaOS coding and daily assistance.
ElizaOS owns the agent engine; Doolittle owns client UX and transport. This file is workspace
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

- `apps/cli` — terminal chat, cockpit, process entrypoints and commands.
  `apps/desktop` — Electron desktop client. `packages/agent` — shared runtime
  (chat-turn, services, providers), API and gateway. `packages/plugins/*` — Doolittle provider bridges, the SQL
  compatibility wrapper, and `doolittle-plugin` source.
  `packages/{acp,contracts,characters,skills}` — supporting workspaces.
- Runtime: prefer the newest usable ElizaOS packages. The root `elizaSdk`
  contract records the core baseline and explicit per-package exceptions for
  incomplete upstream publications. Recheck tarball exports when upgrading;
  do not hold usable releases back to keep every package on one train.

## Developer loop

```sh
nub run test:scope tests/boundary/project-access.test.ts
nub run test:related packages/agent/src/path/to/changed.ts
nub run test:watch:scope tests/boundary/workspace-refresh.test.ts
nub run test                               # small security/state boundary suite
```

- Default `test`/`check` is a fast feedback loop, not release certification.
- Match verification to changed behavior. Do not repeatedly run the full suite,
  builds, acceptance gates, or live evals during routine edits.
- Use `test:all` / `check:all` for deliberate broad coverage and `check:release`
  before release. `test:e2e` runs the small real-worker and native desktop suite;
  packaged acceptance additionally checks a clean-HEAD artifact. Keep new tests
  in `tests/` and extend behavior journeys, not implementation-detail snapshots.
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
