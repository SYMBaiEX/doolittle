# Native Doolittle clients

Doolittle's native branch puts the desktop workbench in Rust and GPUI and the
terminal entrypoint in Rust. The shared ElizaOS runtime still owns model routing,
tool execution, sessions, memory, and providers. The native clients start the
same ElizaOS runtime through the existing CLI build, then exchange typed
requests and run events with it.

## Start a source build

Install the existing Node workspace and build with a Rust toolchain that
supports the workspace's stated minimum version. GPUI builds on macOS need the
Xcode toolchain with Metal.

```sh
nub run deps:install -- --frozen-lockfile --ignore-scripts
nub run native:dev -- --workspace /absolute/path/to/project
nub run native:chat -- --workspace /absolute/path/to/project chat
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
the same window. A narrow window shows one pane at a time and preserves the
split layout. The chat composer can import files through the system picker, and
the transcript shows wallet and trading receipts recorded by ElizaOS. In IDE
view, use **Search** for workspace text, **Git** for diffs, staging, commits,
branches, stashes, and remotes, and **Terminal** for a manually operated shell.
**Preview** opens a loopback development server in the system browser. Save existing text files with
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
and archived in private offline workspaces. Their conversation histories are
separate. The chat sidebar imports and exports individual
conversation archives between profiles.

For terminal use, run `nub run native:chat -- --help` to see one-shot runs,
the cockpit, accounts, approvals, automations, and background jobs. The `acp`
subcommand starts the existing ElizaOS ACP stdio service. Explicit `api` and
`gateway` launches bind to loopback and require a configured `ELIZA_API_TOKEN`.
Use `--bot <uuid>` with `chat`, `run`, `sessions`, `history`, `receipt`, or
`cancel` to operate on an existing private named agent in the selected profile.

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

The remaining Electron cutover includes saved pane layouts across restarts,
embedded browser preview, advanced Git panels, provider and project grants for
named agents, public connector ingress, and the updater. Native profiles use
their own data folders. Individual conversation archives are available for
manual transfer.

## Verify and package

```sh
nub run native:check
nub run native:test
nub run native:package:mac
```

The macOS command builds an ad-hoc signed app in `target/native-packages`. Its
resources contain Node.js and the verified ElizaOS runtime closure. Production
signing, notarization, installation behavior, and other desktop platforms need
their own release verification.
