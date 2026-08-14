# Doolittle Desktop

Doolittle Desktop is a native operator surface over the same ElizaOS runtime
used by the CLI, cockpit, gateway, and API. It keeps native machine lifecycle
in Electron, presentation in React, and agent behavior in the shared runtime.

## Architecture

```text
Electron main process
  ├─ owns the Doolittle child process
  ├─ binds it to 127.0.0.1 on an operating-system-assigned port
  ├─ probes health and owns restart/shutdown
  └─ validates and relays bounded agent requests and dedicated streams
            │
            │ narrow, context-isolated preload bridge
            ▼
React renderer
  ├─ owns navigation and presentation state
  ├─ uses the official ElizaClient through an AgentRequestTransport adapter
  ├─ renders chat, code, browser evidence, review, and agent orchestration
  └─ has no Node.js or filesystem access
            │
            ▼
Doolittle API
  ├─ remains authoritative for sessions and messages
  ├─ assembles the ElizaOS runtime and plugins
  └─ streams model and tool progress as server-sent events
```

The desktop is not a wrapper around the terminal UI. Electron owns
machine-level capabilities, React owns the operator experience, and the
Doolittle API owns agent behavior and durable runtime state.

Ordinary renderer requests use `@elizaos/ui`'s `ElizaClient`, so Eliza owns
client identity, request deadlines, resume retries, response parsing, and
structured `ApiError` failures. Because Electron cannot structured-clone native
`Request`, `Response`, or streaming bodies, the preload carries only path,
method, approved headers, serialized body, status, and response text. The main
process still enforces the route, query, method, header, request-size, and
response-size allowlists before contacting the loopback runtime. Chat, terminal,
and PTY traffic retain dedicated cancellable channels instead of imitating a
stream through this adapter.

## Operator surfaces

The desktop organizes everyday agent work around four operator areas while
keeping Doolittle's native runtime and cross-platform Electron boundary:

- **Workspace:** streaming chat, searchable sessions, a conflict-aware code
  editor, queued follow-up messages, managed chat attachments, inline
  tool/action/mutation run receipts, confirmed terminal commands with safe
  test/build/status presets, an interactive xterm PTY, Git changes, local
  recovery checkpoints, and confirmed create-only worktrees, a
  sandboxed localhost browser preview with history and responsive device
  widths, structured browser evidence, human-in-the-loop review, secure
  generated-artifact viewers, and task/agent/run orchestration.
  Coding tasks start only from an active, selected Git worktree: the desktop
  verifies its branch with the local runtime, creates the official Eliza
  orchestrator task, starts its ACP session, and carries the resulting session
  receipt into Queue and branch context into Review. Retried launch requests
  reuse their durable task instead of starting another session.
- **Create and observe:** media generation, scheduled automations, local-only
  usage analytics, and one searchable activity trail across approvals,
  workspace changes, delegated tasks, generation runs, terminal commands,
  deliveries, and logs. The trail deliberately reports bounded, server-owned
  summaries: it omits commands, prompts, paths, raw log output, and secrets.
- **Agent:** model selection, provider connections, tool and skill catalogs,
  plugin inventory, scheduled automations, personality profiles, and explicit
  controls for Eliza's native autonomous reasoning loop.
- **Manage:** filtered runtime logs, every persisted non-secret setting,
  appearance profiles, execution-backend status, doctor checks, setup state,
  architecture details, local recovery commands, runtime/plugin diagnostics,
  compatibility checks, registry search, and onboarding readiness.

The default Home surface is a live mission-control view over runtime health,
repository state, setup readiness, recent sessions, pending approvals, and
delegated work. A persistent status strip and `Cmd/Ctrl+K` palette keep
workspace, route, tasks, approvals, conversations, files, and logs reachable
without navigating through settings. Chat includes an in-context route switcher
for local and linked providers. Native completion notifications are shown only
while the app is in the background and deliberately omit prompts, responses,
paths, commands, and other private task content.

Registry search uses Eliza's official registry client. Every installable release,
including first-party metadata, remains blocked unless its canonical package
name is listed in `DOOLITTLE_EXTENSION_ALLOWLIST`; this prevents the beta
installer's npm-to-Git fallback from bypassing operator policy. Every install
requires a second explicit approval and asks Eliza's installer for the reviewed
registry version. The renderer cannot supply a Git URL or arbitrary version.
Because the installed
beta SDK does not return an npm integrity digest or resolved install source,
the Registry page labels those fields as unverified instead of treating
registry presence as cryptographic trust.

### Gateway pairing approvals

The Gateway page is a local operator surface for the official Eliza
`PairingService`. It lists pending sender requests by platform and sender ID,
requires a second confirmation before approve, deny, or revoke, and shows the
approved allowlist when the service exposes it. The API caps lists at 500
records and the desktop requests the newest 200. When the installed Eliza SDK
exposes pairing page methods, Doolittle reads those official pages in bounded
chunks; beta.7 falls back to the legacy array methods before applying the same
output cap. Doolittle does not create a second pairing database, bind a network
listener, issue remote-desktop tokens, or expose connection secrets. Expired
requests are filtered by Eliza; the public service does not expose a
per-request expiry timestamp.

The desktop can remain running in the tray when the operator explicitly enables
background mode. Update checks are also explicit: packaged builds use signed
GitHub release metadata generated by electron-builder, expose
check/download/install state in the UI, and never redirect the renderer to an
arbitrary update origin.

Settings are generated from the runtime's persisted settings payload instead
of a duplicate desktop schema. Secrets and OAuth tokens are intentionally
absent: connection actions cross a narrow IPC allowlist, but secret values are
never returned to the renderer.

### MCP marketplace discovery

The Tools page separates configured MCP connections from the official MCP
Registry exposed through Eliza. Marketplace search and server detail requests
use only `@elizaos/agent/services/mcp-marketplace`; the renderer may search
bounded text and select a registry server name, but it cannot supply a URL,
package name, command, header value, or environment value. A selected
definition shows its repository, version, transport, declared
environment/header requirements, and the official generated configuration
preview. This is deliberately preview only: no package is installed, no command
is run, no secret is accepted or echoed, and no configuration is persisted.
Operators must review the preview, make an explicit audited settings change
outside this screen, and restart the runtime before a new MCP server can
connect.

## Install and launch

From a source checkout, the normal install flow now includes the desktop
launcher:

```bash
bash scripts/install.sh
doolittle desktop --source
doolittle desktop
```

To keep this one-command from bootstrap to app, use:

```bash
bash scripts/install.sh --desktop
```

The first desktop launch builds an unpacked app for the current operating
system. Later launches reuse it. Use `doolittle desktop --force-build` after
changing desktop or runtime source, and `doolittle desktop --source` for the
Vite development loop.

The packaged app carries a bundled Doolittle runtime executed by Electron's
embedded Node. It does not require Nub, Node.js, or a source checkout after
installation.

Windows operators can use the PowerShell bootstrap script for parity:

```powershell
pwsh scripts/install.ps1
```

## Local development

Install the root workspace once, then start the desktop:

```bash
nub install --frozen-lockfile --ignore-scripts
nub run desktop:runtime:install
nub run desktop:dev
```

The workspace install does not execute transitive lifecycle scripts. Electron's
runtime is the one required install script and is invoked explicitly above.

Production renderer builds also enforce measured JavaScript budgets. The
initial shell, Chat, Orchestration, and Coding Workspace each have explicit
route budgets, and the full renderer has a total budget that includes Monaco
workers. This keeps the existing lazy-route architecture measurable and turns
future profiling work into a regression gate instead of a speculative rewrite.

## Local sandbox image

Doolittle's local autocoder sandbox uses the official Eliza `SandboxManager`.
Before the first local sandbox run, build its required image in the container
engine image store that Eliza will use:

```bash
nub run sandbox:setup
```

This builds `eliza-sandbox:bookworm-slim` from the pinned
[`scripts/docker/sandbox/Dockerfile`](../scripts/docker/sandbox/Dockerfile).
On Apple Silicon macOS, a callable Apple Container CLI is selected; otherwise
a healthy Docker engine is selected. The setup command never installs or starts
either engine. The image provides `python3`, `node`, `nub`, `bash`, uid 1000,
and the `/workspace` mount contract used by `SandboxManager`.

To run the opt-in engine-backed check after building it, use:

```bash
nub run test:sandbox:integration
```

### Sandbox lifecycle

The desktop Execution environments view exposes the same local lifecycle in a
Sandbox isolation card: create Node.js or Python containers, select an explicit
target, run Python/JavaScript/TypeScript/Bash, inspect bounded output, and stop
the selected sandbox.

Use `/e2b list` to inspect sandboxes, `/e2b create [node-js|python]` to create
one, `/e2b exec [--sandbox <id>] <python|javascript|typescript|bash> :: <code>`
to execute code, and `/e2b kill [sandbox-id]` to stop it. The runtime exposes
the same lifecycle over HTTP: `POST /e2b/sandboxes` with
`{"template":"python"}`, `POST /e2b/execute` with
`{"sandboxId":"<id>","language":"python","code":"print('hello')"}`,
and `POST /e2b/kill` with `{"id":"<id>"}`. `GET /e2b/sandboxes` lists the
current sandbox state. Unsupported templates return `400` with the supported
templates. Closing, ownership-conflict, and unverified-cleanup states return
`409` so operators can refresh and retry without losing the retained sandbox.

The development launcher starts Vite for the renderer, builds the Electron
main and preload bundles in watch mode, and launches Electron with the local
Doolittle runtime.

Quality checks:

```bash
nub run desktop:typecheck
nub run desktop:test
nub run desktop:build
```

Build a runnable unpacked app for the current machine:

```bash
nub run desktop:package:dir
```

Build the macOS DMG and zip:

```bash
nub run desktop:package:mac
```

The artifacts are written under `apps/desktop/release/`.

## Windows installer

The supported Windows artifact is a per-user x64 NSIS installer with Start
Menu and desktop shortcuts:

```bash
nub run desktop:package:win
```

Build Linux packages:

```bash
nub run desktop:package:linux
```

Build every supported installer in one pass from macOS:

```bash
nub run desktop:package:all
```

The all-platform command compiles the desktop and bundled runtime once, then
builds and verifies the macOS ARM64 DMG/ZIP, Windows x64 NSIS installer, and
Linux ARM64 AppImage/DEB. Wine is required for the Windows cross-build. It
removes same-version stale outputs before starting and writes artifact sizes,
SHA-256 hashes, and the source commit to
`apps/desktop/release/release-manifest.json`.

The installer is written to:

```text
apps/desktop/release/Doolittle-<version>-win-x64.exe
```

Copy that `.exe` to the Windows machine, run it, choose the install directory,
and launch Doolittle from the Start Menu or desktop shortcut. The application
and agent runtime are self-contained; Nub, Node.js, Git, and the source checkout
are not required on the Windows machine.

Unsigned local development installers can show an Unknown
Publisher/SmartScreen confirmation. Tagged release builds are not allowed to
publish unless their Authenticode signatures verify.

For signed GitHub release builds, configure the repository Actions secrets
`WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD`. The Windows workflow passes those
credentials directly to electron-builder and requires valid Authenticode
signatures on both `Doolittle.exe` and the NSIS installer before upload.

Use the PowerShell helper when you want the installer artifact directly from a
Windows checkout:

```powershell
pwsh scripts/install.ps1 -PackageInstaller
```

For local-model chat on a fresh Windows machine, install Ollama and pull the
default models:

```powershell
ollama pull granite4.1:3b
ollama pull nomic-embed-text
```

The desktop itself still opens and exposes runtime status in explicit offline
bootstrap mode when a model provider is not yet available.

The canonical release build runs on `windows-latest` through
`.github/workflows/desktop-windows.yml`. Run that workflow manually to download
the `Doolittle-Windows-x64` artifact, or push a `v*` tag to attach the installer
to a GitHub release. The workflow boots the compiled runtime and requires a
healthy native Windows API response before it uploads the installer. Building
Windows from macOS/Linux is also supported by electron-builder when Wine is
installed, but the native Windows workflow is the release gate.

## Runtime lifecycle

In development, the main process launches the checked-out agent with:

```text
nub packages/agent/src/index.ts api
```

Packaged applications instead launch the bundled
`runtime/bin/doolittle-runtime.mjs` bundle. Electron starts that file with
`ELECTRON_RUN_AS_NODE=1`, so the installed application uses Electron's embedded
Node and has no external runtime dependency.

It supplies `DOOLITTLE_MODE=api`, `ELIZA_API_BIND=127.0.0.1`, and
`ELIZA_API_PORT=0`. Its PGLite, Doolittle, cron, gateway, and hooks directories
live under the Electron application data directory, so desktop startup cannot
migrate or lock mutable CLI data from the checkout. The workspace and skills
roots point at the checked-out or packaged runtime so agent tools can do useful
work. A source launch copies existing non-secret onboarding/settings state into
the desktop profile on first use; a standalone installer seeds a desktop
first-run receipt and can boot in explicit offline fallback mode before a model
provider is connected. Doolittle reports the actual bound URL only after
deferred API hydration completes. The desktop parses that announcement,
verifies `GET /health`, and exposes a ready or degraded state to the renderer.

Conversation routes use the Node HTTP streaming path because a local model or
tool-running turn can remain quiet for more than ten seconds. Stream
producer failures become terminal SSE error events, and a disconnected
renderer cannot crash the runtime by racing a closed stream.

The foundation plugin also mounts Eliza's official autonomy service, actions,
providers, and routes. It starts disabled: simply launching Doolittle never
starts autonomous background reasoning. The Runtime page shows native service
status and lets the operator choose a 5-second to 10-minute cadence before
explicitly enabling the loop. Once enabled, Eliza owns prompt batching,
reasoning, action execution, and shutdown; normal provider usage and costs
apply. This native loop is distinct from Doolittle's operator autonomy profile,
which configures product policy rather than implementing another reasoning
engine.

Quitting the application aborts active streams and sends `SIGTERM` to the owned
child process. The API entrypoint handles that signal idempotently through one
adapter-safe shutdown boundary before exiting, so Eliza plugin services stop
and PGLite closes cleanly; Electron retains a bounded force-kill fallback for
a wedged child. Closing the last window does the same by default;
when the operator has enabled background mode, the main process and runtime
remain available from the tray. A failed boot stays visible and retryable; the
renderer never waits on an indefinite loading skeleton.

## Workspace checkpoints

The Changes workbench can create and restore local Git checkpoints. Checkpoints
are stored under `refs/doolittle/checkpoints/*` using a temporary index, so
creation never mutates the repository's real index or worktree. Only
workspace-visible changed paths are captured; protected or private uncommitted
paths block snapshot creation instead of being persisted in Git objects.

Agent writes create a checkpoint first. Restore requires the checkpoint ID to
be echoed in a confirmed request, creates a recovery checkpoint of the current
state, and uses `git restore` rather than reset or checkout. The runtime remains
running throughout the operation.

## Security boundary

- Renderer isolation and sandboxing stay enabled.
- The preload exposes a small typed Doolittle capability, not raw IPC.
- API paths and methods are allowlisted in the main process.
- The local backend listens on loopback only.
- Renderer code cannot spawn processes, read outside the selected workspace,
  choose an arbitrary backend origin, or invoke generic write/terminal routes.
- File saves are workspace-relative, size-bounded, conflict-aware, and require
  a native confirmation. Terminal commands are length- and time-bounded and
  require a native confirmation before the runtime receives them.
- Worktree creation validates the branch twice, rejects traversal, existing
  paths, and symlink escapes, stays inside the selected workspace, and requires
  a native confirmation. Destructive worktree removal is not exposed.
- The embedded preview accepts loopback HTTP(S) pages only and runs them in a
  sandboxed frame. Remote pages stay outside the frame and are inspected
  through the browser evidence service.
- Browser evidence requests accept bounded HTTP(S) URLs without embedded
  credentials or control characters. Workflow bundles are explicit POST
  actions, so renderer refreshes cannot create artifacts.
- Generated artifacts are addressed by run ID and opaque index, never by a
  renderer-supplied path. The runtime enforces canonical artifact-root
  containment, regular-file and type checks, a 5 MiB limit, private no-store
  responses without wildcard CORS, and sandboxed HTML rendering. Public run
  records expose only artifact names and indices.
- Chat attachments are copied into private application-managed storage and
  referenced by opaque UUIDs. The main process validates count, name, magic
  bytes, per-file size, combined size, canonical containment, and file type;
  neither the renderer nor the model-facing API receives the selected local
  path.
- Background notifications contain generic completion or failure text only.
  Notification delivery failures cannot change the outcome of the completed
  agent or terminal operation.

New machine-level capabilities must follow the same pattern: one specific
main-process operation, one typed preload method, explicit validation, and a
user-visible receipt or confirmation when state can change.
