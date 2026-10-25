# Doolittle CLI

The terminal product owns plain chat, the optional fullscreen cockpit, slash
commands, one-shot output and background jobs. It also hosts API/gateway and ACP
process modes using the shared `@doolittle/agent` runtime.

From the repository root:

```sh
nub run start                    # interactive terminal chat
nub run start cockpit            # fullscreen operator deck
nub run start exec -p "/help" --json
nub run cli:build                # apps/cli/dist/index.js and acp-server.js
nub run cli:typecheck
```

The source installer links `doolittle` to `apps/cli/src/index.ts`. The compiled
entry can run with Node from another working directory. Application-root
discovery is independent of the user's current project directory; explicit
`DOOLITTLE_REPO_ROOT` remains available for packaged runtimes.

Internal terminal imports are relative. Shared runtime imports use its declared
package exports; runtime code never imports this application. Prompts, model
routing and plugin lifecycles remain in the runtime/SDK.

`DOOLITTLE_MODE=cli` keeps interactive chat without an API listener. `both` may
start the API after the terminal is ready. The desktop launches explicit `api`
mode; it does not load terminal UI code into its renderer.

`nub run test:integration` exercises the built CLI in a private profile and a
real terminal, then checks shared-engine workers. These tests are offline and
make no claim about paid-provider response quality.
