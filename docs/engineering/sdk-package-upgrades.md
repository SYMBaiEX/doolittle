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
Dependency cleanup must preserve that engine and its registered tools. Seven
package patches remain; none are advisory exceptions:

| Dependency                 | Why its patch remains                                                                                                                              |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| ElizaOS core               | External patched Handlebars, scheduler timing and concurrency, planner limits and failure handling, cache/relationship updates, media URL cleanup. |
| ElizaOS agent              | Atomic JSON publication and exclusive writes protect local state and credentials.                                                                  |
| ElizaOS SQL                | Prevents automatic traversal into unrelated parent `.env` files.                                                                                   |
| ElizaOS agent orchestrator | Native/CLI session ownership, workspace service interoperability, and validated model-selection receipts.                                          |
| Solana buffer-layout-utils | Replaces vulnerable bigint-buffer with modern Noble while retaining binary layouts; published 0.3.0 still requires the old buffer library.         |
| ethers signing-key         | Uses ethers 6 signing instead of vulnerable elliptic; published 5.8.0 still requires elliptic.                                                     |
| Jimp core                  | Adapts the nut-js image consumer to current file-type; latest nut-js 4.2.6 still pins Jimp 0.22.10.                                                |

The local braces patch is gone. The `braces` dependency resolves to the published
MIT-licensed `@dieub/braces-depth-guard@3.0.3-pn.3` fork, retaining compatible glob
behavior and rejecting unsafe nesting without a local backport. Boundary tests
exercise the actual micromatch consumer as well as the parser guard.

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

The other seven patches were rechecked against current publications. Newer SQL,
orchestrator and Codex plugin tarballs still omit their advertised runtime
entries. The published `bigint-buffer-fixed@1.1.6` fork silently truncates
out-of-range values in its JS path and does not replace the existing strict
layout contract. Ethers signing-key's 6.0 beta changes signing/recovery APIs and
retains an old Noble dependency; it is not a safe v5 replacement. The public
nut-tree fork still pins Jimp 0.22.10. Core/agent security and behavior fixes
remain required by the currently usable SDK. No SDK engine or registered tool
was removed to reduce the patch count.
