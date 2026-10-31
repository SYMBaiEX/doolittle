# Independent SDK upgrades

The October 25, 2026 registry inspection checked published tarballs, their entry
files, and the application type checks. Dist-tags alone miss newer beta versions.
The root `elizaSdk.version` is the core compatibility baseline, not a ceiling:
`elizaSdk.packageVersions` selects newer independently usable packages and the
release checker verifies each selected version against manifests and installation.

The following packages advance to `2.0.11-beta.7`: logger, skills,
plugin-agent-skills, plugin-browser, plugin-elizacloud, plugin-mcp, plugin-pdf,
vault, contracts, prompts, security, tui, plugin-streaming,
plugin-aosp-local-inference, plugin-app-manager, plugin-registry, and ui. The lockfile
records the subset actually used by Doolittle. Recheck availability on each update.

Core, agent, app-core, and shared were installed at `2.0.11-beta.7` and checked. That
publication removes ShortcutDefinition/shortcutRegistry, TEXT_EMBEDDING_BATCH,
several agent services (file-storage, global-pause, handoff, pending-prompts), the
web-search action, the app-core account-pool export, and the shared hosted-tier
constant required by older SDK app code. They retain the working
`2.0.3-beta.7` releases and
existing runtime/security patches until those capabilities have supported
replacements. This is an API compatibility limit, not release-train alignment.

The newer plugin-agent-orchestrator, plugin-codex-cli, plugin-form, plugin-github,
plugin-anthropic, plugin-ollama, plugin-openai, plugin-sql, plugin-signal,
plugin-discord, plugin-slack, plugin-telegram, and plugin-computeruse tarballs omit
the runtime files advertised by their manifests. They retain the newest usable
publication. Several optional plugins have no `2.0.11-beta.7` publication.
The remote-manifest, worker-runtime, and registry compatibility workspaces remain
explicit local contracts; they must not be replaced by unavailable npm packages.

Doolittle runs its agent in Node/Electron, with the existing patched core Node
entry. Its renderer uses the official UI components and Doolittle transport.
Upgrade verification must preserve both desktop and CLI behavior and must not
remove compatibility patches merely to make installation succeed.

The desktop uses UI 2.0.11 without a package patch. PagePanel uses its shipped
index entry and the Electron transport serializes native Headers directly.
Account views belong to the desktop client; ElizaOS still owns their account
state, strategies and operations. This removes the fake standalone application
store and its bundler redirect. The renderer build rejects rendered SDK state
and hosted wallet modules so the unneeded hosted wallet aggregate cannot enter
the desktop artifact through a future import.

Chromium BiDi advances from patched 17.0.2 to Google's unmodified
158.0.8122-0 release, which supports Zod 4 directly. This is the latest published
version outside the installer's 24-hour release-age window at review time.
Google documents the move from GitHub Actions publication to its Chrome for
Testing builder and OSS Exit Gate in the
[upstream release instructions](https://github.com/GoogleChromeLabs/chromium-bidi#publish-new-npm-release).
The npm publisher is `chrome-devtools-npm@google.com`; the reviewed tarball has
integrity `sha512-MqfsTG7KDmOJZl6MFv8cMY/jRsFEN/+3kD6fu0dZw7oHwFsCHv1dn+94K9FsQbNT+u39k+dl66+ADHlc8BEz+Q==`.
Because that infrastructure no longer supplies GitHub OIDC provenance, `.npmrc`
allows exactly this reviewed package version through the provenance downgrade
check. Other packages retain the default trust policy and the age floor is
unchanged. Real isolated browser tests cover the SDK provider's Puppeteer
consumer over both CDP and BiDi, including interaction and screenshots.

## Remaining upstream requirements

Doolittle is an ElizaOS desktop and CLI client for coding and daily assistance.
Dependency cleanup must preserve that engine and its registered tools. Five
package patches remain; the target is zero, using supported integrations and
published replacements. None are advisory exceptions:

| Dependency                 | Why its patch remains                                                                                                                              |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| ElizaOS core               | External patched Handlebars, scheduler timing and concurrency, planner limits and failure handling, cache/relationship updates, media URL cleanup. |
| ElizaOS agent              | Atomic JSON publication and exclusive writes protect local state and credentials.                                                                  |
| ElizaOS SQL                | Prevents automatic traversal into unrelated parent `.env` files.                                                                                   |
| ElizaOS agent orchestrator | Native/CLI session ownership, workspace service interoperability, and validated model-selection receipts.                                          |
| Solana buffer-layout-utils | Replaces vulnerable bigint-buffer with modern Noble while retaining binary layouts; published 0.3.0 still requires the old buffer library.         |

The braces guard is retired. The desktop excludes the SDK's unused hosted
Solana wallet UI, which pulled in React Native, Metro and micromatch. The
Uniswap contract artifact package also excludes `hardhat-watcher`, a contract
source development tool absent from its published runtime files. This removes
Chokidar 3, Hardhat and the final braces consumer without changing the ElizaOS
wallet/trading action surface or its shipped contract ABIs. Offline regression
checks import the real wallet plugin and encode a Uniswap quoter call from those
artifacts. Renderer builds reject hosted/mobile wallet clients.

Recheck the parent publications before removing each remaining patch. Replacing
ElizaOS, copying its implementation into this repository, or dropping registered
SDK tools would change the product instead of resolving these upstream limits.

The UI's hosted wallet dependencies (`@rainbow-me/rainbowkit`, `@stwd/react`,
and `wagmi`) are excluded from this client installation, alongside the already
excluded aggregate Solana wallet UI. Their modules are outside the renderer
boundary and are not needed for ElizaOS's wallet tools. Removing those unused UI
edges eliminates Coinbase CDP SDK, its Zod compatibility patch, and the old
WalletConnect connector tree. ElizaOS wallet, computer-use, and vision plugins
remain installed. Renderer builds reject direct imports of the excluded hosted
wallet clients as well as SDK-hosted wallet modules.

## Codex transport patch retirement

Doolittle's ElizaOS model provider now uses the official `openai@7.43.0`
Responses client for requests, image input and streamed events. ElizaOS still
owns model registration, OAuth loading/refresh, planning, tools, tasks and
sessions. Every Codex model handler uses the new transport, including calls
without a reasoning override. The SDK's image serialization patch, the private
request-builder import and the outbound JSON-rewriting shim are removed.

The client preserves paired tool history, usage, selected reasoning and
cancellation. It accepts only ChatGPT or explicit loopback base URLs and
refuses redirects. A 401 can trigger one SDK credential refresh; the Responses
client otherwise makes no automatic retries. Failed or incomplete streams fail
the turn. Provider response bodies and image bytes are excluded from errors.
See the [official image input contract](https://developers.openai.com/api/docs/guides/images-vision).

The current five patches and their retirement requirements are listed above.
The ethers signing closure has since been removed through its type-only
dependency boundary, as described below. No SDK engine or registered tool was
removed to reduce the patch count.

## Follow-up retirement review

The follow-up registry review checked all 56 published ElizaOS package selections
in the root overrides against full version histories, not just dist-tags.
`2.0.11-beta.7` has a higher version number but was published June 20; the working
`2.0.3-beta.7` core, agent, SQL and orchestrator releases were published June 28.
Their retained versions are not an attempt to keep the packages on one train.

The higher-numbered SQL and orchestrator archive hashes were verified against
current npm registry integrity metadata. SQL still lacks
`src/dist/node/index.node.js`; orchestrator still lacks
`dist/node/index.node.js` and `dist/cjs/index.node.cjs`. The other retained plugin
candidates also lack runtime entries. The core/agent/app-core/shared candidates
contain runtime files but still have the API and behavior limits described above.
These missing runtime entries still block those package upgrades. The current
five-patch count reflects the subsequent ethers and Jimp retirements; the dependency
consumers that required the braces guard have also been removed.

The product-owned autonomous configuration projection was removed instead: it
constructed an unused second environment/configuration, including credential
copies, solely to render diagnostics. Connection summaries and enabled connector
names now come directly from the active settings. Linked Claude connections are
reported correctly, and Codex summaries report the selected model. The obsolete
remote-provider branch had no configuration producer and is removed.

The legacy message-text compatibility helper is also removed. Actions, providers
and routing evaluators use ElizaOS's public `getMemoryText` contract directly.
XML escaping remains a client utility; it has no SDK compatibility behavior.
These are source removals, not relocation of package patches into local forks.

The desktop keeps a compact wallet activity widget in chat rather than embedding
the hosted wallet application. It reads the SDK's structured wallet action
receipts and distinguishes prepared actions, simulations and submitted
transactions awaiting confirmation. Amount strings retain their precision. The
widget renders only public receipt fields and adds no signing, submission or
confirmation path; ElizaOS remains responsible for wallet operations.

## October 26: retire the legacy ethers signing closure

The product stays on published SDK releases while the current desktop and CLI
are completed and stabilized. This review does not migrate to upstream Git
source builds or add product features.

The signing-key patch is retired. The only incoming legacy signer chain came
from `@ethersproject/hash` through a type-only `@ethersproject/abstract-signer`
dependency. Its CommonJS and ESM JavaScript do not import that package. A scoped
npm alias supplies the current `ethers@6.17.0` domain/field declarations instead.
No runtime adapter, vendored signer, missing-type suppression, or fake SDK
package was introduced. The old abstract provider, signing-key, transactions,
network and web packages disappear from the installed graph.

Regression checks verify the published hash package still has no runtime import
of the signer alias, compile its declarations with `skipLibCheck: false`, compare
ABI calldata and typed-data hashes with current ethers, and retain signing and
recovery through the real wallet plugin's ethers dependency. The wallet/trading
action surface and Uniswap quoter artifact checks remain intact. These are
offline tests, not funded transaction submissions.

Five patches remain: core, agent, SQL, orchestrator and Solana layout utilities. Full npm version histories were checked again on October 26. Core,
agent, SQL and orchestrator still have no publication newer than June 28's
`2.0.3-beta.7`; the higher-numbered `2.0.11-beta.7` candidates remain older
publications with the limitations above. The three compatibility package names
still return 404 from the public registry. The installed agent statically imports
worker-runtime's error helpers and registry JSON; app-core also imports registry
JSON. Remote-manifest is a declared agent dependency and supplies its bridge's
public message type. Removing or renaming those workspaces would leave unresolved
SDK imports or merely relocate the compatibility code.

The current upstream source commit `4ecd597505ddabd135d8719f7bd113c9fef4013c`
has reorganized these packages and SDK exports, but depends on additional
unpublished workspaces. It is not an installable replacement for the chosen SDK
release contract. The following public registry records are the release evidence:
[core](https://registry.npmjs.org/@elizaos/core),
[agent](https://registry.npmjs.org/@elizaos/agent),
[SQL](https://registry.npmjs.org/@elizaos/plugin-sql), and
[orchestrator](https://registry.npmjs.org/@elizaos/plugin-agent-orchestrator).

The atomic publication patch also has direct regression coverage now. An isolated
probe of the integrity-verified, unmodified agent tarball overwrote an exclusive
destination, followed a predictable temporary-file symlink, and rejected 15 of
16 simultaneous writes in one clock tick. The maintained SDK tests require all
16 writes to finish, preserve an existing exclusive owner, and leave the symlink
target untouched in both sync and async paths. This is a reason to retain the
patch until a published replacement passes the contract, not an advisory waiver.

Alternative bigint-buffer publications were inspected as well. The Exodus and
Truffle variants and the newer bigint-buffer2 JS fallback still truncate values
to the requested width; the latter also wraps negative values. The current
Solana boundary requires rejecting overflow and negative unsigned values.
Replacing the strict layout patch with those packages would change amounts
rather than safely retiring a patch. The public nut-tree fork still pins Jimp
0.22.10; Jimp 1.x changes constructor/export APIs and is not a drop-in override.


## Client refactoring boundary

Prefer replacing an integration through a published public API to modifying a
package. Removing the patch file is the last step: the installed and packaged
runtime must pass the same behavior and security checks without it. Moving a
fix into a renamed workspace, vendoring an SDK implementation, or overriding a
private method does not retire the compatibility requirement.

The October 26 integration inspection found these specific limits:

- **SQL:** the public `createDatabaseAdapter` PGlite path loads parent `.env`
  files even when passed an explicit data directory in the unmodified release.
  The package publishes PGlite class declarations without matching importable
  JavaScript entrypoints. The public PostgreSQL path bypasses that loader, but
  switching the desktop's embedded database to an external server would change
  its operating requirements and require a user-data migration.
- **Agent persistence:** Doolittle is not the only caller of the atomic writer.
  SDK authentication, wallet profiles, virtual filesystem snapshots and repository
  operations also call it internally. Replacing client imports would leave those
  SDK writes exposed to the demonstrated publication failures. AccountPool accepts
  storage dependencies, but that does not replace these other internal callers.
- **Native coding:** the orchestrator constructs its native transport internally.
  The published public service has no transport-factory injection point for
  replacing its reconciliation and cleanup behavior. A second client-owned
  orchestrator would duplicate the engine rather than simplify the integration.

Doolittle does own the lifetime of the coding session it requests. That lifetime
now includes baseline capture and event subscription setup, with a language-level
async disposal guard. Setup failures await shutdown; subscription cleanup errors
cannot skip shutdown or produce a successful receipt. Normal completion and
cancellation reuse one shutdown promise. This fixes the client boundary without
claiming that the SDK's separate native-session patch has been retired.


## Modern native image dependency

The computer-use plugin now resolves nut-js to the published
`@dyw1234/nut-js@4.2.7` release, with its matching shared and provider-interface
packages. This release adopts Jimp 1.6.1 in the image reader, writer, processor
and shared RGB/BGR conversion functions. The Jimp 0.22 patch and its dependency
chain are removed; Doolittle adds no image adapter or replacement input driver.

The three October 8 archives were checked against their registry SHA-512
integrities and their JavaScript differences were reviewed against nut-tree-fork
4.2.6. Changes cover Jimp APIs, copied image buffers and color conversion, plus
compiler-generated export ordering. The native libnut dependency remains 4.2.6.
The new packages have no install lifecycle scripts; installer trust and release
age policies are unchanged.

Regression tests exercise the actual image providers: PNG decode/write/read,
pixel colors, malformed input, coordinate bounds and three-/four-channel
RGB/BGR round trips without mutating sliced caller buffers. A local native
module-load probe also verified mouse and keyboard APIs. This is not a claim of
physical input acceptance on every OS.

## October 31 dependency refresh

The release graph uses glob 14.0.3, minimatch 11.0.3 and follow-redirects 1.16.2
to resolve the new [glob cancellation](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4),
[matcher amplification](https://github.com/advisories/GHSA-g3hv-75wg-m249) and
[redirect-header](https://github.com/advisories/GHSA-mrwp-f3q8-3g9p) advisories.
No new patch or advisory exception is introduced.

Legacy glob/minimatch consumers are removed through their parents: ASAR 4.3.1,
Electron Universal 3.0.6 and FileList 2.0.2. The unconfigured Squirrel.Windows
packaging peer is excluded; the supported Windows target remains NSIS.
Discord uses the SDK's already supplied `opusscript` WebAssembly codec instead
of the optional native Opus package and its old pre-gyp/rimraf/glob closure.
This keeps voice encoding/decoding through prism-media's supported codec loader.

Tests exercise ASAR unpack rules, Jake file-list filtering, aborted glob calls,
a real audio encode/decode round trip and cross-realm custom credential stripping
over loopback redirects. They do not claim a live Discord voice-call test.
