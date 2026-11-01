# Independent SDK upgrades

Doolittle uses published ElizaOS packages for its engine and services. The root
`elizaSdk` contract records the core baseline and exact per-package exceptions.
A higher version number is not sufficient: inspect the published archive,
exports and runtime behavior before changing the selection.

## Current module boundaries

Core and the general agent services use `2.0.3-beta.7`. Packages with usable
independent publications use `2.0.11-beta.7`, including shared, logger, skills,
security, UI and the selected plugin exceptions recorded in the root manifest.
The working baseline was published June 28; many higher-numbered releases were
published June 20. This is an API/publication boundary, not release-train alignment.

The HTTP server consumes the public `api/server-helpers-auth` entry from agent
`2.0.11-beta.7` through the explicit `eliza-http` npm alias. That helper matches
the current shared HTTP policy. Other services stay on their independently
usable agent release. The plugin boundary checker prevents using this alias
for unrelated services or persistence. No SDK implementation is copied locally.

**There are no local SDK compatibility workspaces.** Remote-manifest and
worker-runtime belonged to unused aggregate/remote-worker dependency branches;
those edges are excluded rather than satisfied with fake packages. The newer
shared release removes the registry dependency. The registry bundler alias,
test aliases, namespace exceptions and local compatibility-package packing
are removed. The release checker rejects local packages claiming SDK names.

The standalone provider publish preflight must pass a real isolated installation,
audit and import. It no longer manufactures missing SDK packages to make that
check succeed. Passing the client release gate does not certify separate provider
package publication.

Current registry records:
[core](https://registry.npmjs.org/@elizaos/core),
[agent](https://registry.npmjs.org/@elizaos/agent),
[shared](https://registry.npmjs.org/@elizaos/shared),
[SQL](https://registry.npmjs.org/@elizaos/plugin-sql),
[orchestrator](https://registry.npmjs.org/@elizaos/plugin-agent-orchestrator).

## Remaining patches

Four package patches remain. Removing a patch requires the unmodified installed
and packaged consumer to pass its behavior/security contract. Moving a fix into
a local fork, build transform or renamed compatibility workspace is not retirement.

| Package            | Required behavior                                                                                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Core               | Maintained template compiler; correct task timing/concurrency; planner limits and failure receipts; cache/relationship updates and media URL classification. |
| Agent              | Concurrent, exclusive and symlink-safe atomic state/credential publication. SDK-internal callers need the same protection as client callers.                 |
| SQL                | Explicit embedded database creation must not read unrelated parent `.env` files.                                                                             |
| Agent orchestrator | Native worker ownership, portable workspace loading and truthful initial model-selection receipts.                                                           |

The browser core patch now carries template security changes only. Doolittle's
engine runs in Node/Electron; its renderer does not run task scheduling, planning
or database mutation. Removing unused browser behavior hunks retired **289 lines**;
Node behavior and browser/edge template-security fixes remain.

SQL and orchestration now patch only their consumed Node ESM implementation.
Both Node `import` and `require` select that entry; unused CommonJS changes,
including the build-host workspace path fix, are removed (**146 lines**).
The module-boundary test checks both resolutions so a publication changing
that contract cannot silently select an unprotected implementation.

Regression checks exercise concurrent/exclusive state publication, all wallet
64/128/192/256-bit layouts with offsets and range errors, and explicit database
creation in a separate process with an unrelated parent environment witness.
Real desktop and CLI coding journeys independently verify edits and test results.
The task scheduler test holds an execution open across multiple dirty ticks;
the native-maintenance journey checks restart reconciliation and ACPX lock
ownership through the public service start/stop API in an isolated home.
Atomic publication also races exclusive owners. Wallet checks use asymmetric
byte-order vectors and verify that rejected amounts leave the buffer intact.

Run these retirement contracts without rebuilding either client:

```sh
nub run test:scope tests/boundary/sdk-module-boundaries.test.ts tests/boundary/sdk-task-scheduling.test.ts tests/boundary/sdk-native-maintenance.test.ts tests/boundary/sdk-patch-contracts.test.ts tests/boundary/sdk-atomic-publication.test.ts
```

The other core/agent candidates do not supply supported replacements for these
contracts. SQL and orchestrator higher-numbered archives still omit their
advertised runtime entries. Published bigint conversion alternatives inspected
on October 31 still truncate overflow or wrap unsigned negatives; they do not
satisfy the wallet boundary. No security or amount validation was removed to
reduce the patch count.

Registry and archive checks on November 1 found no later publications for these
five packages. SQL `2.0.3-beta.6` and `1.7.2` still traverse parent environment
files; agent `2.0.3-beta.6` still uses predictable temporary names without
exclusive publication. Additional published layout forks and `bigint-buffer-fixed`
retain the vulnerable dependency or truncate unsigned values. They are not
substituted merely to make the patch count smaller.

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
- Chromium BiDi uses Google's unmodified release with Zod 4 support. The exact
  reviewed publication is allowed by the provenance policy; the release-age
  floor and other package trust rules remain intact.
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

Automatic account discovery invokes known provider status commands and rejects
a custom `DEVIN_CLI_COMMAND` with an actionable provider-status error. Execution
uses the same fixed Devin command; a differing configured command cannot report ready. This removes CodeQL #370's environment-to-executable path
instead of suppressing the finding. Probes check the SDK's host-execution policy
before reading either cached or fresh results, use literal argv and the sanitized
environment, and retain bounded output and shutdown behavior.
