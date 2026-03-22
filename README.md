# Eliza Agent

Eliza Agent is a Bun-first, TypeScript-native ElizaOS platform built as a workspace monorepo. The root package is the shared toolchain and install layer, the runtime lives under `packages/agent`, plugin-shaped code lives under `packages/plugins`, curated skills live under `packages/skills`, optional skill packs live under `packages/skill-packs-optional`, characters live under `packages/characters`, and supporting workspaces such as ACP, modeling, benchmarks, and distributions live alongside them.

## Versioning note

On March 21, 2026, npm reports:

- `elizaos@latest` → `2.0.0-alpha.77`
- `elizaos@alpha` → `2.0.0-alpha.85`
- `@elizaos/core@alpha` → `2.0.0-alpha.85`
- `@elizaos/agent@alpha` → `2.0.0-alpha.85`

This project now uses the explicit `alpha` dist-tag for the core ElizaOS runtime packages so the repo intentionally tracks the leading alpha line instead of relying on `latest` to remain alpha-backed.

## Why this shape

The published `elizaos` package is a CLI/examples wrapper, while the actual agent runtime comes from `@elizaos/core`. This repo includes both:

- `elizaos: "alpha"` for the umbrella package
- `@elizaos/core: "alpha"` for the runtime used by the Bun application
- `@elizaos/autonomous: "alpha"` and `@elizaos/skills: "alpha"` to keep the first-party native alignment packages on the same runtime channel
- `@elizaos/plugin-sql: "alpha"` and other compatible official plugins on `alpha` where that is the correct 2.x line

The platform-specific features that do not have a single clean ElizaOS equivalent are implemented here as custom ElizaOS actions, providers, evaluators, and Bun-native services. Official packages that were close but not yet compatible on the current runtime line are vendored under `packages/plugins/*` and implemented directly against the current `@elizaos/core` alpha service model.

## Monorepo layout

- root package
  - workspace manifest, shared scripts, docs, and toolchain config
- `packages/agent`
  - primary Eliza Agent application source
- `packages/plugins`
  - local Eliza Agent product plugins plus vendored official-compatible ElizaOS plugin packages
- `packages/skills`
  - local Eliza Agent skill documents and generated skills, organized by category
- `packages/skill-packs-optional`
  - broader optional skill packs kept separate from the curated default skill tier
- `packages/characters`
  - local character definitions
- `packages/acp`
  - ACP primitives and publishing surfaces used by the runtime
- `packages/modeling`
  - local modeling profiles and persona-alignment assets
- `packages/benchmarks`
  - benchmark packs and evaluation scaffolding
- `packages/distributions`
  - release-channel metadata and distribution manifests
- `packages/integrations`
  - integration-specific docs and workspace support assets

Detailed workspace notes live in [`docs/monorepo.md`](./docs/monorepo.md). Native-adoption priorities live in [`docs/eliza-maximization-matrix.md`](./docs/eliza-maximization-matrix.md).

## File tree

```text
eliza-agent/
├── .eliza-agent/
├── .env.example
├── README.md
├── bin/
├── biome.json
├── docs/
│   ├── eliza-maximization-matrix.md
│   ├── elizaos-research.md
│   ├── monorepo.md
│   ├── native experience-ledger.md
│   └── skills-hub.md
├── package.json
├── scripts/
├── packages/
│   ├── acp/
│   ├── agent/
│   │   └── src/
│   ├── benchmarks/
│   ├── characters/
│   │   └── eliza-agent.character.json
│   ├── distributions/
│   ├── integrations/
│   ├── modeling/
│   ├── plugins/
│   │   ├── eliza-agent-plugin.ts
│   │   ├── plugin-action-bench/
│   │   ├── plugin-agent-orchestrator/
│   │   ├── plugin-agent-skills/
│   │   ├── plugin-autocoder/
│   │   ├── plugin-browser/
│   │   ├── plugin-claude-code/
│   │   ├── plugin-codex/
│   │   ├── plugin-coding-agent/
│   │   ├── plugin-cron/
│   │   ├── plugin-discord/
│   │   ├── plugin-e2b/
│   │   ├── plugin-experience/
│   │   ├── plugin-forms/
│   │   ├── plugin-knowledge/
│   │   ├── plugin-local-embedding/
│   │   ├── plugin-mcp/
│   │   ├── plugin-planning/
│   │   ├── plugin-personality/
│   │   ├── plugin-plugin-manager/
│   │   ├── plugin-rolodex/
│   │   ├── plugin-shell/
│   │   ├── plugin-trajectory-logger/
│   │   └── plugin-tts/
│   ├── skill-packs-optional/
│   ├── skills/
│   │   ├── automation/
│   │   ├── browser/
│   │   ├── communications/
│   │   ├── data/
│   │   ├── distribution/
│   │   ├── documentation/
│   │   ├── generated/
│   │   ├── identity/
│   │   ├── integrations/
│   │   ├── knowledge/
│   │   ├── media/
│   │   ├── memory/
│   │   ├── observability/
│   │   ├── operations/
│   │   ├── planning/
│   │   ├── platform/
│   │   ├── productivity/
│   │   ├── research/
│   │   ├── safety/
│   │   ├── support/
│   │   └── testing/
├── tsconfig.json
```

## Capabilities

| Platform capability | Eliza Agent implementation |
|---|---|
| Persona / system prompt | `packages/characters/eliza-agent.character.json` + [`packages/agent/src/character.ts`](./packages/agent/src/character.ts) |
| Agent runtime | `AgentRuntime` from `@elizaos/core` with declarative native plugin assembly in [`packages/agent/src/runtime/native/plugin-registry.ts`](./packages/agent/src/runtime/native/plugin-registry.ts) |
| Model provider routing | Official ElizaOS OpenAI and Anthropic plugins, with local offline fallback in [`packages/plugins/eliza-agent-plugin.ts`](./packages/plugins/eliza-agent-plugin.ts) |
| MEMORY.md and USER.md | [`packages/agent/src/services/memory-service.ts`](./packages/agent/src/services/memory-service.ts) |
| Session search | [`packages/agent/src/services/session-service.ts`](./packages/agent/src/services/session-service.ts) + `/search` command |
| Skills browsing | [`packages/agent/src/services/skills-service.ts`](./packages/agent/src/services/skills-service.ts) + `/skills` command |
| Skills hub / sync / distribution | [`packages/agent/src/services/skills-hub-service.ts`](./packages/agent/src/services/skills-hub-service.ts) + `/skills hub`, `/skills sync`, `/skills export`, `/skills import`, `/skills install` |
| Cron / scheduled runs | [`packages/agent/src/services/cron-service.ts`](./packages/agent/src/services/cron-service.ts) + `/cron` command family |
| CLI / TUI entrypoint | [`packages/agent/src/cli.ts`](./packages/agent/src/cli.ts) with a full-screen Blessed operator cockpit and plain fallback mode |
| API server | [`packages/agent/src/server.ts`](./packages/agent/src/server.ts) with Bun's native HTTP server |
| Gateway runner | [`packages/agent/src/gateway/gateway-runner.ts`](./packages/agent/src/gateway/gateway-runner.ts) |
| Pairing and allowlists | [`packages/agent/src/services/pairing-service.ts`](./packages/agent/src/services/pairing-service.ts) |
| Hooks and event logs | [`packages/agent/src/services/hooks-service.ts`](./packages/agent/src/services/hooks-service.ts) |
| Delivery routing | [`packages/agent/src/services/delivery-service.ts`](./packages/agent/src/services/delivery-service.ts) |
| Personality profiles | [`packages/agent/src/services/personality-service.ts`](./packages/agent/src/services/personality-service.ts) |
| Workspace context files | [`packages/agent/src/services/context-files-service.ts`](./packages/agent/src/services/context-files-service.ts) |
| Runtime settings and model config | [`packages/agent/src/services/settings-service.ts`](./packages/agent/src/services/settings-service.ts) |
| Browser inspection, capture, and model-backed analysis | [`packages/agent/src/services/web-service.ts`](./packages/agent/src/services/web-service.ts) + `/browser` commands |
| Media inspection, model-assisted analysis, transcription, speech synthesis, and image generation | [`packages/agent/src/services/media-service.ts`](./packages/agent/src/services/media-service.ts) + `/media` commands |
| Trajectory research bundles, replay, packaging, and evaluation | [`packages/agent/src/services/trajectory-service.ts`](./packages/agent/src/services/trajectory-service.ts) + `/trajectories` commands |
| PDF extraction | [`packages/agent/src/services/documents-service.ts`](./packages/agent/src/services/documents-service.ts) + `@elizaos/plugin-pdf` |
| Workspace exploration | [`packages/agent/src/services/workspace-service.ts`](./packages/agent/src/services/workspace-service.ts) + `/workspace` commands |
| Local terminal execution | [`packages/agent/src/services/terminal-service.ts`](./packages/agent/src/services/terminal-service.ts) + `/terminal` commands |
| Repository inspection | [`packages/agent/src/services/repository-service.ts`](./packages/agent/src/services/repository-service.ts) + `/repo` commands |
| Execution backend control | [`packages/agent/src/services/terminal-service.ts`](./packages/agent/src/services/terminal-service.ts) + `/execution` commands with local, Docker, Podman, SSH, Singularity, Daytona, and Modal runtime settings, probes, preview, bootstrap, remote sync planning, snapshot history, and cloud sandbox profile paths |
| Diagnostics and readiness checks | [`packages/agent/src/services/diagnostics-service.ts`](./packages/agent/src/services/diagnostics-service.ts) + `eliza-agent doctor` + `/doctor` |
| Operator status and summaries | [`packages/agent/src/services/operator-service.ts`](./packages/agent/src/services/operator-service.ts) + [`packages/agent/src/services/operator-summary.ts`](./packages/agent/src/services/operator-summary.ts) |
| ACP registry and tool publishing | [`packages/agent/src/services/acp-service.ts`](./packages/agent/src/services/acp-service.ts) + `/acp` commands |
| Planning boards and generated plans | [`packages/agent/src/server.ts`](./packages/agent/src/server.ts) + native planning control-plane endpoints and `/planning` flows |
| Forms lifecycle | [`packages/agent/src/server.ts`](./packages/agent/src/server.ts) + native forms control-plane endpoints and `/forms` flows |
| Integration control plane | [`packages/agent/src/server.ts`](./packages/agent/src/server.ts) + native integration inventory and readiness endpoints |
| Ecosystem and package audit views | [`packages/agent/src/runtime/native/package-audit.ts`](./packages/agent/src/runtime/native/package-audit.ts) + `/runtime ecosystem` |
| Tool registry | [`packages/agent/src/services/tools-service.ts`](./packages/agent/src/services/tools-service.ts) + `/tools` commands |
| Native plugin inventory | [`packages/agent/src/runtime/native/plugin-catalog.ts`](./packages/agent/src/runtime/native/plugin-catalog.ts) + `/plugins native` + `GET /runtime/plugins` |
| MCP bridge | [`packages/agent/src/services/mcp-service.ts`](./packages/agent/src/services/mcp-service.ts) + `/mcp` commands for probe, discovery, and structured tool invocation |
| Delegation queue | [`packages/agent/src/services/delegation-service.ts`](./packages/agent/src/services/delegation-service.ts) + `/delegate` commands |
| Memory nudges / persistence hints | [`packages/agent/src/evaluators/memory-nudge-evaluator.ts`](./packages/agent/src/evaluators/memory-nudge-evaluator.ts) |
| Shared task context | [`packages/agent/src/providers/agent-context-provider.ts`](./packages/agent/src/providers/agent-context-provider.ts) |

## Skills discovery

Curated skill docs live under [`packages/skills`](./packages/skills) and are grouped by category for easier browsing:

- `identity/`
- `memory/`
- `productivity/`
- `automation/`
- `communications/`
- `documentation/`
- `data/`
- `distribution/`
- `operations/`
- `observability/`
- `integrations/`
- `planning/`
- `safety/`
- `support/`
- `testing/`
- `platform/`
- `knowledge/`
- `browser/`
- `media/`
- `research/`
- `generated/`

The category index is documented in [`packages/skills/README.md`](./packages/skills/README.md).

Native skills-hub distribution, manifest export/import, and install workflows are documented in [`docs/skills-hub.md`](./docs/skills-hub.md).

## Plugin inventory

The runtime now uses a wider native ElizaOS stack:

- `@elizaos/core`
  - Core runtime, message pipeline, character model, action/provider/evaluator contracts.
- `@elizaos/plugin-openai`
  - Official OpenAI provider plugin for API-key-backed GPT-family model routing on the current ElizaOS alpha runtime line.
- `@elizaos/plugin-anthropic`
  - Official Anthropic provider plugin for API-key-backed Claude-family model routing on the current ElizaOS alpha runtime line.
- `@elizaos/plugin-codex`
  - Workspace-native linked-account provider plugin that reuses local Codex CLI login state and routes requests through the Codex Responses backend.
- `@elizaos/plugin-claude-code`
  - Workspace-native linked-account provider plugin that reuses local Claude Code OAuth state and routes requests through Anthropic with Claude Code headers.
- `@elizaos/plugin-pdf`
  - Official PDF service plugin for runtime-native document extraction.
- `@elizaos/plugin-sql`
  - Required ElizaOS database adapter for runtime initialization and local persistent state.
- `@elizaos/plugin-telegram`
  - Official Telegram transport plugin, enabled only when Telegram credentials are configured.
- `@elizaos/plugin-tts`
  - Workspace-native text-to-speech plugin aligned to the current alpha runtime line and used when `FAL_API_KEY` is configured.
- `@elizaos/plugin-action-bench`
  - Workspace-native action benchmark plugin for coverage sweeps and evaluation drills.
- `@elizaos/plugin-autocoder`
  - Workspace-native autocoder plugin for native codegen, repository, and secrets workflows.
- `@elizaos/plugin-e2b`
  - Workspace-native E2B sandbox integration plugin for cloud execution profiles and remote coding paths.
- `@elizaos/plugin-forms`
  - Workspace-native forms plugin for operator intake, structured workflow prompts, and API-backed form state.
- `@elizaos/plugin-planning`
  - Workspace-native planning plugin for plans, milestones, and coordination control-plane surfaces.
- `@elizaos/autonomous`
  - First-party architectural reference package used selectively for native stack alignment.
- `@elizaos/skills`
  - First-party skills package used as part of the native ElizaOS workspace alignment.
- `skills hub`
  - Eliza Agent-native distribution layer for catalog sync, manifest export/import, and installable skill manifests.
- vendored official-compatible packages in `packages/plugins/*`
  - Local workspace packages that preserve official ElizaOS package names while implementing directly against the current runtime line for browser, MCP, Discord, knowledge, local embedding, personality, rolodex, experience, shell, coding-agent, agent-orchestrator, plugin-manager, cron, agent-skills, action-bench, autocoder, E2B, forms, planning, trajectory-logger, linked-provider routing, and text-to-speech.
- `elizaos`
  - Requested dist-tag package channel for the ElizaOS umbrella package.
- `eliza-agent-runtime` custom plugin
  - Adds the Eliza Agent product layer: gateway/session orchestration, scheduler lifecycle, session search, skill inventory behavior, and offline local fallback behavior when no provider plugin is configured.

This codebase now includes the core runtime plus the surrounding application services needed for a broader agent platform: gateway configuration, pairing, hooks, session routing, and delivery persistence. Additional transport-specific implementations can be layered on top of the same abstractions without changing the core architecture.

The gateway and scheduler lifecycle are also registered through ElizaOS service classes inside the custom plugin, so long-running runtime behavior follows the native ElizaOS service model instead of living purely as external wrappers.

## Monorepo workflows

Run the full workspace quality pass from the repo root:

```bash
bun run check
```

Useful workspace commands:

```bash
bun run bootstrap
bun run bootstrap:check
bun run workspace:list
bun run lint:check
bun run typecheck
bun test
bun run build
bun run smoke:linked-providers
bun run publish:providers:check
bun run publish:providers:alpha
```

## Local install and launch

Doolittle leaves you with a real shell command after install. Eliza Agent now does the same.

From the repo root:

```bash
bash scripts/install.sh
```

That flow:

- runs `bun install`
- creates `~/.local/bin/eliza-agent`
- updates your shell PATH if needed
- launches the onboarding ritual immediately

If a fresh terminal does not see `eliza-agent` right away, restart the shell or source the shell profile that was updated during install, such as `~/.zshrc` on macOS or `~/.bashrc` on Linux.

After that, the normal local UX is:

```bash
eliza-agent
ea
eliza-agent plain
eliza-agent setup
eliza-agent doctor
```

Command notes:

- `eliza-agent`
  - starts the normal runtime and TUI flow
- `ea`
  - short alias installed only when no existing `ea` command is already present on the machine
- `eliza-agent plain`
  - starts the plain CLI instead of the full operator deck
- `eliza-agent setup`
  - reruns onboarding
- `eliza-agent doctor`
  - runs the installer/bootstrap readiness check

## Linked provider plugins

Eliza Agent now includes first-class linked-account providers for users who are already signed into Codex or Claude Code locally.

- [`packages/plugins/plugin-codex`](./packages/plugins/plugin-codex)
- [`packages/plugins/plugin-claude-code`](./packages/plugins/plugin-claude-code)

Useful operator flows:

- `/accounts`
- `/accounts refresh`
- `/accounts refresh codex`
- `/accounts refresh claude-code`
- `/accounts use codex`
- `/accounts use claude-code`

Repo-level smoke and packaging flows:

```bash
bun run smoke:linked-providers
bun run smoke:linked-providers -- --provider codex --live
bun run smoke:linked-providers -- --provider claude-code --live
bun run publish:providers:check
```

The smoke script validates linked-account discovery, provider switching, runtime service registration, and optional live request execution when local signed-in credentials are available.

Provider release note:

- the locally installed `elizaos` CLI on `2.0.0-alpha.85` does not expose a `publish` command
- the local [`../eliza`](../eliza) repo uses monorepo release scripts around `lerna publish from-package`, not a plugin-specific CLI publish command
- for these two provider packages, direct `npm pack` / `npm publish` is the correct path because they are already standalone-safe packages rather than a full monorepo release train
- the helper script below verifies that reality and supports alpha-tag publishing:

```bash
bun run publish:providers -- --provider all
bun run publish:providers:alpha
```

## Environment reference

Copy `.env.example` to `.env` and fill in what you need.

| Variable | Purpose |
|---|---|
| `ELIZA_AGENT_NAME` | Runtime agent display name. |
| `ELIZA_AGENT_MODE` | `api`, `cli`, or `both`. |
| `ELIZA_AGENT_HOST` | Host for the Bun API server. |
| `ELIZA_AGENT_PORT` | Port for the Bun API server. |
| `ELIZA_AGENT_DATA_DIR` | Root directory for state, memories, and cron job persistence. |
| `ELIZA_AGENT_SKILLS_DIR` | Directory scanned recursively for `SKILL.md` files. |
| `ELIZA_AGENT_TIMEZONE` | Default timezone used for human-facing scheduling context. |
| `OPENAI_API_KEY` | API key for the official ElizaOS OpenAI plugin. Optional if you use Anthropic or stay in offline bootstrap mode. |
| `OPENAI_BASE_URL` | Base URL for the OpenAI-compatible endpoint used by the OpenAI plugin and fallback adapter. |
| `OPENAI_MODEL` | Default OpenAI model name used to seed runtime settings. |
| `OPENAI_IMAGE_MODEL` | Optional OpenAI image model used for model-backed image generation. |
| `OPENAI_TEMPERATURE` | Default completion temperature. |
| `OPENAI_MAX_TOKENS` | Default completion output cap. |
| `ANTHROPIC_API_KEY` | API key for the official ElizaOS Anthropic plugin. |
| `ANTHROPIC_BASE_URL` | Optional Anthropic-compatible base URL override. |
| `ANTHROPIC_SMALL_MODEL` | Default Anthropic small model identifier. |
| `ANTHROPIC_LARGE_MODEL` | Default Anthropic large model identifier. |
| `FAL_API_KEY` | Enables the official ElizaOS TTS plugin when set. |
| `ELIZA_AGENT_MEMORY_CHAR_LIMIT` | Max characters for `MEMORY.md`. |
| `ELIZA_AGENT_USER_CHAR_LIMIT` | Max characters for `USER.md`. |
| `ELIZA_AGENT_SESSION_SEARCH_LIMIT` | Default number of search hits returned by `/search`. |
| `ELIZA_AGENT_CRON_TICK_SECONDS` | Scheduler polling interval. |
| `ELIZA_AGENT_CRON_OUTPUT_DIR` | Output directory for future scheduled report exports. |
| `ELIZA_AGENT_GATEWAY_DATA_DIR` | Persistent gateway state directory for sessions, pairing, and deliveries. |
| `ELIZA_AGENT_HOOKS_DIR` | Directory for hook state. |
| `ELIZA_AGENT_WORKSPACE_DIR` | Workspace directory scanned for context files like `AGENTS.md` and `SOUL.md`. |
| `ELIZA_AGENT_ALLOW_ALL_USERS` | Global gateway allow-all switch. |
| `ELIZA_AGENT_PAIRING_MODE` | Default pairing mode for remote platforms. |
| `TELEGRAM_BOT_TOKEN` | Enables the official ElizaOS Telegram plugin when set. |
| `TELEGRAM_API_ROOT` | Optional Telegram Bot API root override. |
| `TELEGRAM_ALLOWED_CHATS` | Optional JSON-encoded Telegram chat allowlist for the Telegram plugin. |
| `DISCORD_BOT_TOKEN` | Enables outbound Discord delivery and inbound Discord webhook handling. |
| `SLACK_WEBHOOK_URL` | Enables outbound Slack delivery. |
| `SLACK_SIGNING_SECRET` | Verifies inbound Slack webhook signatures. |
| `WHATSAPP_ACCESS_TOKEN` | Enables outbound WhatsApp Graph API delivery. |
| `WHATSAPP_PHONE_NUMBER_ID` | Target sender identity for WhatsApp Graph API sends. |
| `WHATSAPP_VERIFY_TOKEN` | Verifies WhatsApp webhook subscription handshakes. |
| `SIGNAL_CLI_COMMAND` | Local command used for Signal outbound delivery and mirrored inbound continuity. |
| `MATRIX_HOMESERVER` | Matrix homeserver base URL used for outbound room messaging. |
| `MATRIX_ACCESS_TOKEN` | Matrix access token used for outbound room messaging. |
| `EMAIL_SEND_COMMAND` | Local command used for outbound email delivery. |
| `SMS_SEND_COMMAND` | Local command used for outbound SMS delivery. |
| `ELIZA_AGENT_BROWSER_PROVIDER` | Browser backend selection. Defaults to `lightpanda`, with `basic` available as a fallback. |
| `ELIZA_AGENT_BROWSER_COMMAND` | Local Lightpanda command used for browser-backed fetch flows. |
| `ELIZA_AGENT_BROWSER_CDP_URL` | Optional CDP endpoint reserved for deeper browser automation work. |
| `ELIZA_AGENT_BROWSER_OBEY_ROBOTS` | Enables Lightpanda robot-policy aware fetching when supported. |
| `ELIZA_AGENT_EXECUTION_COMMAND_TIMEOUT_MS` | Default command timeout for local, Docker, Podman, SSH, and Singularity execution. |
| `ELIZA_AGENT_EXECUTION_HEALTH_TIMEOUT_MS` | Timeout used when probing backend health. |
| `ELIZA_AGENT_CONTAINER_CPU_LIMIT` | CPU limit applied to Docker and Podman execution containers. |
| `ELIZA_AGENT_CONTAINER_MEMORY_LIMIT` | Memory limit applied to Docker and Podman execution containers. |
| `ELIZA_AGENT_CONTAINER_PIDS_LIMIT` | PIDs limit applied to Docker and Podman execution containers. |
| `ELIZA_AGENT_CONTAINER_READ_ONLY_ROOT` | Enables a read-only container root with writable tmpfs mounts for `/tmp` and `/run`. |
| `ELIZA_AGENT_DOCKER_IMAGE` | Container image used for Docker or Podman execution. |
| `ELIZA_AGENT_DOCKER_NETWORK` | Container network mode for Docker or Podman execution. |
| `ELIZA_AGENT_DOCKER_WORKSPACE_PATH` | Mount path used inside Docker or Podman execution containers. |
| `ELIZA_AGENT_DOCKER_ENV_PASSTHROUGH` | Comma-separated env vars forwarded into Docker or Podman execution containers. |
| `ELIZA_AGENT_SINGULARITY_IMAGE` | Local SIF path or remote image reference used for Singularity execution. |
| `ELIZA_AGENT_DAYTONA_TARGET` | Target Daytona sandbox or workspace used for remote execution. |
| `ELIZA_AGENT_DAYTONA_COMMAND` | Optional Daytona CLI command override. |
| `ELIZA_AGENT_DAYTONA_SHELL` | Shell used inside Daytona sandboxes for command execution. |
| `ELIZA_AGENT_DAYTONA_WORKSPACE_PATH` | Remote workspace path used inside Daytona sandboxes. |
| `ELIZA_AGENT_DAYTONA_SNAPSHOT` | Optional Daytona snapshot anchor used to describe the sandbox image state. |
| `ELIZA_AGENT_DAYTONA_BOOTSTRAP_COMMAND` | Optional bootstrap command run before Daytona user commands. |
| `ELIZA_AGENT_DAYTONA_STATUS_COMMAND` | Optional Daytona status command used for explicit remote inspection. |
| `ELIZA_AGENT_DAYTONA_INSPECT_COMMAND` | Optional Daytona inspect command used to override the synthesized sandbox inspection command. |
| `ELIZA_AGENT_MODAL_TARGET` | Target Modal sandbox or environment used for remote execution. |
| `ELIZA_AGENT_MODAL_COMMAND` | Optional Modal CLI command override. |
| `ELIZA_AGENT_MODAL_SHELL` | Shell used inside Modal sandboxes for command execution. |
| `ELIZA_AGENT_MODAL_WORKSPACE_PATH` | Remote workspace path used inside Modal sandboxes. |
| `ELIZA_AGENT_MODAL_ENVIRONMENT` | Optional Modal environment name used with `modal shell -e`. |
| `ELIZA_AGENT_MODAL_BOOTSTRAP_COMMAND` | Optional bootstrap command run before Modal user commands. |
| `ELIZA_AGENT_MODAL_STATUS_COMMAND` | Optional Modal status command used for explicit remote inspection. |
| `ELIZA_AGENT_MODAL_INSPECT_COMMAND` | Optional Modal inspect command used to override the synthesized shell inspection command. |
| `ELIZA_AGENT_REMOTE_SYNC_MODE` | Remote workspace planning mode for Daytona and Modal runs: `mirror` or `snapshot`. |
| `ELIZA_AGENT_REMOTE_SYNC_INCLUDE` | Comma-separated allowlist of workspace paths to mirror or snapshot metadata for remote runs. |
| `ELIZA_AGENT_REMOTE_SYNC_EXCLUDE` | Comma-separated denylist of workspace paths excluded from remote sync planning. |
| `ELIZA_AGENT_REMOTE_ARTIFACT_PATHS` | Comma-separated remote artifact paths tracked as metadata-only operator snapshots. |
| `ELIZA_AGENT_REMOTE_ARTIFACT_POLICY` | Remote artifact handling policy: `metadata-only` or `allowlisted`. |
| `ELIZA_AGENT_REMOTE_WORKSPACE_LABEL` | Human-readable label used in remote execution snapshots and cloud session history. |
| `ELIZA_AGENT_SSH_HOST` | Remote SSH host for execution. |
| `ELIZA_AGENT_SSH_USER` | Remote SSH user for execution. |
| `ELIZA_AGENT_SSH_PATH` | Remote workspace path for SSH execution. |
| `ELIZA_AGENT_SSH_PORT` | SSH port for remote execution. |
| `ELIZA_AGENT_SSH_KEY_PATH` | Optional SSH private key for remote execution. |
| `ELIZA_AGENT_SSH_STRICT_HOST_KEY_CHECKING` | Enables strict host verification for SSH execution. |
| `MCP_SERVER_COMMAND` | Local command used for MCP probe, discovery, and invocation. |
| `MCP_TIMEOUT_MS` | Timeout applied to MCP bridge operations. |

## Commands

### Install

```bash
bash scripts/install.sh
```

This Bun-first installer now behaves like a first-contact ritual instead of a plain dependency step. It:

- runs `bun install`
- creates `.env` from `.env.example` when it does not already exist
- seeds the local workspace directories used by the agent runtime
- launches an interactive awakening flow for:
  - provider and model routing
  - execution backend
  - browser mode
  - transport/channel selection
  - MCP / ACP / TTS / codegen setup
  - TUI theme selection
- writes directly into:
  - `.env`
  - `.eliza-agent/settings.json`
  - `.eliza-agent/gateway/gateway.json`
  - `.eliza-agent/onboarding.json`

Useful modes:

```bash
bash scripts/install.sh --headless
bash scripts/install.sh --skip-wizard
bash scripts/install.sh --check
```

If you only want to re-run the workspace bootstrap step, use:

```bash
bun run bootstrap
```

If you want a non-mutating check of the bootstrap state, use:

```bash
bun run bootstrap:check
```

Verified in this repo: `bun install` resolved successfully with `elizaos@latest`, `@elizaos/core@latest`, and `@elizaos/plugin-sql@alpha`.

### Dev

```bash
bun run dev
```

### Start

```bash
bun run start
```

### Build

```bash
bun run build
```

### Lint

```bash
bun run lint
```

### Typecheck

```bash
bun run typecheck
```

### Test

```bash
bun test
```

## Runtime surfaces

### CLI

When `ELIZA_AGENT_MODE=cli` or `both`, the runtime starts a full-screen terminal UI with a live activity feed, response pane, runtime snapshot sidebar, live transport rail, execution/delegation panel, command assist, hotkeys, event-driven updates, and command input. Use `bun run start --plain-cli` if you want the simpler line-based fallback.

Quick shortcuts:

- `F2` status
- `F3` tools summary
- `F4` delegate overview
- `F5` gateway readiness
- `F6` sessions list
- `F7` doctor
- `F8` runtime plugins
- `Esc` focus input
- `Tab` complete the top suggested command
- `Ctrl-P` open the command palette
- `Ctrl-R` refresh runtime panels
- `Ctrl-L` clear the activity feed

Useful commands:

- `/skills list`
- `/skills show <slug>`
- `/skills generated list`
- `/skills generated describe <slug>`
- `/memory list memory`
- `/memory add user <text>`
- `/sessions list`
- `/session summary`
- `/search <query>`
- `/user profile`
- `/user card`
- `/user beliefs`
- `/user relationship`
- `/user engagement`
- `/user search Bun`
- `/user mode hybrid`
- `/user remember context :: we are shipping the final native experience pass`
- `/agent profile`
- `/cron list`
- `/cron create every 2h | name:deploy-review | delivery:home | skills:automation/reports | personality:focused | model:gpt-5.4 :: summarize recent deployment logs`
- `/cron show <job-id>`
- `/cron update <job-id> every 4h | delivery:home | runtime:default :: refresh release notes`
- `/cron runs`
- `/personality list`
- `/personality set autonomous`
- `/model status`
- `/model set model gpt-5.4`
- `/execution status`
- `/execution backends`
- `/execution bootstrap`
- `/execution preview git status --short`
- `/execution set backend docker`
- `/execution set backend podman`
- `/execution set backend singularity`
- `/execution set backend daytona`
- `/execution set backend modal`
- `/config show`
- `/tools list`
- `/tools summary`
- `/tools search browser`
- `/tools transports`
- `/browser status`
- `/browser fetch https://example.com`
- `/browser inspect https://example.com`
- `/browser snapshot https://example.com`
- `/browser screenshot https://example.com`
- `/browser capture https://example.com`
- `/browser analyze https://example.com`
- `/browser compare https://example.com/left :: https://example.com/right`
- `/browser compare analyze https://example.com/left :: https://example.com/right`
- `/media transcript ./recordings/daily-sync.wav`
- `/media caption ./artifacts/screenshot.png`
- `/media bundle ./recordings/daily-sync.wav`
- `/media analyze ./recordings/daily-sync.wav`
- `/media voice ./recordings/daily-sync.wav`
- `/media vision ./artifacts/screenshot.png`
- `/media generate a cinematic dusk skyline over the Eliza Agent workspace`
- `/mcp status`
- `/mcp tools`
- `/mcp cached`
- `/mcp cached describe`
- `/mcp cached search echo`
- `/mcp invoke list-tools`
- `/mcp call sum :: {"a":3,"b":4}`
- `/acp status`
- `/acp registry`
- `/acp publish`
- `/acp tools`
- `/acp search terminal`
- `/acp call sum :: {"a":3,"b":4}`
- `/web snapshot https://example.com`
- `/web inspect https://example.com`
- `/delegate list`
- `/delegate list group:browser`
- `/delegate create Research spike :: validate a Discord transport adapter`
- `/delegate create Vision batch | group:browser | profile:research | priority:high | labels:browser,media | metadata:owner=agent :: inspect screenshots and summarize visual regressions`
- `/delegate spawn <parent-id> | title:Browser child | group:browser | profile:research | labels:screenshot :: refine the capture workflow`
- `/delegate tree <task-id>`
- `/delegate group browser`
- `/delegate label screenshot`
- `/delegate children <task-id>`
- `/delegate execute <task-id>`
- `/delegate execute-queued`
- `/delegate supervise group:browser concurrency:3`
- `/delegate overview`
- `/delegate queue label:queue`
- `/delegate workers profile:research`
- `/delegate retry <task-id> :: retry with updated context`
- `/delegate cancel <task-id> :: stop the branch`
- `/skills synthesize <task-id>`
- `/trajectories list`
- `/trajectories export`
- `/trajectories export session:room-123 role:user limit:50`
- `/trajectories bundle`
- `/trajectories bundle session:room-123`
- `/trajectories analyze`
- `/trajectories analyze session:room-123 role:user limit:50`
- `/trajectories evaluate`
- `/trajectories evaluate session:room-123 role:user limit:50 rubric:memory,skills`
- `/trajectories package`
- `/trajectories package session:room-123 role:user limit:50 rubric:memory,skills`
- `/trajectories replay latest`
- `/trajectories compare latest`
- `/trajectories ingest gateway`
- `/trajectories ingest gateway label:gateway-review limit:100`
- `/trajectories batch label:research rubric:coverage,signal :: investigate transport drift => summarize queued prompts`
- `/context files`
- `/status`
- `/runtime status`
- `/doctor`
- `/setup checklist`
- `/setup summary`
- `/update preview`
- `/migrate scan`
- `/migrate inspect /path/to/legacy-agent-home`
- `/migrate apply /path/to/legacy-agent-home :: overwrite=true`
- `/web fetch https://example.com`
- `/media inspect ./packages/characters/eliza-agent.character.json`
- `/media transcribe ./recordings/daily-sync.wav`
- `/media speak Eliza Agent is ready for the next workspace pass.`
- `/pdf extract ./path/to/file.pdf`
- `/workspace tree`
- `/workspace read package.json`
- `/workspace search elizaos`
- `/workspace write notes/todo.txt :: follow up on transport native experience`
- `/terminal recent`
- `/terminal run git status --short`
- `/repo status`
- `/repo diff`
- `/repo log`
- `/gateway start`
- `/gateway config`
- `/gateway state`
- `/gateway runtime`
- `/gateway trace platform:telegram limit:10`
- `/gateway receive telegram user42 room42 :: hello there`
- `/gateway status`
- `/platforms`
- `/voice status`
- `/voice on`
- `/voice tts`
- `/voice join`
- `/voice leave`
- `/sethome`
- `/gateway inbox`
- `/gateway outbox`
- `/gateway attachments`
- `/pairing pending`
- `/hooks add gateway:startup startup-log :: Gateway started for {{platforms}}`
- `/hooks recent`

Gateway observability is route-aware and attachment-aware: `/gateway/state` includes per-platform trace counts plus the last route/respond/deliver/reject activity, inbox/outbox journaling, attachment counts, and live transport readiness semantics, while `/gateway/trace` accepts `kind=route` alongside the other lifecycle filters.

### HTTP API

When `ELIZA_AGENT_MODE=api` or `both`, the Bun API exposes:

- `GET /health`
- `GET /features`
- `GET /runtime/status`
- `GET /platforms`
- `GET /memory?target=memory|user`
- `GET /sessions`
- `GET /sessions/summary`
- `GET /profiles/users`
- `GET /profiles/users/search?query=Bun`
- `GET /profiles/users/card?userId=user-123`
- `GET /profiles/users/beliefs?userId=user-123`
- `GET /profiles/users/relationship?userId=user-123`
- `GET /profiles/users/engagement?userId=user-123`
- `GET /profiles/agent`
- `GET /skills`
- `GET /skills/generated`
- `GET /tools`
- `GET /tools/search`
- `GET /tools/summary`
- `GET /tools/transports`
- `GET /browser/status`
- `GET /browser/inspect`
- `POST /browser/screenshot`
- `POST /browser/capture`
- `POST /browser/analyze`
- `POST /browser/compare`
- `POST /browser/compare/analyze`
- `GET /mcp/status`
- `GET /mcp/tools`
- `GET /mcp/cached`
- `GET /mcp/cached/search`
- `GET /mcp/cached/describe`
- `GET /mcp/tool`
- `POST /mcp/probe`
- `POST /mcp/invoke`
- `POST /mcp/invoke-tool`
- `GET /acp/status`
- `GET /acp/registry`
- `GET /acp/tools`
- `GET /acp/tool`
- `POST /acp/publish`
- `POST /acp/probe`
- `POST /acp/invoke`
- `POST /acp/call`
- `GET /doctor`
- `GET /setup/checklist`
- `GET /setup/summary`
- `GET /update/preview`
- `GET /migrate/sources`
- `GET /migrate/inspect?path=/path/to/source`
- `POST /migrate/apply`
- `POST /profiles/users/note`
- `POST /profiles/users/remember`
- `POST /profiles/users/mode`
- `POST /profiles/agent/observe`
- `GET /workspace/tree`
- `GET /workspace/read`
- `GET /workspace/search`
- `POST /workspace/write`
- `GET /web/fetch`
- `POST /web/snapshot`
- `GET /media/inspect`
- `GET /media/transcript`
- `GET /media/caption`
- `GET /media/bundle`
- `POST /media/analyze`
- `POST /media/transcribe`
- `POST /media/speak`
- `GET /execution/status`
- `GET /execution/backends`
- `POST /execution/preview`
- `GET /terminal/history`
- `POST /terminal/run`
- `GET /delegation/tasks`
- `GET /delegation/tasks?group=browser&label=screenshot`
- `POST /delegation/tasks`
- `GET /delegation/tasks/:id`
- `GET /delegation/tasks/:id/children`
- `GET /delegation/tasks/:id/tree`
- `POST /delegation/tasks/:id/spawn`
- `GET /delegation/groups`
- `GET /delegation/overview`
- `GET /delegation/workers`
- `GET /delegation/workers?profile=research&label=queue`
- `POST /delegation/supervise`
- `POST /delegation/tasks/:id/:action`
- `GET /repo/status`
- `GET /repo/diff`
- `GET /repo/log`
- `POST /documents/pdf/extract`
- `POST /trajectories/ingest/gateway`
- `POST /trajectories/batch`
- `POST /trajectories/package`
- `GET /trajectories/package`
- `GET /deliveries`
- `GET /sessions/gateway`
- `GET /sessions/gateway/home?platform=telegram`
- `GET /personality`
- `POST /personality`
- `GET /context/files`
- `GET /settings`
- `POST /settings`
- `GET /cron/jobs`
- `GET /cron/runs`
- `POST /cron/jobs`
- `PATCH /cron/jobs/:id`
- `POST /skills/synthesize`
- `GET /trajectories/bundles`
- `POST /trajectories/export`
- `POST /trajectories/bundle`
- `POST /trajectories/analyze`
- `POST /trajectories/replay`
- `GET /trajectories/replay`
- `GET /trajectories/replay/latest`
- `GET /gateway/config`
- `POST /gateway/config`
- `GET /gateway/health`
- `GET /gateway/runtime`
- `GET /gateway/state`
- `GET /gateway/trace`
- `GET /gateway/deliveries`
- `GET /gateway/inbox`
- `GET /gateway/outbox`
- `GET /gateway/attachments`
- `GET /gateway/history`
- `POST /gateway/start`
- `POST /gateway/stop`
- `POST /gateway/message`
- `POST /sessions/gateway/voice`
- `POST /sessions/gateway/home`
- `POST /webhooks/telegram`
- `POST /webhooks/discord`
- `POST /webhooks/slack`
- `POST /webhooks/signal`
- `POST /webhooks/matrix`
- `POST /webhooks/email`
- `POST /webhooks/sms`
- `POST /webhooks/mattermost`
- `POST /webhooks/homeassistant`
- `POST /webhooks/dingtalk`
- `GET /webhooks/whatsapp`
- `POST /webhooks/whatsapp`
- `GET /pairing/pending`
- `POST /pairing/approve`
- `POST /pairing/deny`
- `GET /hooks`
- `POST /hooks`
- `DELETE /hooks/:id`
- `POST /chat`

Example:

```bash
curl -X POST http://localhost:3000/chat \
  -H "content-type: application/json" \
  -d '{"message":"Remember that this repo uses Bun only.","userId":"demo"}'
```

## Current Scope

This repo provides a durable interaction model and state layer in a way that fits ElizaOS cleanly:

- persistent separated memory stores
- cross-session search
- skill discovery
- scheduler-backed automations
- local and API entrypoints
- gateway session routing
- pairing and allowlist workflows
- hook registration and invocation logs
- delivery persistence
- personality switching
- workspace context ingestion
- runtime settings management
- Bun-first runtime and build flow
