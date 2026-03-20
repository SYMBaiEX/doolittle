# Eliza Agent

Eliza Agent is a Bun-first, TypeScript-native ElizaOS platform built around a focused Eliza runtime. The goal of this repo is not to pull in every plugin in the Eliza ecosystem; it is to provide a smaller, inspectable surface for character-driven runtime behavior, persistent memory, session recall, skill discovery, scheduled automations, local CLI access, and a network API.

## Versioning note

On March 19, 2026, npm reports:

- `elizaos@latest` → `2.0.0-alpha.77`
- `elizaos@alpha` → `2.0.0-alpha.76`

This project therefore uses the `latest` dist-tag for the `elizaos` umbrella package and `@elizaos/core`, instead of hardcoding `2.0.0-alpha.77`.

## Why this shape

The published `elizaos` package is a CLI/examples wrapper, while the actual agent runtime comes from `@elizaos/core`. This repo includes both:

- `elizaos: "latest"` to satisfy the requested package channel
- `@elizaos/core: "latest"` for the runtime used by the Bun application
- `@elizaos/plugin-sql: "alpha"` because, on March 19, 2026, that tag was the compatible 2.0 line for runtime initialization alongside `@elizaos/core@latest`

The platform-specific features that do not have a single clean ElizaOS equivalent are implemented here as custom ElizaOS actions, providers, evaluators, and Bun-native services.

## File tree

```text
eliza-agent/
├── .env.example
├── README.md
├── biome.json
├── package.json
├── tsconfig.json
├── characters/
│   └── eliza-agent.character.json
└── src/
    ├── character.ts
    ├── cli.ts
    ├── index.ts
    ├── server.ts
    ├── types.ts
    ├── actions/
    │   ├── cron-action.ts
    │   ├── memory-action.ts
    │   ├── session-search-action.ts
    │   └── skills-action.ts
    ├── config/
    │   ├── env.ts
    │   └── feature-map.ts
    ├── evaluators/
    │   └── memory-nudge-evaluator.ts
    ├── plugins/
    │   └── eliza-agent-plugin.ts
    ├── providers/
    │   └── agent-context-provider.ts
    ├── runtime/
    │   ├── bootstrap.ts
    │   └── chat.ts
    └── services/
        ├── cron-service.ts
        ├── index.ts
        ├── memory-service.ts
        ├── session-service.ts
        └── skills-service.ts
```

## Capabilities

| Platform capability | Eliza Agent implementation |
|---|---|
| Persona / system prompt | `characters/eliza-agent.character.json` + [`src/character.ts`](./src/character.ts) |
| Agent runtime | `AgentRuntime` from `@elizaos/core` |
| Model provider routing | Official ElizaOS OpenAI and Anthropic plugins, with local offline fallback in [`src/plugins/eliza-agent-plugin.ts`](./src/plugins/eliza-agent-plugin.ts) |
| MEMORY.md and USER.md | [`src/services/memory-service.ts`](./src/services/memory-service.ts) |
| Session search | [`src/services/session-service.ts`](./src/services/session-service.ts) + `/search` command |
| Skills browsing | [`src/services/skills-service.ts`](./src/services/skills-service.ts) + `/skills` command |
| Cron / scheduled runs | [`src/services/cron-service.ts`](./src/services/cron-service.ts) + `/cron` command family |
| CLI entrypoint | [`src/cli.ts`](./src/cli.ts) |
| API server | [`src/server.ts`](./src/server.ts) with Bun's native HTTP server |
| Gateway runner | [`src/gateway/gateway-runner.ts`](./src/gateway/gateway-runner.ts) |
| Pairing and allowlists | [`src/services/pairing-service.ts`](./src/services/pairing-service.ts) |
| Hooks and event logs | [`src/services/hooks-service.ts`](./src/services/hooks-service.ts) |
| Delivery routing | [`src/services/delivery-service.ts`](./src/services/delivery-service.ts) |
| Personality profiles | [`src/services/personality-service.ts`](./src/services/personality-service.ts) |
| Workspace context files | [`src/services/context-files-service.ts`](./src/services/context-files-service.ts) |
| Runtime settings and model config | [`src/services/settings-service.ts`](./src/services/settings-service.ts) |
| Browser inspection and artifacts | [`src/services/web-service.ts`](./src/services/web-service.ts) + `/browser` commands |
| Media inspection and PDF metadata | [`src/services/media-service.ts`](./src/services/media-service.ts) + `/media` commands |
| PDF extraction | [`src/services/documents-service.ts`](./src/services/documents-service.ts) + `@elizaos/plugin-pdf` |
| Workspace exploration | [`src/services/workspace-service.ts`](./src/services/workspace-service.ts) + `/workspace` commands |
| Local terminal execution | [`src/services/terminal-service.ts`](./src/services/terminal-service.ts) + `/terminal` commands |
| Repository inspection | [`src/services/repository-service.ts`](./src/services/repository-service.ts) + `/repo` commands |
| Execution backend control | [`src/services/terminal-service.ts`](./src/services/terminal-service.ts) + `/execution` commands with local, Docker, Podman, SSH, and Singularity runtime settings, probes, preview, and bootstrap paths |
| Tool registry | [`src/services/tools-service.ts`](./src/services/tools-service.ts) + `/tools` commands |
| MCP bridge | [`src/services/mcp-service.ts`](./src/services/mcp-service.ts) + `/mcp` commands for probe, discovery, and structured tool invocation |
| Delegation queue | [`src/services/delegation-service.ts`](./src/services/delegation-service.ts) + `/delegate` commands |
| Memory nudges / persistence hints | [`src/evaluators/memory-nudge-evaluator.ts`](./src/evaluators/memory-nudge-evaluator.ts) |
| Shared task context | [`src/providers/agent-context-provider.ts`](./src/providers/agent-context-provider.ts) |

## Plugin inventory

The initial build intentionally stays small:

- `@elizaos/core`
  - Core runtime, message pipeline, character model, action/provider/evaluator contracts.
- `@elizaos/plugin-openai`
  - Official OpenAI provider plugin for GPT-family and Codex-capable model routing on the current ElizaOS alpha runtime line.
- `@elizaos/plugin-anthropic`
  - Official Anthropic provider plugin for Claude-family model routing on the current ElizaOS alpha runtime line.
- `@elizaos/plugin-pdf`
  - Official PDF service plugin for runtime-native document extraction.
- `@elizaos/plugin-sql`
  - Required ElizaOS database adapter for runtime initialization and local persistent state.
- `@elizaos/plugin-telegram`
  - Official Telegram transport plugin, enabled only when Telegram credentials are configured.
- `elizaos`
  - Requested dist-tag package channel for the ElizaOS umbrella package.
- `eliza-agent-runtime` custom plugin
  - Adds the platform memory, scheduler, session search, skill inventory behavior, runtime-managed service classes for gateway/scheduler lifecycle, and offline local fallback behavior when no provider plugin is configured.

This codebase now includes the core runtime plus the surrounding application services needed for a broader agent platform: gateway configuration, pairing, hooks, session routing, and delivery persistence. Additional transport-specific implementations can be layered on top of the same abstractions without changing the core architecture.

The gateway and scheduler lifecycle are also registered through ElizaOS service classes inside the custom plugin, so long-running runtime behavior follows the native ElizaOS service model instead of living purely as external wrappers.

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
| `OPENAI_TEMPERATURE` | Default completion temperature. |
| `OPENAI_MAX_TOKENS` | Default completion output cap. |
| `ANTHROPIC_API_KEY` | API key for the official ElizaOS Anthropic plugin. |
| `ANTHROPIC_BASE_URL` | Optional Anthropic-compatible base URL override. |
| `ANTHROPIC_SMALL_MODEL` | Default Anthropic small model identifier. |
| `ANTHROPIC_LARGE_MODEL` | Default Anthropic large model identifier. |
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
bun install
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

When `ELIZA_AGENT_MODE=cli` or `both`, the runtime starts a local REPL.

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
- `/cron list`
- `/cron create every 2h | name:deploy-review | skills:automation/reports | personality:focused | model:gpt-4.1-mini :: summarize recent deployment logs`
- `/cron show <job-id>`
- `/cron update <job-id> every 4h | delivery:local | runtime:default :: refresh release notes`
- `/cron runs`
- `/personality list`
- `/personality set autonomous`
- `/model status`
- `/model set model gpt-4.1-mini`
- `/execution status`
- `/execution backends`
- `/execution bootstrap`
- `/execution preview git status --short`
- `/execution set backend docker`
- `/execution set backend podman`
- `/execution set backend singularity`
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
- `/media transcript ./recordings/daily-sync.wav`
- `/media caption ./artifacts/screenshot.png`
- `/mcp status`
- `/mcp tools`
- `/mcp cached`
- `/mcp cached describe`
- `/mcp cached search echo`
- `/mcp invoke list-tools`
- `/mcp call sum :: {"a":3,"b":4}`
- `/web snapshot https://example.com`
- `/web inspect https://example.com`
- `/delegate list`
- `/delegate create Research spike :: validate a Discord transport adapter`
- `/delegate create Vision batch | profile:research | priority:high | tags:browser,media :: inspect screenshots and summarize visual regressions`
- `/delegate execute <task-id>`
- `/delegate execute-queued`
- `/skills synthesize <task-id>`
- `/trajectories list`
- `/trajectories export`
- `/trajectories export session:room-123 role:user limit:50`
- `/trajectories bundle`
- `/trajectories bundle session:room-123`
- `/trajectories replay latest`
- `/context files`
- `/status`
- `/runtime status`
- `/doctor`
- `/setup checklist`
- `/web fetch https://example.com`
- `/media inspect ./characters/eliza-agent.character.json`
- `/pdf extract ./path/to/file.pdf`
- `/workspace tree`
- `/workspace read package.json`
- `/workspace search elizaos`
- `/workspace write notes/todo.txt :: follow up on transport parity`
- `/terminal recent`
- `/terminal run git status --short`
- `/repo status`
- `/repo diff`
- `/repo log`
- `/gateway start`
- `/gateway config`
- `/gateway state`
- `/gateway trace platform:telegram limit:10`
- `/gateway receive telegram user42 room42 :: hello there`
- `/gateway status`
- `/pairing pending`
- `/hooks add gateway:startup startup-log :: Gateway started for {{platforms}}`
- `/hooks recent`

### HTTP API

When `ELIZA_AGENT_MODE=api` or `both`, the Bun API exposes:

- `GET /health`
- `GET /features`
- `GET /runtime/status`
- `GET /memory?target=memory|user`
- `GET /sessions`
- `GET /sessions/summary`
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
- `GET /mcp/status`
- `GET /mcp/tools`
- `GET /mcp/cached`
- `GET /mcp/cached/search`
- `GET /mcp/cached/describe`
- `GET /mcp/tool`
- `POST /mcp/probe`
- `POST /mcp/invoke`
- `POST /mcp/invoke-tool`
- `GET /doctor`
- `GET /setup/checklist`
- `GET /workspace/tree`
- `GET /workspace/read`
- `GET /workspace/search`
- `POST /workspace/write`
- `GET /web/fetch`
- `POST /web/snapshot`
- `GET /media/inspect`
- `GET /media/transcript`
- `GET /media/caption`
- `GET /execution/status`
- `GET /execution/backends`
- `POST /execution/preview`
- `GET /terminal/history`
- `POST /terminal/run`
- `GET /delegation/tasks`
- `POST /delegation/tasks`
- `POST /delegation/tasks/:id/:action`
- `GET /repo/status`
- `GET /repo/diff`
- `GET /repo/log`
- `POST /documents/pdf/extract`
- `GET /deliveries`
- `GET /sessions/gateway`
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
- `POST /trajectories/replay`
- `GET /trajectories/replay`
- `GET /trajectories/replay/latest`
- `GET /gateway/config`
- `POST /gateway/config`
- `GET /gateway/health`
- `GET /gateway/state`
- `GET /gateway/trace`
- `GET /gateway/deliveries`
- `GET /gateway/history`
- `POST /gateway/start`
- `POST /gateway/stop`
- `POST /gateway/message`
- `POST /webhooks/telegram`
- `POST /webhooks/discord`
- `POST /webhooks/slack`
- `POST /webhooks/signal`
- `POST /webhooks/matrix`
- `POST /webhooks/email`
- `POST /webhooks/sms`
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
