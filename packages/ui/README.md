# @doolittle/ui

Shared browser-only React controls and compositions over official Eliza UI
primitives. The package supplies Doolittle styling and interaction conventions;
client shells retain runtime, credentials, Electron, editor, and terminal engines.

## Use

Consume the declared exports from the [package manifest](package.json):

```tsx
import { Button, Input } from "@doolittle/ui/controls";
import type { UiHostV1 } from "@doolittle/ui/host";
```

The root export includes controls, surfaces, context menus, settings, themes,
and motion helpers. Dedicated subpaths expose `controls`, `surfaces`, `host`,
`themes`, `environment`, and `styles.css`. Import only the surface a consumer
needs. React is a peer dependency supplied by the host application.

The host subpath re-exports the serializable UI-host contracts from
`@doolittle/contracts`; it does not provide a native host implementation.
Browser environment helpers manage media preferences and visibility-aware
polling without owning the application's runtime state.

## Buttons

Use `Button` with one of the canonical action variants for new Doolittle UI:

- `primary` for the main forward or confirmation action.
- `secondary` for ordinary bordered actions.
- `danger` for destructive actions that need explicit friction.
- `text` for low-emphasis inline actions such as cancel, retry, or disclose.

The upstream Eliza variants (`default`, `destructive`, `outline`, `ghost`,
`link`, and the `surface*` family) remain accepted so existing consumers can
migrate incrementally, but they are compatibility inputs rather than the
Doolittle contract. Do not add new route-local `primary-button`,
`secondary-button`, `danger-button`, or `text-button` compositions; migrate
those call sites to the matching canonical `Button` variant when touching the
owning route. Button sizes are the explicit upstream sizes (`default`, `sm`,
`lg`, `icon`, `icon-sm`, and `icon-lg`), with `default` bridged to the host's
density-aware control height.

## Focus contract

`styles.css` defines the two canonical keyboard-focus treatments:

- `--focus-quiet` / `--focus-quiet-offset`: a thin neutral inset outline for
  fields, dropdown triggers, menu rows, tabs, and other dense navigation.
- `--focus-command` / `--focus-command-offset`: a clearer accent outline for
  command buttons and links.

Use those custom properties instead of inventing local widths, colors, or
offsets. Invalid fields may keep a positive offset so validation borders stay
visible, but they retain the quiet outline color and width. Preserve the
forced-color overrides in `styles.css`.

## Spacing contract

Doolittle does not expose a generic numbered spacing scale. Use the semantic
component tokens instead: `--page-gap` for route-level gaps, `--card-pad` for
card inset, `--row-pad` for row and table inset, and `--control-height` for
standard control height. Density and theme manifests retune those tokens at
the root. Local one-off spacing is acceptable when a component has a real
structural constraint, but new shared `--space-*` aliases should not be added
without a consumer and a documented semantic role.

## State surface variants

`StateSurface` supports three canonical variants. Choose the variant by
context rather than restyling the surface locally:

- `hero` (default): centered route- or panel-sized loading, empty, error, and
  offline states with room for explanatory copy and actions.
- `pane`: compact centered states for inspectors, utility panes, and nested
  workbench panels.
- `inline`: quiet left-aligned factual empty lines or the contents of a
  drop-zone whose parent supplies the target treatment. Inline titles use a
  paragraph rather than adding a heading to the document outline.

Renderer `EmptyBlock` accepts the same `variant` values. Its legacy
`density="compact"` input remains as a compatibility alias for `variant="pane"`.
`children` are optional; title-only states should omit them rather than render
`{null}`.

## Develop

From the repository root:

```sh
nub run ui:typecheck
nub run test:scope tests/boundary/desktop-appearance.test.ts
nub run desktop:dev
```

`nub run ui:test` runs the root boundary suite, not a separate UI-only suite.
Use explicit test filters for the controls or consumer workflow being changed.
Source is exported directly; this workspace has no independent build step.

Keep components controlled and browser-safe. Preserve accessible names,
keyboard navigation, visible quiet focus, reduced motion, and forced-color
behavior. Message inputs and dropdowns must not acquire thick focus frames or
glows. See [interface development](../../docs/interface.md) and
[testing](../../docs/testing.md) for the shared rules and visual checks.
