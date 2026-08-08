# Doolittle Documentation

Use this page to find the right document without having to infer whether a file
is an operator guide, generated runtime truth, or a maintainer design record.

## Use Doolittle

| Document | Purpose |
| --- | --- |
| [Quickstart](./quickstart.md) | Install Doolittle, configure a first provider, and verify the runtime. |
| [Operator loop](./operator-loop.md) | Learn the shortest daily shell, runtime, and gateway workflow. |
| [Desktop](./desktop.md) | Install, develop, package, and understand the Electron security boundary. |
| [Skills Hub](./skills-hub.md) | Understand native Eliza skill ownership and Doolittle's operator projection. |

## Understand the Runtime

These files are generated from code and are the canonical reference for
assembled runtime behavior. Do not edit them directly.

| Document | Source of truth |
| --- | --- |
| [Plugin inventory](./plugin-inventory.md) | Runtime plugin catalog plus workspace inspection. |
| [Capability truth](./capability-truth.md) | Code-backed real, degraded, and caveat records. |

Regenerate and validate them from the repository root:

```bash
nub scripts/sync-doc-truth.ts --write
nub run check:docs-truth
```

## Contribute and Maintain

| Document | Purpose |
| --- | --- |
| [Monorepo layout](./monorepo.md) | Workspace roles, ownership boundaries, bootstrap, and validation. |
| [Module structure guidelines](./module-structure-guidelines.md) | Folder, filename, entrypoint, and test-placement conventions. |
| [Package ownership](./package-ownership.md) | Current Eliza-native, product-owned, compatibility, and data-package boundaries. |
| [Eliza maximization matrix](./eliza-maximization-matrix.md) | Dated maintainer audit of native SDK ownership and remaining adapters. |

## Documentation Rules

- Treat the root `package.json` `elizaSdk` field and overrides as authoritative
  for the supported ElizaOS version.
- Treat the runtime command catalog and `doolittle --help` as authoritative for
  command names.
- Keep operator guidance focused on observable behavior and degraded states.
- Link to repository files instead of copying long implementation inventories
  into hand-maintained guides.
- Run `nub run check:local-links` after moving, adding, or removing Markdown.
