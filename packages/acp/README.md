# Doolittle ACP

`@doolittle/acp` adapts Doolittle to the Agent Client Protocol using the official
`@agentclientprotocol/sdk`. Its pinned dependency and public export are defined
in [`package.json`](package.json).

## API and layout

Import from `@doolittle/acp`:

- [`src/protocol.ts`](src/protocol.ts) exports `createDoolittleAcpAgent`, its
  adapter contract, request parsing, and SDK protocol types.
- [`src/registry.ts`](src/registry.ts) exports tool classifications and
  registry/editor metadata helpers.
- [`src/index.ts`](src/index.ts) is the package's public barrel.

The agent factory registers initialization, session creation/loading, prompting,
and cancellation. The host adapter implements those operations and emits session
updates. Client permissions, filesystem access, and terminal operations remain
in the agent runtime bridge.

## Run and verify

The installed CLI exposes the protocol process:

```sh
doolittle acp
```

It reserves stdout for ACP JSON-RPC and sends application logs to stderr.
Desktop packaging includes the matching `doolittle-acp.mjs` runtime entrypoint.
Editor registries should use the installed command rather than a source path.

From the repository root:

```sh
nub run --cwd packages/acp typecheck
nub run test:integration
```

Run integration coverage when changing the wire lifecycle or runtime bridge.
Editor focus and rich resources are optional Doolittle `_meta` extensions, not
advertised stable ACP capabilities. See [architecture](../../docs/architecture.md)
and [testing](../../docs/testing.md) for ownership and verification guidance.
