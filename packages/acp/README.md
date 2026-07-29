# ACP

Doolittle's stable ACP v1 foundation is built on
`@agentclientprotocol/sdk@1.3.0`.

`createDoolittleAcpAgent()` registers only the stable lifecycle used by
Doolittle: `initialize`, `session/new`, `session/load`, `session/prompt`,
`session/update`, and `session/cancel`. Client-side permission, filesystem, and
terminal methods are handled by the runtime bridge in `packages/agent`.

The registry executable is:

```sh
nub packages/agent/src/acp-server.ts
```

It reserves stdout for newline-delimited ACP JSON-RPC and redirects application
logs to stderr. Doolittle's API/desktop runtime also uses the same official SDK
agent and client apps in-process.

Editor focus and rich context are not advertised as stable ACP capabilities.
Clients opt in with `doolittle/editor-context` and `doolittle/resources` in
`_meta`; context resources remain extensibility metadata until ACP standardizes
the newer editor surface.
