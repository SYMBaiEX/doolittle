# SDK maintenance

The [root `elizaSdk` contract](../package.json) records the selected ElizaOS source
baseline and explicit published-package exceptions. Treat that manifest, the
lockfile, and the source receipts as authoritative; avoid repeating pinned
versions in guides.

## Source and published packages

`vendor/elizaos` contains qualified source-build archives and
[source receipts](../vendor/elizaos/source-builds.json). The
[source configuration](../tooling/eliza-source/source.json) pins the upstream
commit, selected packages, and tool versions. The isolated build manifest and
lockfile live beside it under `tooling/eliza-source`.

Normal installation verifies and materializes the archives into upstream
workspaces before resolving dependencies:

```sh
nub run deps:install -- --frozen-lockfile --ignore-scripts
```

This consumes checked artifacts without fetching upstream Git or rebuilding the
SDK. To materialize source workspaces alone, run:

```sh
nub run sdk:source:prepare
```

Keep both `vendor` and `tooling`: the first is the installation input, and the
second defines how it was produced. Unpacked implementation is generated;
tracked workspace manifests, archive hashes, tree hashes, and receipts establish
its provenance. Do not edit SDK implementation under `vendor` or `node_modules`.

Published packages can move independently when their public exports work with
the selected source baseline. Record each exception explicitly in `elizaSdk`
and overrides. Prefer a usable official package to a local compatibility shim;
reserve Doolittle packages for product behavior or a demonstrated upstream gap.

## Qualifying an upgrade

1. Inspect the candidate's public exports and the Doolittle consumers that need them.
2. Update the pinned source configuration or explicit published-package exception.
3. For a source change, run `nub run sdk:source:build` deliberately. It fetches
   upstream into `var/`, uses upstream build scripts, and produces archives and receipts.
4. Materialize the resulting archives, update workspace dependencies and overrides,
   and refresh the lockfile through the existing installation flow.
5. Run the integrity and boundary checks, then tests for the changed consumers.

```sh
nub run check:eliza-sdk
nub run check:monorepo
nub run check:plugin-boundaries
nub run typecheck
```

The builder uses an isolated home and explicit environment, rejects upstream
implementation edits, removes development metadata from packed artifacts, and
records the build inputs. Preserve these checks when extending the package set.
Keep Nub's exotic-subdependency restriction enabled.

`nub run sdk:source:build -- --verify` performs a strict archive-byte comparison.
Some upstream CommonJS output embeds temporary build paths, so verified
provenance does not imply that every archive is reproducible byte for byte.
Doolittle qualifies the Node ESM entrypoints it actually runs. See the
[source-build implementation notes](../tooling/eliza-source/README.md) for details.

## Runtime and packaging boundaries

Use official services for agent execution, model transport, account credentials,
SQL, tools, and coding orchestration. Prefer public SDK primitives over copied
implementation or dependency patches. Doolittle-owned compatibility packages
must be explicit, narrow, and covered by their real consuming behavior.

The desktop runtime preparation traces actual SDK and native-module dependencies
with Node File Trace. The [runtime packaging scripts](../apps/desktop/scripts/prepare-runtime.ts)
preserve package identities and worker entrypoints. A source upgrade can change
that closure even when TypeScript passes; validate runtime preparation and the
relevant worker or packaged journeys before release.

Published Eliza UI primitives are consumed through supported leaf exports. The
renderer request adapter uses `ofetch` over the SDK transport interface, with
TanStack Query owning scoped request caching. Avoid changing upstream
implementation to make the aggregate UI package fit the client.

Use [testing](testing.md) for scope selection and [releases](releases.md) for the
complete artifact checks. Typechecking or archive integrity alone does not prove
that a model, connector, worker, or packaged desktop journey works.
