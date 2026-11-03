# ElizaOS source-build tools

Isolated dependency toolchain and source selection for qualifying Doolittle's
upstream SDK archives. This is a private build-tools package, outside the product
workspaces; applications must not depend on it.

- [`source.json`](source.json) selects the upstream commit and source packages.
- [`package.json`](package.json) and [`nub.lock`](nub.lock) pin build dependencies.
- [`build-eliza-source.ts`](../../scripts/build-eliza-source.ts) fetches and builds
  the selected unmodified source, then records archive and tree hashes.
- [`vendor/elizaos`](../../vendor/elizaos) contains the resulting archives,
  provenance receipts, and materialized SDK workspace manifests.

## Normal development

Run from the repository root:

```sh
nub run deps:install -- --frozen-lockfile --ignore-scripts
nub run check:eliza-sdk
```

Normal installation consumes the checked archives without fetching upstream Git
or rebuilding the SDK. `nub run sdk:source:prepare` verifies and materializes the
archives without installing the remaining dependencies.

## Qualify a source change

```sh
nub run sdk:source:build
nub run sdk:source:build -- --verify
```

The source builder fetches into ignored `var/`, uses a fresh home and an explicit
environment, and rejects upstream implementation edits before and after building.
It uses upstream build scripts, removes development metadata when packing, and
records exact inputs. Do not modify implementation under `vendor` or
`node_modules`, or add local SDK patches to make an upgrade pass.

`--verify` compares archive bytes with existing receipts. Some upstream CommonJS
output embeds temporary build paths, so complete byte reproducibility is not
guaranteed. Doolittle qualifies the Node ESM entrypoints it consumes. Archive
integrity and working runtime behavior require separate verification.

See [SDK maintenance](../../docs/sdk.md) for upgrading the source contract and
published exceptions, and [releases](../../docs/releases.md) for artifact checks.
