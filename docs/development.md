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
nub run desktop:dev -- --workspace /absolute/path/to/project
```

The supervisor watches the Rust and GPUI code, ElizaOS runtime sources,
characters, and skills. A successful build restarts the development app
without a new install. The running app stays available during a compile failure.

A restart uses the app's normal shutdown. Finish active turns, send or clear
composer drafts, and save editor changes to let the app restart.

Each workspace uses a separate profile under `var/desktop-native-dev`.
You can also choose a profile:

```sh
nub run desktop:dev -- --workspace /absolute/path/to/project --profile /absolute/private/dev-profile
```

Restart the supervisor after changing its configuration or installing
dependencies. For the Electron compatibility client, use
`nub run legacy:desktop:dev`.

## Implement a feature

Put shared runtime behavior in `packages/agent`, terminal presentation in
`apps/cli-native`, and GPUI behavior in `apps/desktop-native`. Keep the
ElizaOS process entrypoints in `apps/cli` and shared API records in
`packages/contracts`.
Import other workspaces through their declared exports. Shared run, model-route,
execution, and worker-host records belong in `packages/contracts`; extend those
records with local routing context instead of copying them into a client.
Application entrypoints use `ApplicationSession` to own the profile's service
graph and lazy SDK runtime. Stdio and IPC adapters consume explicit domain ports;
they do not construct a second application context.

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
