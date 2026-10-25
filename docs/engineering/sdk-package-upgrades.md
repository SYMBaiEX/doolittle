# Independent SDK upgrades

The October 25, 2026 registry inspection checked published tarballs, their entry
files, and the application type checks. Dist-tags alone miss newer beta versions.
The root `elizaSdk.version` is the core compatibility baseline, not a ceiling:
`elizaSdk.packageVersions` selects newer independently usable packages and the
release checker verifies each selected version against manifests and installation.

The following packages advance to `2.0.11-beta.7`: logger, skills,
plugin-agent-skills, plugin-browser, plugin-elizacloud, plugin-mcp, plugin-pdf,
vault, contracts, prompts, security, tui, plugin-streaming,
plugin-aosp-local-inference, plugin-app-manager, and plugin-registry. The lockfile
records the subset actually used by Doolittle. Recheck availability on each update.

Core, agent, app-core, ui, and shared were installed at `2.0.11-beta.7` and checked. That
publication removes ShortcutDefinition/shortcutRegistry, TEXT_EMBEDDING_BATCH,
several agent services (file-storage, global-pause, handoff, pending-prompts), the
web-search action, the app-core account-pool export, and UI PagePanel/transport
helpers used by Doolittle, and the shared hosted-tier constant required by the UI. They retain the working `2.0.3-beta.7` releases and
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
