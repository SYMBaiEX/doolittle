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
**New workspace** opens a separate window and preserves the original draft.
Use `--offline` to defer optional runtime initialization. For an offline
acceptance fixture, also select the offline model in the isolated profile and
launch without provider credentials. The clients choose
a private profile keyed by the canonical workspace path. A profile can be opened
by one runtime at a time. Use `--profile` with a fresh directory to run a second
client or test an isolated setup. Avoid sharing a live Electron or CLI data
directory with the native sidecar.

The native desktop uses the full workbench outside Chat. Agent and IDE views
share the selected conversation. The IDE preview reads the runtime's scoped file
tree and document contents. Native app restart and runtime failure remain visible
in the workbench.

## Runtime boundary

The host owns the child process, workspace selection, profile lock, and a random
runtime credential. The sidecar listens on an OS-assigned loopback port and
reports readiness on its private stdout pipe. Every request carries the runtime
credential. The host does not attach the credential to an arbitrary origin or
redirect. Closing the owner ends the pipe and requests normal ElizaOS shutdown.

The sidecar exposes lead chat, session history, run events, cancellation, and
scoped workspace reads. Electron-managed named-worker lifecycle, desktop grants,
privileged IDE actions, wallets, connector configuration, automation editors,
and ACP parity are separate cutover requirements. Existing clients remain
available for those workflows during the migration.

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
