# @doolittle/desktop

Electron client for Doolittle's shared ElizaOS runtime. It owns native application
lifecycle, the privileged host boundary, and the React interface. Runtime and
model execution remain in `@doolittle/agent` and the SDK.

## Develop

Install the workspace graph using the [setup guide](../../docs/setup.md).
From the repository root:

```sh
nub run desktop:runtime:install
nub run desktop:dev
nub run desktop:typecheck
nub run test:scope tests/boundary/desktop-model-routing.test.tsx
```

The dev supervisor serves the renderer with Vite and rebuilds the main, preload,
and runtime entries when their sources change. It uses
`var/desktop-dev/profile` by default. Use a separate `--user-data-dir` to isolate
another instance; see [development](../../docs/development.md).

## Source boundaries

- [`src/main`](src/main) owns windows, runtime process bindings, project grants,
  updates, and IPC admission.
- [`src/preload`](src/preload) exposes the context-isolated client contract.
- [`src/renderer`](src/renderer) owns presentation over the host transport and
  controlled components from `@doolittle/ui`.
- [`src/shared`](src/shared) holds desktop routing/presentation additions and
  re-exports canonical run/model contracts from `@doolittle/contracts`.
- [`scripts`](scripts) contains development, runtime tracing, artifact,
  provenance, and packaging helpers.

Keep credentials and native capabilities outside the renderer. Main-process
requests must retain sender, bot, conversation, and workspace identity through
asynchronous work. UI selection alone never grants filesystem access. Follow the
[architecture](../../docs/architecture.md) and
[interface conventions](../../docs/interface.md) when changing these boundaries.

## Build and package

```sh
nub run desktop:build
nub run desktop:package:dir
nub run test:e2e:desktop-packaged
```

Release packaging requires clean committed source and the platform prerequisites
in [releases](../../docs/releases.md). Outputs go to `apps/desktop/release`.
Typechecks and DOM tests do not establish native launch, signing, installation,
or update behavior; select the real journeys in [testing](../../docs/testing.md).
