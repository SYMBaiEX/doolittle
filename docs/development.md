# Development

Use the [setup guide](setup.md) for a fresh checkout. The root and workspace
manifests define the supported commands; keep changes scoped to the behavior
being developed.

## Local loop

```sh
nub run dev
nub run test:scope tests/boundary/project-access.test.ts
nub run test:related packages/agent/src/actions/coding-action.ts
nub run test:watch:scope tests/boundary/workspace-refresh.test.ts
```

The scoped runner accepts file filters directly, without a literal `--`.
Related tests follow static imports. Select explicit tests for dynamic plugin
registration, IPC wiring, and runtime assembly.

Use a workspace typecheck while editing one surface, then the root typecheck
when shared contracts or dependency boundaries change:

```sh
nub run cli:typecheck
nub run desktop:typecheck
nub run typecheck
```

Format the files you changed with `nubx biome check --write <paths>`. The root
`lint` command rewrites the repository, so use explicit paths during routine
work. `nub run lint:check` checks formatting and lint without modifying files.

## Desktop reload

```sh
nub run desktop:dev
```

The supervisor serves the renderer through Vite and watches the Electron
main/preload and CLI runtime builds. Shared imported source changes rebuild
the affected entries. Character and skill assets also trigger reloads.
Compile failures keep the running app alive until the next successful build.

A restart asks the dev app to shut down normally and waits before relaunching.
If shutdown stalls or is refused, quit that dev app normally and restart the
command. Do not force-kill a process with open runtime state as a normal reload
strategy.

Choose a separate profile or port when running more than one dev instance:

```sh
DOOLITTLE_DEV_PORT=5174 nub run desktop:dev -- --user-data-dir=/absolute/private/dev-profile
```

The default profile is `var/desktop-dev/profile`. Restart the supervisor after
changing its configuration or installing dependencies. Packaging and local
app installation are separate workflows from this reload loop.

## Implement a feature

Put shared runtime behavior in `packages/agent`; put terminal presentation in
`apps/cli` and Electron or renderer behavior in `apps/desktop`. Keep shared API
records in `packages/contracts` and reusable browser controls in `packages/ui`.
Import other workspaces through their declared exports.

Doolittle composes the ElizaOS engine. Use official SDK lifecycles for model
calls, plugins, tasks, account selection, memory, and coding orchestration.
Introduce product adapters only where Doolittle needs its own UX or boundary.

To add an action or prompt-context provider:

1. Implement the SDK `Action` or `Provider` in the relevant agent source folder.
2. Register it in
   [`runtime/native/plugin-registry/product/index.ts`](../packages/agent/src/runtime/native/plugin-registry/product/index.ts).
3. Extend a behavior test under `tests/`; add runtime journey coverage when
   registration, process ownership, or transport wiring changes.

Model-provider adapters belong under `packages/plugins` and register SDK model
handlers through the provider registry. Do not create a second SDK lifecycle.
Doolittle-owned prompt construction must use the shared
[`runtime/prompt-cache`](../packages/agent/src/runtime/prompt-cache/README.md)
module. User input, secrets, and per-request data must remain volatile.

For UI work, follow the [interface guide](interface.md). In particular, preserve keyboard and
screen-reader behavior, quiet input focus, ownership of drafts and streams,
and reduced-motion behavior.

## State and ownership

Keep bot, conversation, workspace, and request identities attached to effects.
A view switch must not move a draft, terminal, or pending approval into another
conversation. A transport error alone does not prove work stopped; use the
existing receipts and recovery paths.

Use the existing strict state readers and atomic publication helpers. Missing
optional state differs from corrupt or unreadable state. Never swallow state
errors by replacing data with an empty default.

Preserve unrelated edits during development. Keep local runtime artifacts in
ignored locations and inspect `git diff` before staging explicit paths.

## Finish a change

Run the smallest relevant tests and required typecheck once the implementation
settles. Use [testing](testing.md) for broader coverage and [releases](releases.md)
for artifact verification. Check documentation links after changing Markdown:

```sh
nub run check:local-links
```

Document the resulting behavior, commands, and limits. Keep implementation
history and temporary audit notes out of the developer handbook.
