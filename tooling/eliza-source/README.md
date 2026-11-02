# ElizaOS source builds

`source.json` pins the upstream commit, selected packages and exact host tools.
`package.json` and `nub.lock` define the isolated TypeScript build toolchain.

Run `nub scripts/build-eliza-source.ts` deliberately when qualifying a source
upgrade. It fetches the public upstream into `var/`, uses upstream build scripts,
and packs generated output into `vendor/elizaos/`. The selected packages include
ElizaOS's modular kernel, host, account authentication, assistant behavior,
providers and coding tools. All use the same immutable upstream commit.

Builds receive a fresh home and an explicit environment without provider secrets.
Upstream implementation edits are rejected before and after building. The pack
step removes development scripts and debug maps, resolves workspace versions from
upstream's own manifest discovery, and records provenance. It does not rewrite
runtime implementation or apply patches. `--verify` rebuilds and requires the
archive hashes to match the existing receipt.

Normal dependency installation consumes the checked archives, without fetching
Git source or rebuilding ElizaOS. The SDK release check verifies their SHA-256
hashes and the installed provenance receipts. Keep Nub's exotic-subdependency
restriction enabled. `nub run sdk:source:prepare` verifies and unpacks the archives
into ordinary upstream workspaces before installing. `nub run deps:install --
--frozen-lockfile --ignore-scripts` performs both steps. Only generated manifests
are tracked in those workspaces; archive and unpacked-tree hashes are checked.

`--verify` is a strict byte comparison, not a source-provenance check. The pinned
orchestrator CommonJS build embeds its temporary build path and does not currently
pass this comparison across locations. Doolittle uses and qualifies the Node ESM
entrypoints. Do not describe the complete archive set as bit-for-bit reproducible.

The desktop retains the independent published UI primitives. The pinned UI build
emits an invalid CSS import, while the published aggregate API client imports a
retired core API. Client requests use `ofetch` over the SDK transport interface;
TanStack Query owns scoped caching, deduplication and cancellation. Neither
requires modifying SDK implementation. Wallet and engine use pinned source.
