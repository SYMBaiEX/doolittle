# Development setup

Doolittle is a TypeScript monorepo managed with Nub. Run repository commands
from its root unless a command explicitly selects a workspace.

## Prerequisites

Use the Node version in [`.node-version`](../.node-version) and the Nub version
in the root [`package.json`](../package.json). The source installer can provision
the repository's Nub toolchain. Git and `tar` are required to materialize the
checked ElizaOS source archives.

Electron development requires a graphical desktop. Native packaging and
signing have additional platform requirements described in [releases](releases.md).

## Install

The source installer installs dependencies, initializes local configuration,
and runs onboarding:

```sh
bash scripts/install.sh
```

On Windows, use PowerShell:

```powershell
pwsh scripts/install.ps1
```

For an existing toolchain, install the exact dependency graph directly:

```sh
nub run deps:install -- --frozen-lockfile --ignore-scripts
cp .env.example .env
nub run bootstrap
```

Copy `.env.example` only when `.env` does not exist. The dependency command
verifies the checked SDK archives, unpacks their workspaces, and installs the
lockfile. Dependency lifecycle scripts are deliberately disabled; normal
installation does not fetch or rebuild upstream ElizaOS source.

Inspect bootstrap prerequisites without applying onboarding changes:

```sh
nub run bootstrap:check
```

The installer also supports `--headless`, `--skip-wizard`, and `--check`; inspect
[`scripts/install.sh`](../scripts/install.sh) before using these in automation.

## Configure a provider

The example environment and onboarding describe supported provider settings.
Use an existing local Codex or Claude login, configure a provider API key, or
select local Ollama. Saved model settings take precedence over product defaults.
A configured route still needs usable authentication and an available model.

From an interactive session, inspect readiness before sending model work:

```text
/accounts doctor
/model
```

For development without a model, explicitly set
`DOOLITTLE_OFFLINE_BOOTSTRAP=true` in the local environment. Offline replies and
successful startup do not demonstrate provider inference.

Keep credentials in ignored local configuration or the provider's own account
store. Never add `.env`, account records, local profiles, or model output to Git.
The current environment schema is
[`packages/agent/src/config/env/schema.ts`](../packages/agent/src/config/env/schema.ts).

## Start the applications

```sh
nub run dev                 # watched terminal entrypoint
nub run start               # terminal session
nub run start cockpit       # fullscreen terminal interface
nub run start api           # loopback API process
```

The default API address is `http://127.0.0.1:3000`; host and port are configurable.
Check startup with `curl http://127.0.0.1:3000/health` after the API reports ready.

For Electron, install its runtime once after a scriptless dependency install:

```sh
nub run desktop:runtime:install
nub run desktop:dev
```

Desktop development uses `var/desktop-dev/profile` by default. Installed app
profiles and the source checkout's `.doolittle/` state are separate. Supply
`--user-data-dir` when you need another isolated desktop profile; see
[development](development.md).

## Confirm the checkout

```sh
nub run check:eliza-sdk
nub run test:scope tests/boundary/project-access.test.ts
```

Use [testing](testing.md) to select further coverage for the work you are doing.
Re-run dependency installation after changing manifests or pulling a lockfile
change. An SDK integrity failure requires checking the source receipts and
materialized workspaces, rather than editing installed SDK files.
