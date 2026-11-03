# Independent SDK upgrades

Doolittle consumes unmodified ElizaOS source builds pinned to
`b2dbeff3ab689a69f7e518deb7d608d1c4607790` (`2.0.12-beta.0`). ElizaOS owns
the kernel, host, authentication, assistant behavior, SQL, coding orchestration
and wallet tools. The root `elizaSdk` contract records published exceptions.

## Installation and integrity

Run `nub run deps:install -- --frozen-lockfile --ignore-scripts`. It verifies the
checked source archives, materializes upstream workspaces, and installs the lock.
Normal installs do not fetch Git or rebuild ElizaOS. The source builder uses
upstream scripts and rejects tracked implementation changes; it runs with an
isolated home and an explicit environment without provider credentials.

Archive hashes, unpacked-tree hashes, exact tools and commit provenance are
verified by `check:eliza-sdk`. Generated SDK workspaces under `vendor/elizaos`
contain upstream implementation, not local compatibility packages. The repository
has no SDK patch files or package-manager patch configuration.

See [source qualification](../../tooling/eliza-source/README.md) for rebuild
commands and the orchestrator CommonJS reproducibility limitation. Doolittle
qualifies Node ESM entrypoints; archive integrity is not a claim that every
upstream distribution format works.

The desktop traces real SDK and native modules with Node File Trace, preserving
package paths, dependency versions and process-worker imports. It does not rewrite
SDK runners, generate replacement packages, or relocate database implementation.
SQL and vault storage use the current SDK directly. The compiled CLI declares its
external SDK dependencies and checks them during its build.

## Published exceptions

Use the newest usable release of each independent package. UI remains on
`2.0.11-beta.7`: the pinned upstream UI distribution rewrites a CSS import to
an absent `.css.js` file. Doolittle consumes the release's public leaf exports.
Agent skills remains on its usable published release; later publications require
removed core workspace APIs. Exact other exceptions live in the root manifest.
Do not create compatibility stubs to satisfy missing publications.

## Behavior boundaries

- Atomic state publication uses the public core writers. Client-only strict JSON
  reads preserve corruption and access errors; only missing files become null.
- SQL receives the SDK's environment-discovery opt-out before adapter creation.
- Coding orchestration uses the official CLI ACPX transport with real restart
  reconciliation and process ownership. Unverified initial model selection must
  remain unavailable rather than reported as attested.
- Desktop SDK shell self-requests use a process-private, one-shot action lease.
  The exact command and verified conversation are revalidated before dispatch;
  unleased or replayed requests gain no workspace authority. The SDK action and
  its receipts, redaction and attachments remain unchanged.
- SDK outcomes distinguish completion, failure, denial and cancellation. Only
  confirmed connector outcomes may become delivery records.
- Account storage uses explicit state-root policies and encrypted SDK vaults.
  Coding fixtures use private volatile keys and never adopt real credentials.
- Kernel action authority replaces retired tool-policy and plugin-manager services.
  Client commands still pass through native action gates.

Run focused retirement contracts with:

```sh
nub run test:scope tests/boundary/sdk-module-boundaries.test.ts tests/boundary/sdk-task-scheduling.test.ts tests/boundary/sdk-native-maintenance.test.ts tests/boundary/sdk-patch-contracts.test.ts tests/boundary/sdk-atomic-publication.test.ts
```

The complete local release gate and real coding journeys are separate checks.
Do not infer working desktop or CLI behavior from typechecking alone.

## Retired legacy consumers

- The archived Solana layout utility is replaced by `@doolittle/solana-layouts`,
  a first-party compatibility package explicitly approved for the existing wallet
  SDKs. It uses maintained Noble converters and the standard Solana layout API;
  no installed dependency is patched. A root-owned `link:` alias keeps source
  edits live and preserves the exotic-dependency trust policy. The converter
  alias pins Noble 2.2 independently of legacy Solana cryptography consumers.
  Real SPL checked-transfer encoding, all unsigned widths/byte orders, decimals,
  public keys and booleans are checked without sending a transaction.

- Codex requests use the official OpenAI Responses client. ElizaOS owns model
  registration, OAuth refresh, tools, planning and sessions. No outbound JSON
  rewriting shim or private request-builder import remains.
- UI uses published components and Doolittle transport. Unused hosted/mobile
  wallet applications are excluded; the real ElizaOS wallet/trading actions remain.
  The chat wallet widget renders SDK receipts without adding signing or submission.
- Computer-use resolves the published nut-js 4.2.7 image providers with Jimp 1.6.1.
  This removed the Jimp 0.22 patch. Tests cover actual image conversion and I/O.
- Puppeteer's Chromium BiDi uses Google's unmodified release with Zod 4 support.
  Playwright retains its compatible BiDi 15 API; each consumer resolves its own
  dependency version. The release-age floor and package trust rules remain intact.
- The legacy ethers signing closure, unused hosted wallet dependencies and
  contract-source build tooling are excluded through their actual incoming edges.
  The braces guard is removed. Wallet action loading and Uniswap ABI encoding
  are verified against the real installed consumers.
- glob 14.0.3, minimatch 11.0.3 and follow-redirects 1.16.2 resolve the current
  advisory set. ASAR 4.3.1, Electron Universal 3.0.6 and FileList 2.0.2 replace
  incompatible legacy matcher consumers. Windows packaging remains NSIS.
- Discord uses its already supplied WASM Opus codec instead of optional native
  Opus and its legacy build-tool closure. Encoding/decoding is tested; this is
  not a claim of a live Discord voice-call test.

## Account discovery

Automatic account discovery invokes known provider status commands. Probes check
the SDK's host-execution policy before reading either cached or fresh results,
use literal argv and the sanitized environment, and retain bounded output and
shutdown behavior.
