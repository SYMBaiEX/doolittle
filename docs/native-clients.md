# Native Doolittle clients

Doolittle's desktop workbench uses Rust and GPUI, and its terminal client uses
Rust. The shared ElizaOS runtime owns model routing,
tool execution, sessions, memory, and providers. The native clients start the
same ElizaOS runtime through the existing CLI build, then exchange typed
requests and run events with it.

## Start a source build

Install the existing Node workspace and build with a Rust toolchain that
supports the workspace's stated minimum version. GPUI builds on macOS need the
Xcode toolchain with Metal.

```sh
nub run deps:install -- --frozen-lockfile --ignore-scripts
nub run desktop:dev -- --workspace /absolute/path/to/project
nub run dev -- --workspace /absolute/path/to/project chat
```

The desktop asks you to open a folder when launched without `--workspace`.
**New workspace** opens a separate window and preserves the original draft. Open
**Settings → Models** to pick a model, **Settings → Accounts** to connect an
account, or **Settings → Credentials** to enter a direct API key. See
[account and provider configuration](setup.md) for supported providers.
Use `--offline` to defer optional runtime initialization. For an offline
acceptance fixture, also select the offline model in the isolated profile and
launch without provider credentials. The clients choose a private profile keyed
by the canonical workspace path. Use a fresh `--profile` for an isolated setup.
Native runtimes in sibling workspace directories can run concurrently. A native
runtime keeps an exclusive lease on its workspace and blocks both duplicate and
nested workspace launches even with different profiles. Avoid sharing a live
Electron or TypeScript CLI data directory with the native sidecar.

Agent and IDE views share the selected conversation. Use Command-K to find a
destination. Conversation panes can split right or below, resize, and reopen in
the same window. A narrow window shows one pane at a time. The profile restores
split sizes, selected conversations, and recently closed panes on restart.
The chat composer can import files through the system picker, and
the transcript shows wallet and trading receipts recorded by ElizaOS. In IDE
view, use **Search** for workspace text, **Git** for diffs, staging, commits,
branches, stashes, and remotes, and **Terminal** for a manually operated shell.
On macOS, **Preview** embeds a loopback development server and keeps browsing
within the selected origin. Other platforms open the system browser. Save existing text files with
**Save** or Command-S. Switching files, reloading a file, and closing the window
prompt before discarding local edits. A busy workspace or changed file leaves
the draft in the editor.

**Appearance** supports Companion, Canvas, Anime Atelier, Golden Gate Glass,
and the ten runtime palettes, with light, dark, system, and density controls.
The desktop imports and exports Doolittle theme bundles. The Rust CLI uses its
runtime profile's theme settings.

Open **Work**, **Review**, **Automations**, **Agents**, and **Inbox** to inspect
or act on the runtime's work. **Home**, **Activity**, **Insights**, and
**Assets** are native views of runtime status, activity, usage, and managed
media. Named agents can be created, renamed, started, chatted with, stopped,
and archived in private workspaces. **Agents → Access** can attach a linked
provider route and open a separately scoped, read-only project chat. Revoke
those grants from the same panel. Conversation histories remain separate.
The chat sidebar imports and exports individual
conversation archives between profiles.

For terminal use, run `doolittle --help` to see one-shot runs,
the cockpit, accounts, approvals, automations, and background jobs. The `acp`
subcommand starts the existing ElizaOS ACP stdio service. Explicit `api` and
`gateway` launches bind to loopback and require a configured `ELIZA_API_TOKEN`.
Use `--bot <uuid>` with `chat`, `run`, `sessions`, `history`, `receipt`, or
`cancel` to operate on an existing private named agent in the selected profile.

### Connector callbacks

Run a dedicated native gateway for Slack Events API or WhatsApp Cloud API
webhooks. Export `ELIZA_API_TOKEN` for its owner API, plus `SLACK_SIGNING_SECRET`
for Slack or `WHATSAPP_APP_SECRET` and `WHATSAPP_VERIFY_TOKEN` for WhatsApp.

```sh
doolittle --workspace /absolute/path/to/project gateway --ingress-port 10443
```

The gateway listens on `127.0.0.1:10443` for `POST /webhooks/slack`,
`POST /webhooks/whatsapp`, and `GET /webhooks/whatsapp`. Point an HTTPS reverse
proxy at that callback port. Preserve each signed request body and keep the
WhatsApp verification query out of proxy request logs. The owner API stays on
its own authenticated loopback address. The gateway holds the workspace and
profile lease until it stops. Other connector transports use their existing
ElizaOS gateway configuration.

## Runtime boundary

The host owns the child process, workspace selection, profile lock, and a random
runtime credential. The sidecar listens on an OS-assigned loopback port and
reports readiness on its private stdout pipe. Every request carries the runtime
credential. The host does not attach the credential to an arbitrary origin or
redirect. Closing the owner ends the pipe and requests normal ElizaOS shutdown.

The native control plane permits individual methods and routes for each
operator capability. Desktop file imports and saves require desktop opt-in.
Saves compare the original editor buffer with the current file and use the same
workspace admission as native agent turns. Wallet tools still execute inside
ElizaOS, subject to its existing permissions and approval flow.

The default native profile checks the previous desktop profile on first use.
Doolittle imports histories associated with the exact workspace and compatible
settings for the last workspace. It reads the previous profile in place.
Configure credentials, account connections, connectors, and project permissions
in the native profile. An explicit `--profile` starts with isolated state.
Individual conversation archives are available for manual transfer.

## Verify and package

```sh
nub run native:check
nub run native:test
nub run desktop:package:mac   # macOS
nub run desktop:package:linux # Linux
nub run desktop:package:win   # Windows
```

The macOS command builds an ad-hoc signed `Doolittle Native.app` in
`target/native-packages`. The bundle includes the desktop, CLI, Node.js and the
verified ElizaOS runtime. For the signed packaging workflow and staged updater
acceptance, see [native macOS releases](native-macos-release.md).
Linux and Windows builds create a portable archive on their respective hosts.
Keep its `runtime/` directory beside the desktop and CLI executables.

On macOS, verify the bundled Node runtime, CLI connectivity, and desktop
startup and shutdown using an isolated offline profile:

```sh
python3 tests/native/packaged-macos.py "/path/to/Doolittle Native.app"
```
