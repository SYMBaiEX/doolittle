# @doolittle/plugins

Private workspace for Doolittle's product plugin source and shared plugin
dependencies. Its child workspaces provide the narrow
[`plugin-claude-code`](plugin-claude-code) fallback and
[`provider-transport`](provider-transport) helpers.

## Product layer

[`doolittle-plugin`](doolittle-plugin/README.md) contains product actions,
services, persistence projections, and selected-provider model routing. It is
source inside this workspace, not an independently versioned package.

Import the declared subpaths in [package.json](package.json), such as
`@doolittle/plugins/doolittle-plugin` or
`@doolittle/plugins/doolittle-plugin/plugin`. There is no package-root export.
The host supplies application-specific actions, routes, and services through
composition; reusable plugin source must not import `packages/agent`.

Official ElizaOS packages own model transport, coding orchestration, SQL, MCP,
and messaging. Keep product-specific behavior in the existing Doolittle layer
rather than adding competing engine services.

## Develop

From the repository root:

```sh
nub run --cwd packages/plugins typecheck
nub run check:plugin-boundaries
nub run test:scope tests/boundary/removed-provider-routing.test.ts
```

The [plugin catalog](../agent/src/runtime/native/plugin-catalog/index.ts) defines
registration metadata; [capability definitions](../agent/src/runtime/native/capability-truth.ts)
define observable behavior. Inspect `/runtime/plugins` and `/runtime/status`
for a running profile's state.

See [architecture](../../docs/architecture.md) for extension boundaries and
[releases](../../docs/releases.md) for the separate provider publishing flow.
