# Development setup

Doolittle uses Cargo for its Rust clients and Nub for the ElizaOS runtime.
Run repository commands from the root unless a command selects a workspace.

## Prerequisites

Use the Node version in [`.node-version`](../.node-version) and the Nub version
in the root [`package.json`](../package.json). The source installer can provision
the repository's Nub toolchain. Git and `tar` are required to materialize the
checked ElizaOS source archives.

Install the Rust version declared in [`Cargo.toml`](../Cargo.toml). GPUI desktop
builds require a graphical platform toolchain, including Xcode and Metal on
macOS. See [releases](releases.md) for packaging requirements.

## Install

The source installer installs dependencies, initializes local configuration,
and runs CLI onboarding:

```sh
bash scripts/install.sh
```

On Windows, use PowerShell:

```powershell
pwsh scripts/install.ps1
```

Include `--desktop` on macOS or Linux or `-Desktop` on Windows to build the GPUI
desktop during setup. The default source install builds the Rust CLI and ElizaOS
runtime. Run `doolittle desktop` to open the desktop from the CLI.

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

The installer also supports `--headless`, `--skip-wizard`, and `--check`.
On a clean checkout, `--check` validates the host toolchain and reports missing
dependencies. With dependencies installed, it also previews configuration.
See [`scripts/install.sh`](../scripts/install.sh) for automation options.

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
nub run dev                 # build and start the Rust CLI
nub run start               # terminal session
nub run start cockpit       # fullscreen terminal interface
nub run start api           # loopback API process
```

The default API address is `http://127.0.0.1:3000`; host and port are configurable.
Check startup with `curl http://127.0.0.1:3000/health` after the API reports ready.

For desktop development:

```sh
nub run desktop:dev
```

Native clients select a profile for the workspace folder. Use `--profile PATH`
for isolated development data. See [development](development.md) for the
reload workflow and [native clients](native-clients.md) for profile import.

### macOS saved accounts

On macOS, opening the desktop and browsing connection status use cached account
information. Use **Settings → Accounts** to connect an account, or
**Settings → Credentials** to save a direct key. Existing ElizaOS accounts
can still open their provider's existing vault when selected.

macOS may request access to the existing `eliza` Keychain item when encrypted
credentials are used. The system prompt asks for your Mac login Keychain
password. Doolittle never collects it. If access is locked or denied, Doolittle
preserves the encryption key and saved accounts. Unlock the login Keychain,
then retry the operation.

Use consistently signed desktop builds so macOS can recognize Doolittle across
updates. Switching from an ad-hoc build or changing signing teams can require
approval again. Use a notarized release, or follow the
[native release signing instructions](native-macos-release.md) if you already
have a Developer ID Application certificate.

## Confirm the checkout

```sh
nub run check:eliza-sdk
nub run test:scope tests/boundary/project-access.test.ts
```

Use [testing](testing.md) to select further coverage for the work you are doing.
Re-run dependency installation after changing manifests or pulling a lockfile
change. An SDK integrity failure requires checking the source receipts and
materialized workspaces, rather than editing installed SDK files.
