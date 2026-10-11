# Merged security build and follow-up — 2026-10-11

## Merge and scanner evidence

PR34 was fast-forward merged at `69628dda21a2f6a05c1ee75c2da6079e1f61447f`.
Its commits retain the repository-required author and email. No security check
configuration or alert dismissal was used to make the merge appear clean.

The full main analysis `1932325388` at that commit reports 164 open alerts:
137 of the original 196 remain open, 59 original IDs closed, 26 PR34 IDs
remain open, and new ID261 appeared. See [the exact snapshot](main-2026-10-11.json).
The open scanner ratings are six critical, 156 high, and two medium; those
ratings are not the severity of every demonstrated application vulnerability.

Alert 1 acquired 17 additional exception-to-response flows after the earlier
four flows were repaired. The original ledger's fixed classification therefore
does not establish closure of every current instance. The follow-up removes
raw caught-error text from cron, terminal, sandbox, approvals, hooks, SSE, ACP,
and registry-install boundaries. Known client/policy validation stays actionable;
unknown transport/SDK exceptions receive static public messages. ACP failure
telemetry also receives static text. Tests include synthetic credential/path
markers and thrown non-Error values.

ID261 applies `fchmod` to an opened output-directory descriptor selected by a
local eval operator. This is the same output authority reviewed for ID251, not
an uncontrolled remote destination. It remains an open guarded/local-authority
finding, not a claimed scanner closure.

## Additional runtime and validation fixes

- Direct chat-turn tests now derive policy through the production resolver,
  instead of imposing four tool calls on coding turns that normally receive a
  larger allowance. Explicit low-budget exhaustion and fresh-turn recovery
  remain covered; production budget limits were not raised.
- Three UI assertions now match current focus, hidden-marker, and touch-target
  contracts; no UI implementation was changed just to satisfy stale snapshots.
- Hook event aliases reject inherited dictionary keys before hook persistence.
- The compiled ScriptC probe lost an auth header assigned through a shared
  object. Returning the populated request object fixes native lowering while
  keeping exact-origin token gating and redirect rejection. The actual compiled
  binary is exercised against two local servers, including negative cases.
- Nine obsolete lint-suppression comments were removed without changing the
  SDK-compatible service constructors.

## Dependency remediation and residual work

The full installed graph initially reported 49 advisories: 18 high, 22 moderate,
and nine low. Compatible/version-scoped updates cover sharp, provider-utils,
lodash, ws, fast-uri, cookie, and esbuild. Parent-scoped upgrades cover Hardhat's
adm-zip and undici, Mocha's serializer and diff reporter, and Solc's tmp. Exact consumer tests use
local ZIPs, loopback HTTP/RPC/proxy traffic, temporary files, and Mocha parallel
workers; they do not send transactions or call public RPC services.

ElizaOS remains pinned to `2.0.3-beta.7`. The two remaining high advisory
packages have no upstream patched release, so maintained local package patches
mitigate their demonstrated mechanisms:

- `bigint-buffer@1.1.5`: remove native binding loading and native conversion
  branches, retaining the package's existing pure-JS conversion implementation.
- `braces@3.0.3`: bound parsing, recursive AST walking, and ancestor traversal;
  reject excessive nesting and cyclic parent chains without changing ordinary
  glob/stringify semantics.

The package manager still reports the upstream versions as vulnerable. Local
patch hashes and adversarial regressions are remediation evidence; they are not
new upstream releases, GitHub dismissals, or a clean version-only audit.

The remaining full-graph advisory set is **two locally mitigated high, seven
moderate, and one low**. The unremediated lower-severity entries concern legacy
decode-uri-component, elliptic, file-type, sprintf-js, stream-json, and
uuid dependency paths. Some have no patched release; others require parent/API
migration. In particular, Jayson requires CommonJS stream-json 1.x constructors
and subpaths; replacing it with ESM stream-json 3.x is not a compatible override.
These entries remain outstanding, not waived as fixed. Replacing cryptographic
or SDK dependency paths needs a separate compatibility decision and validation.

The residual consumer boundaries are explicit:

| Package | Remaining consumer | Why a blanket override is not a completed fix |
| --- | --- | --- |
| decode-uri-component 0.2.2 | WalletConnect's query-string 7.1.3 | The fixed 0.5.0 is ESM; the caller requires a callable CommonJS export. |
| elliptic 6.6.1 | Wallet and ethers dependency paths | No upstream patched release; replacing signing primitives requires cryptographic compatibility validation. |
| file-type 16.5.4 | Jimp 0.22 under nut-tree-fork | The fix requires a newer file-type/Jimp API train. |
| sprintf-js 1.0.3 / 1.1.3 | Mammoth/argparse and Electron's global-agent/roarr | The latest installed upstream train remains affected; there is no patched release. |
| stream-json 1.9.1 | Jayson 4.3 | The fixed 3.6+ package changes module format, constructors, and subpaths used by Jayson. |
| uuid 8.3.2 / 9.0.1 | Jayson, Hardhat, and wallet packages | The fix starts at 11.1.1; each parent contract needs verification before a scoped major override. |

The first installed desktop runtime inventory contained no affected versions
from that remaining set. This is artifact-specific evidence, not a claim that
every CLI, optional SDK route, or installed development dependency is clean.

Mocha's diff dependency was additionally upgraded with a parent-scoped override
to 9.0.0. A real Mocha assertion failure still prints the expected unified
actual/expected diff; a separate normal run still passes. All six earlier
consumer tests remain, alongside this seventh reporter regression.

## Verification status

`nub run check:all` passed: lint, root/UI type checking, desktop type checking,
1,047 passing test files (five skipped), 6,827 passing tests (seven skipped),
and the agent build. Focused behavior, disclosure, dependency-compatibility,
and adversarial local-patch checks also passed. `nub run native:test` compiled
and exercised the actual macOS probe against loopback servers.

Acceptance checks passed, including repository/workflow/plugin/SDK/docs/link
and dependency hygiene. The runtime advisory policy check passed, and the
prepared desktop runtime audit verified 317 bundled package versions and four
native package versions. Those policy passes do not close the residual full-
graph version advisories above. An independent bounded source review found no
actionable blocker in the final patch, API, hook, and native-probe changes.

The desktop renderer/main/preload/runtime build passed, followed by verified
macOS arm64 directory packaging from clean source commit
`5210d72190b88d77fc6abadd54ed028c8468e40e`. The first packaging attempt correctly
refused uncommitted source changes. After the script-disabled dependency refresh
removed Electron's downloaded distribution, the repository's dedicated Electron
runtime installer restored it; the already-built package then passed the normal
directory packaging checks. No packaging check was bypassed.

`nub run desktop:install:mac` successfully replaced `/Applications/Doolittle.app`
transactionally. The installed bundle passes `codesign --verify --deep --strict`
with the intentional local ad-hoc signature, not release notarization. Package
and installed hashes agree:

- `app.asar`: `c87650f806618b3c38088a402c4a27fcae427d7261a4ce9a487b72094ccdf744`
- `runtime-manifest.json`: `74096ce70baf90aa17dddf84748e6c32865327ab59877ae869d152454162f3b2`

The installed macOS app was opened and its native conversation window observed
from `/Applications/Doolittle.app`. Existing bot profiles were not deleted or
reset. This documentation update is separate from the packaged source commit;
the bundle provenance names the exact code/dependency revision above.

Native Windows/Linux builds, real provider calls, and external/platform
end-to-end behavior are not established by the local macOS checks. Bot
activation semantics were inspected and explained, not changed: only the lead
runtime starts at launch; opening a named bot does not itself activate its
isolated worker.
