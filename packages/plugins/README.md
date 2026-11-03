# Doolittle plugins

This workspace contains the consolidated
[`doolittle-plugin`](doolittle-plugin) product layer and the
[`plugin-claude-code`](plugin-claude-code) provider bridge. Shared provider
transport code lives in [`provider-transport`](provider-transport).

Official ElizaOS packages own model transport, coding orchestration, SQL,
MCP, and messaging. Keep product-specific actions and service projections in
the existing Doolittle layer; plugins must not depend on the application that
hosts them.

The [plugin catalog](../agent/src/runtime/native/plugin-catalog/index.ts) defines
runtime registration metadata, and the
[capability definitions](../agent/src/runtime/native/capability-truth.ts)
define observable behavior and degraded states. Inspect `/runtime/plugins` and
`/runtime/status` for a running profile's state.

See [architecture](../../docs/architecture.md) for extension boundaries and
[releases](../../docs/releases.md) for provider package verification.
