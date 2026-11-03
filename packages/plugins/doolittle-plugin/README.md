# Doolittle product plugin

Product-specific plugin source inside the private `@doolittle/plugins`
workspace. This directory has no independent package manifest or release.

It contains coding and workspace adapters, forms, planning, local-sandbox
integration, identity and experience facets, memory projections, and the
namespaced secrets persistence mirror. The SDK remains responsible for the
underlying engine, credentials, model transport, tasks, and persistence lifecycle.

## Host integration

The [public barrel](index.ts) exports the product facet factories. The
[plugin composer](plugin.ts) applies selected-provider or explicit offline
bootstrap model handlers to an application-composed plugin. The agent host
owns its actions, prompt-context providers, routes, and lifecycle assembly.

Consume the parent workspace's declared exports:

```ts
import { createDoolittlePlugin } from "@doolittle/plugins/doolittle-plugin/plugin";
```

Other subpaths expose `routes`, `sdk-capabilities`, `sdk-native-surface`, and
`secrets-vault`; see the [parent manifest](../package.json). Keep dependencies
pointing toward SDK and shared contract types, never back into the hosting
application. Offline bootstrap behavior must remain explicitly configured.

## Develop

From the repository root:

```sh
nub run --cwd packages/plugins typecheck
nub run check:plugin-boundaries
```

Select focused behavior tests under `tests/` for the facet being changed, and
use runtime journeys when registration or host wiring changes. See
[architecture](../../../docs/architecture.md) and
[testing](../../../docs/testing.md).
