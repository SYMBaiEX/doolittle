# Doolittle CLI

`@doolittle/cli` owns terminal chat, the fullscreen cockpit, command dispatch,
one-shot output, and background jobs. It also hosts API, gateway, and ACP process
modes using the shared `@doolittle/agent` runtime.

## Development

Run from the repository root after [setup](../../docs/setup.md):

```sh
nub run dev                     # watch the terminal entrypoint
nub run start                   # interactive terminal chat
nub run start cockpit           # fullscreen interface
nub run start exec -p "/help" --json
nub run start api               # loopback API process
nub run cli:build
nub run cli:typecheck
```

[`src/index.ts`](src/index.ts) is the source executable. The build writes
`dist/index.js` and `dist/acp-server.js`; the source installer links `doolittle`
to the source entrypoint. Application-root discovery is independent of the
current project directory. Packaged hosts can provide `DOOLITTLE_REPO_ROOT`.

## Ownership

Keep terminal presentation and process entrypoints here. Runtime behavior,
prompts, model routing, plugin lifecycles, and shared services belong in
`packages/agent` or the SDK. Import shared workspaces through their declared
exports; runtime code must not import the CLI application.

`DOOLITTLE_MODE=cli` keeps chat without an API listener. `both` can start the API
after terminal readiness. Desktop uses explicit API mode rather than loading
terminal UI into its renderer.

Use `nub run test:integration` when process entrypoints or runtime registration
change. See [testing](../../docs/testing.md) for fixtures and coverage boundaries,
and [architecture](../../docs/architecture.md) for package direction.
