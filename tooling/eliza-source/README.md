# ElizaOS source builds

`source.json` pins the upstream commit, selected packages and exact host tools.
`package.json` and `nub.lock` define the isolated TypeScript build toolchain.

Run `nub scripts/build-eliza-source.ts` deliberately when qualifying a source
upgrade. It fetches the public upstream into `var/`, uses upstream build scripts,
and packs generated output into `vendor/elizaos/`. The registry's source-only
package is compiled with TypeScript and includes its actual JSON registry data.
The HTTP alias builds the real agent package but is restricted to its public
HTTP helper; the general agent API can remain on its independently usable release.

Builds receive a fresh home and an explicit environment without provider secrets.
Upstream implementation edits are rejected before and after building. The pack
step removes development scripts and debug maps, resolves workspace versions from
upstream's own manifest discovery, and records provenance. It does not rewrite
runtime implementation or apply patches. `--verify` rebuilds and requires the
archive hashes to match the existing receipt.

Normal dependency installation consumes the checked archives, without fetching
Git source or rebuilding ElizaOS. The SDK release check verifies their SHA-256
hashes and the installed provenance receipts. Keep Nub's exotic-subdependency
restriction enabled; use explicit root pins for reviewed archives.
