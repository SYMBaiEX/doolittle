# Doolittle

```
            @@@@@@@@@@@
          @@@@@@@@@@@@@@@
        @@@@@@@@@@@@@@@@@@@
       @@@@@@@@@@@@@@@@@@@@@@
      @@@@@@@@@@@@oo@@@@@@@@@@      DOOLITTLE
     @@@@@@@@@@@@____@@@@@@@@@@      ELIZA // CYPHERPUNK OPERATOR SHELL
     @@@@@@@@@@@/ __ \\@@@@@@@@@
      @@@@@@@@@@\\____/@@@@@@@@@      Booting workspace...
       @@@@@@@@@@@@@@@@@@@@@@@
        _____@@___@@_____
       / ____\\   /____ \\
      / / __  \\ /  __ \\ \\
     / /_/ /\\  V  / /_/ /
    /_____/_/\\___/\\____/
       /_/        \\_\\
      /_/          \\_\\
```

> The shell is warm. The channels are waiting.

A terminal-native AI agent that thinks in loops, not single shots. Doolittle runs a Cloud-first, ElizaOS-native multi-step shell: native runtime first, direct local rescue when needed, observed run progress, and a transcript-first terminal UI. Built on [ElizaOS](https://github.com/elizaos/eliza) with Bun and TypeScript.

---

## First contact

```bash
bash scripts/install.sh
```

The installer runs `bun install`, forges `~/.local/bin/doolittle`, wires your shell PATH, and begins the awakening sequence — an interactive onboarding ritual that configures your provider, execution backend, browser mode, transports, and workspace. When it finishes, you have a real shell command.

```bash
doolittle
```

That's it. You land in the plain interactive CLI first.

Installer modes:

```bash
bash scripts/install.sh --headless      # non-interactive
bash scripts/install.sh --skip-wizard   # skip onboarding
bash scripts/install.sh --check         # dry run — reports what would happen
bash scripts/install.sh --yes           # auto-accept prompts
```

The onboarding writes directly into:

- `.env` — provider keys, model routing, transport tokens
- `.doolittle/settings.json` — runtime configuration
- `.doolittle/gateway/gateway.json` — gateway and transport config
- `.doolittle/onboarding.json` — completion state

If a fresh terminal can't find `doolittle`, restart the shell or source the profile that was updated (`~/.zshrc` on macOS, `~/.bashrc` on Linux).

Fast first-run:

1. `bash scripts/install.sh`
2. Restart your shell if PATH was updated
3. `doolittle`
4. Run `doolittle status`, `doolittle tools`, and `doolittle runtime`
5. If setup looks off, run `doolittle doctor`

If you only remember six commands after install, make them these:

| Need | Command | What it tells you |
|---|---|---|
| Enter the shell | `doolittle` | Starts the everyday operator loop |
| Check readiness first | `doolittle status` | Runtime health, hydration, and operator summary |
| See what tools exist | `doolittle tools` | Current tool and control-plane surface |
| See what skills exist | `doolittle skills` | Installed, generated, and hub-backed skills |
| Inspect native ownership | `doolittle runtime` | Plugin assembly, native/runtime status, and startup state |
| Work transports | `doolittle gateway` | Messaging and delivery operations |

The product has three operator lanes, but they share one runtime story:

- `doolittle` and `doolittle cockpit` are the daily interactive shell surfaces
- `doolittle status`, `tools`, `skills`, and `runtime` are the fast one-shot orientation aliases
- `doolittle gateway` and `doolittle api` are the daemon and integration surfaces over the same assembled runtime

Keep the layers clean:

- [`docs/quickstart.md`](./docs/quickstart.md) for install-to-ready in one pass
- [`docs/operator-loop.md`](./docs/operator-loop.md) for the daily shell/operator rhythm

---

## How it thinks

Doolittle is now native-first:

```
You ask for something
  → explicit shortcuts stay local first:
      /slash commands
      !shell commands
      direct approval flows
  → everything else goes to ElizaOS messageService.handleMessage(...)
      with useMultiStep=true
  → runtime events stream back:
      thinking
      action started/completed
      waiting
      message sent
  → run controller tracks:
      run depth
      configured cap
      observed action/tool steps
      approvals
      active tool stream
  → if native planning stalls with no observed action,
      Doolittle rescues with the direct local executor
  → final answer returns through one shared shell/gateway progress contract
```

This means the shell stays thin over ElizaOS:

1. **Native first**: natural requests go through the Eliza runtime before product rescue logic.
2. **Observed truth**: the UI shows configured iteration caps plus observed steps, not fake decremented counters.
3. **Deferred hydration**: the shell becomes interactive first, then gateway/cron/diagnostics/operator surfaces hydrate behind it.
4. **Prompt reuse where it matters**: simple conversational turns are cached safely in-session, and Eliza Cloud turns carry a stable conversation id so xAI prompt caching can reduce repeated prompt cost on managed Cloud runs.
5. **Native coding context**: local coding turns now flow with a real ElizaOS `coding-agent-context` instead of an ad hoc workspace prelude.

### Run depth

How deep should the agent go? Set a preset or override with an explicit cap:

| Depth | Iterations | When to use |
|---|---|---|
| `quick` | 15 | Simple lookups, single-tool answers |
| `standard` | 45 | Multi-file edits, moderate exploration |
| `deep` | 90 | Large refactors, cross-codebase rewrites |
| `explore` | 150 | Open-ended research, deep analysis runs |

```bash
DOOLITTLE_RUN_DEPTH=deep doolittle
DOOLITTLE_MAX_ITERATIONS=120 doolittle  # explicit override
```

### Tool progress

Progress density is explicit and shared across the TUI, plain CLI, diagnostics, and gateway streams:

| Mode | Behavior |
|---|---|
| `off` | Only final output |
| `new` | Phase changes and new tool activity |
| `all` | All tool/run activity except pure chatter |
| `verbose` | Full run and stream detail |

```bash
DOOLITTLE_TOOL_PROGRESS=verbose doolittle
```

### Startup model

The runtime now boots in tiers:

1. **Hot path**: settings, provider resolution, runtime, run controller, plugin assembly
2. **Deferred hydration**: gateway, cron, diagnostics, operator summaries, ecosystem and skills inventory

You can see this live in `/status`, `/doctor`, the TUI runtime rail, and `GET /runtime/status`.

---

## Surfaces

Doolittle meets you where you are.

### Plain interactive CLI

The default mode. A conversation-first terminal shell with the same runtime core, slash commands, approvals, and run-progress contract as the cockpit, but without fullscreen assumptions. This is the primary everyday surface.

```bash
doolittle          # plain interactive CLI (default)
doolittle help     # top-level command help without booting the runtime
doolittle plain    # explicit alias for the same plain shell
doolittle status   # one-shot runtime/operator status
doolittle tools    # one-shot tools summary
doolittle skills   # one-shot skills summary
doolittle runtime  # one-shot runtime status surface
doolittle exec -p "summarize this repo"   # one-shot execution
doolittle exec -p "status" --json         # machine-readable one-shot output
```

### Operator cockpit (TUI)

The optional fullscreen operator view. Use it when you want the richer transcript-first Blessed UI, status rail, activity log, command palette, and long-running observability surfaces.

```bash
doolittle cockpit  # fullscreen cockpit
```

Quick shortcuts:

| Key | Action |
|---|---|
| `F2` | Status |
| `F3` | Tools summary |
| `F4` | Delegate overview |
| `F5` | Gateway readiness |
| `F6` | Sessions list |
| `F7` | Doctor |
| `F8` | Runtime plugins |
| `Esc` | Focus input |
| `Tab` | Complete the top suggested command |
| `Ctrl-P` | Open the command palette |
| `Ctrl-R` | Refresh runtime panels |
| `Ctrl-L` | Clear the activity feed |

### HTTP API

When `DOOLITTLE_MODE=api` or `both`, a Bun-native HTTP server exposes every capability as REST endpoints:

```bash
curl -X POST http://localhost:3000/chat \
  -H "content-type: application/json" \
  -d '{"message":"summarize this repo and tell me where to start","userId":"demo"}'
```

**Core**

- `GET /health`
- `GET /features`
- `GET /runtime/status`
- `POST /chat`

**Skills and tools**

- `GET /skills`
- `GET /skills/generated`
- `POST /skills/synthesize`
- `GET /tools`
- `GET /tools/search`
- `GET /tools/summary`
- `GET /tools/transports`

**Memory and sessions**

- `GET /memory?target=memory|user`
- `GET /sessions`
- `GET /sessions/summary`
- `GET /search`

**User and agent profiles**

- `GET /profiles/users`
- `GET /profiles/users/search?query=Bun`
- `GET /profiles/users/card?userId=user-123`
- `GET /profiles/users/beliefs?userId=user-123`
- `GET /profiles/users/relationship?userId=user-123`
- `GET /profiles/users/engagement?userId=user-123`
- `POST /profiles/users/note`
- `POST /profiles/users/remember`
- `POST /profiles/users/mode`
- `GET /profiles/agent`
- `POST /profiles/agent/observe`

**Browser**

- `GET /browser/status`
- `GET /browser/inspect`
- `POST /browser/screenshot`
- `POST /browser/capture`
- `POST /browser/analyze`
- `POST /browser/compare`
- `POST /browser/compare/analyze`

**MCP bridge**

- `GET /mcp/status`
- `GET /mcp/tools`
- `GET /mcp/cached`
- `GET /mcp/cached/search`
- `GET /mcp/cached/describe`
- `GET /mcp/tool`
- `POST /mcp/probe`
- `POST /mcp/invoke`
- `POST /mcp/invoke-tool`

**ACP registry**

- `GET /acp/status`
- `GET /acp/registry`
- `GET /acp/tools`
- `GET /acp/tool`
- `POST /acp/publish`
- `POST /acp/probe`
- `POST /acp/invoke`
- `POST /acp/call`

**Execution and terminal**

- `GET /execution/status`
- `GET /execution/backends`
- `POST /execution/preview`
- `GET /terminal/history`
- `POST /terminal/run`

**Delegation**

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

**Workspace and repository**

- `GET /workspace/tree`
- `GET /workspace/read`
- `GET /workspace/search`
- `POST /workspace/write`
- `GET /repo/status`
- `GET /repo/diff`
- `GET /repo/log`

**Media**

- `GET /media/inspect`
- `GET /media/transcript`
- `GET /media/caption`
- `GET /media/bundle`
- `POST /media/analyze`
- `POST /media/transcribe`
- `POST /media/speak`

**Documents**

- `POST /documents/pdf/extract`

**Trajectories**

- `GET /trajectories/bundles`
- `GET /trajectories/package`
- `GET /trajectories/replay`
- `GET /trajectories/replay/latest`
- `POST /trajectories/export`
- `POST /trajectories/bundle`
- `POST /trajectories/analyze`
- `POST /trajectories/replay`
- `POST /trajectories/package`
- `POST /trajectories/batch`
- `POST /trajectories/ingest/gateway`

**Scheduling**

- `GET /cron/jobs`
- `GET /cron/runs`
- `POST /cron/jobs`
- `PATCH /cron/jobs/:id`

**Settings and personality**

- `GET /settings`
- `POST /settings`
- `GET /personality`
- `POST /personality`
- `GET /context/files`

**Diagnostics and setup**

- `GET /doctor`
- `GET /setup/checklist`
- `GET /setup/summary`
- `GET /update/preview`
- `GET /migrate/sources`
- `GET /migrate/inspect?path=/path/to/source`
- `POST /migrate/apply`

**Gateway**

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
- `GET /sessions/gateway`
- `GET /sessions/gateway/home?platform=telegram`
- `POST /sessions/gateway/voice`
- `POST /sessions/gateway/home`
- `GET /deliveries`

**Webhooks**

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

**Pairing and hooks**

- `GET /pairing/pending`
- `POST /pairing/approve`
- `POST /pairing/deny`
- `GET /hooks`
- `POST /hooks`
- `DELETE /hooks/:id`

**Planning and forms**

- Native planning control-plane endpoints and `/planning` flows
- Native forms control-plane endpoints and `/forms` flows
- Native integration inventory and readiness endpoints

**Ecosystem**

- `GET /runtime/plugins` — native plugin inventory
- Package audit views via `/runtime ecosystem`

Gateway observability is route-aware and attachment-aware: `/gateway/state` includes per-platform trace counts plus the last route/respond/deliver/reject activity, inbox/outbox journaling, attachment counts, and live transport readiness semantics, while `/gateway/trace` accepts `kind=route` alongside the other lifecycle filters.

### Gateway

Multi-platform message routing for Telegram, Discord, Slack, WhatsApp, Signal, Matrix, email, SMS, Mattermost, Home Assistant, and DingTalk. Webhook ingestion, pairing workflows, delivery persistence, and session orchestration — all through the same runtime.

```bash
doolittle gateway
```

### Surface quick reference

| Surface | Command | Use when |
|---|---|---|
| Plain CLI (default) | `doolittle` | Everyday operator loop |
| Operator check-ins | `doolittle status`, `doolittle tools`, `doolittle skills`, `doolittle runtime` | Fast health, capability, and runtime checks without remembering slash syntax |
| Plain alias | `doolittle plain` | Same behavior, no TUI |
| Cockpit | `doolittle cockpit` | Full-screen operator UI |
| One-shot | `doolittle exec -p "<prompt>"` | Repeatable, non-interactive actions |
| API server | `doolittle api` | Tooling integrations |
| Gateway runner | `doolittle gateway` | Messaging transports and delivery ops |
| Installer rerun | `doolittle install` | Re-run local install bootstrap |
| Setup rerun | `doolittle setup` | Reconfigure provider/backends/transports |

---

## Subcommands

All routing happens in TypeScript — `packages/agent/src/index.ts` dispatches based on the first argument.

```bash
doolittle          # Start the plain interactive CLI (default)
doolittle status   # Show live runtime/operator status
doolittle tools    # Show the current tool surface summary
doolittle skills   # Browse installed and generated skills
doolittle runtime  # Inspect native/runtime ownership surfaces
doolittle commands # Browse slash commands and bundled workflows
doolittle plain    # Plain line-based CLI
doolittle cockpit  # Fullscreen operator cockpit
doolittle dev      # Development mode
doolittle setup    # Re-run the onboarding wizard
doolittle doctor   # Readiness diagnostics and health checks
doolittle install  # Re-run the installer
doolittle api      # API server only, no cockpit
doolittle gateway  # Start the gateway runner
dl                 # Short alias (installed when no existing `dl` exists)
```

Legacy flag-based invocation is still supported for backward compatibility: `--cli` launches the cockpit, `--plain-cli` launches the plain shell, plus `--api-only` and `--gateway`.

### Operator aliases

These top-level aliases are the fastest way to orient yourself before you drop into a longer shell session:

- `doolittle status` → `/status`
- `doolittle tools` → `/tools summary` by default, or `/tools <args>`
- `doolittle skills` → `/skills` by default, or `/skills <args>`
- `doolittle runtime` → `/runtime status` by default, or `/runtime <args>`
- `doolittle commands` → shell command inventory and bundled workflow discoverability

### Discover commands fast

- `doolittle status` — check readiness, startup hydration, and operator summary first
- `doolittle tools` / `doolittle skills` / `doolittle runtime` — discover surface area without booting into docs
- `doolittle commands` — browse the slash-command inventory
- `doolittle help` — list top-level command inventory
- `doolittle help <command>` — get targeted usage
- In-shell first: `/status`, `/doctor`, `/runtime status`, `/tools summary`, `/skills`
- If you need one-shot discoverability, start with `doolittle exec -p "<prompt>"`
- For the operator rhythm in one place, use [`docs/operator-loop.md`](./docs/operator-loop.md)

### One-shot mode

For scripting, editor actions, and CI-safe terminal usage:

```bash
doolittle exec -p "summarize this repo and tell me where to start"
doolittle exec --prompt "review the latest changes" --json
```

---

## The operator's toolkit

Doolittle ships with a large service graph, but it no longer blocks the shell on all of it. Core runtime services come up first; operator-heavy surfaces hydrate after the shell is already interactive.

### Works on your code

| Capability | Implementation | CLI | API |
|---|---|---|---|
| Terminal execution (local, Docker, Podman, SSH, Singularity, Daytona, Modal) | [`terminal/service.ts`](./packages/agent/src/services/terminal/service.ts) | `/execution status`, `/execution backends`, `/execution set backend`, `/terminal run` | `GET /execution/status`, `POST /terminal/run` |
| Repository inspection | [`repository-service.ts`](./packages/agent/src/services/repository-service.ts) | `/repo status`, `/repo diff`, `/repo log` | `GET /repo/status`, `GET /repo/diff` |
| Autocoder | [`doolittle-plugin/autocoder`](./packages/plugins/doolittle-plugin/autocoder/) | Native codegen actions | Via runtime actions |
| Workspace exploration | [`workspace-service.ts`](./packages/agent/src/services/workspace-service.ts) | `/workspace tree`, `/workspace read`, `/workspace search` | `GET /workspace/tree`, `GET /workspace/read` |
| Workspace context files | [`context-files-service.ts`](./packages/agent/src/services/context-files-service.ts) | `/context files` | `GET /context/files` |

### Remembers across sessions

| Capability | Implementation | CLI | API |
|---|---|---|---|
| MEMORY.md / USER.md persistence | [`memory-service.ts`](./packages/agent/src/services/memory-service.ts) | `/memory list memory`, `/memory add user` | `GET /memory?target=memory` |
| Cross-session search | [`session/service/index.ts`](./packages/agent/src/services/session/service/index.ts) | `/search <query>` | `GET /search` |
| User profiles | [`user-profile/service/index.ts`](./packages/agent/src/services/user-profile/service/index.ts) | `/user profile`, `/user card`, `/user beliefs`, `/user relationship`, `/user engagement` | `GET /profiles/users/card` |
| Memory nudges | [`memory-nudge-evaluator.ts`](./packages/agent/src/evaluators/memory-nudge-evaluator.ts) | Automatic | Evaluator-driven |
| Shared task context | [`agent-context-provider.ts`](./packages/agent/src/providers/agent-context-provider.ts) | Automatic | Provider-driven |

### Learns and adapts

| Capability | Implementation | CLI |
|---|---|---|
| Skill discovery (20 categories) | [`skills/service.ts`](./packages/agent/src/services/skills/service.ts) | `/skills list`, `/skills show <slug>` |
| Skill synthesis from delegation | [`skills/service.ts`](./packages/agent/src/services/skills/service.ts) | `/skills synthesize <task-id>` |
| Skills hub distribution | [`skills-hub/service.ts`](./packages/agent/src/services/skills-hub/service.ts) | `/skills hub`, `/skills sync`, `/skills export`, `/skills import`, `/skills install` |
| Personality switching | [`personality-service.ts`](./packages/agent/src/services/personality-service.ts) | `/personality list`, `/personality set autonomous` |
| Runtime settings | [`settings-service.ts`](./packages/agent/src/services/settings-service.ts) | `/settings`, `/model status`, `/model set model`, `/config show` |

### Delegates and coordinates

| Capability | Implementation | CLI |
|---|---|---|
| Delegation queue | [`delegation/service/index.ts`](./packages/agent/src/services/delegation/service/index.ts) | `/delegate create`, `/delegate spawn`, `/delegate execute`, `/delegate supervise` |
| Run controller and observed progress | [`run-controller-service.ts`](./packages/agent/src/services/run-controller-service.ts) | `/mode`, `/progress`, automatic live run state |
| Trajectory research | [`trajectory/service/index.ts`](./packages/agent/src/services/trajectory/service/index.ts) | `/trajectories export`, `/trajectories bundle`, `/trajectories analyze`, `/trajectories evaluate`, `/trajectories replay` |
| Planning boards | [`doolittle-plugin/planning`](./packages/plugins/doolittle-plugin/planning/) | `/planning` flows |
| Cron scheduling | [`cron/service/index.ts`](./packages/agent/src/services/cron/service/index.ts) | `/cron list`, `/cron create every 2h \| name:deploy-review :: summarize logs` |

### Reaches the outside world

| Capability | Implementation | CLI |
|---|---|---|
| Browser (Lightpanda) | [`web/service.ts`](./packages/agent/src/services/web/service.ts) | `/browser fetch`, `/browser inspect`, `/browser snapshot`, `/browser screenshot`, `/browser capture`, `/browser analyze`, `/browser compare` |
| MCP bridge | [`mcp-service.ts`](./packages/agent/src/services/mcp-service.ts) | `/mcp status`, `/mcp tools`, `/mcp cached`, `/mcp invoke`, `/mcp call` |
| ACP registry | [`acp-service.ts`](./packages/agent/src/services/acp-service.ts) | `/acp status`, `/acp registry`, `/acp publish`, `/acp tools`, `/acp call` |
| Delivery routing | [`delivery-service.ts`](./packages/agent/src/services/delivery-service.ts) | Via gateway — Telegram, Discord, Slack, WhatsApp, Signal, Matrix, email, SMS |
| Media processing | [`media/service.ts`](./packages/agent/src/services/media/service.ts) | `/media transcript`, `/media caption`, `/media analyze`, `/media voice`, `/media vision`, `/media generate`, `/media speak` |
| PDF extraction | [`documents-service.ts`](./packages/agent/src/services/documents-service.ts) | `/pdf extract` |

### Observes itself

| Capability | Implementation | CLI |
|---|---|---|
| Diagnostics | [`diagnostics/service.ts`](./packages/agent/src/services/diagnostics/service.ts) | `doolittle doctor`, `/doctor` |
| Startup hydration state | [`startup-state-service.ts`](./packages/agent/src/services/startup-state-service.ts) | `/status`, `/doctor`, `GET /runtime/status` |
| Context compression | [`context-compression/service.ts`](./packages/agent/src/services/context-compression/service.ts) | Automatic history pressure management |
| Run progress streaming | [`run-controller-service.ts`](./packages/agent/src/services/run-controller-service.ts) | Automatic |
| Event hooks | [`hooks-service.ts`](./packages/agent/src/services/hooks-service.ts) | `/hooks add`, `/hooks recent` |
| Operator summaries | [`operator/service.ts`](./packages/agent/src/services/operator/service.ts) | `/status`, `/runtime status` |
| Tool registry | [`tools/service.ts`](./packages/agent/src/services/tools/service.ts) | `/tools list`, `/tools summary`, `/tools search` |
| Gateway orchestration | [`gateway-session-service.ts`](./packages/agent/src/services/gateway-session-service.ts) | `/gateway state`, `/gateway trace` |
| Pairing and allowlists | [`pairing-service.ts`](./packages/agent/src/services/pairing-service.ts) | `/pairing pending` |
| Account management | [`accounts-commands.ts`](./packages/agent/src/runtime/commands/accounts-commands.ts) | `/accounts`, `/accounts connect`, `/accounts use` |

---

## Skills discovery

Curated skill docs live under [`packages/skills`](./packages/skills) organized by category:

| Category | Domain |
|---|---|
| `identity/` | Agent identity and persona |
| `memory/` | Memory management and persistence |
| `productivity/` | Task and workflow automation |
| `automation/` | Scheduled and event-driven automation |
| `communications/` | Cross-platform messaging |
| `documentation/` | Doc generation and maintenance |
| `data/` | Data processing and analysis |
| `distribution/` | Package and release distribution |
| `operations/` | DevOps and infrastructure |
| `observability/` | Monitoring and diagnostics |
| `integrations/` | Third-party service integration |
| `planning/` | Planning and coordination |
| `safety/` | Security and prompt injection scanning |
| `support/` | User support workflows |
| `testing/` | Testing and evaluation |
| `platform/` | Platform-specific capabilities |
| `knowledge/` | Knowledge management |
| `browser/` | Browser automation and web research |
| `media/` | Media processing and generation |
| `research/` | Research bundling and analysis |
| `generated/` | Agent-synthesized skills |

Skills hub distribution, manifest export/import, and install workflows are documented in [`docs/skills-hub.md`](./docs/skills-hub.md).

---

## Providers

Doolittle doesn't lock you to one inference path.

| Provider | What it does |
|---|---|
| **Local Ollama** | Default local/self-hosted inference through `@elizaos/plugin-ollama` |
| **Eliza Cloud** | Optional managed ElizaOS inference when you want a cloud path |
| **Codex** | Reuses your local Codex CLI login for OpenAI routing |
| **Claude Code** | Reuses your local Claude Code OAuth for Anthropic routing |
| **OpenAI API key** | Direct `OPENAI_API_KEY` via `@elizaos/plugin-openai` |
| **Anthropic API key** | Direct `ANTHROPIC_API_KEY` via `@elizaos/plugin-anthropic` |

The installer and headless bootstrap default to Ollama at `http://localhost:11434/api` with `granite4.1:3b` for small/large text routing and `nomic-embed-text:latest` for embeddings. Eliza Cloud remains available through setup and account commands, but Doolittle no longer requires it for day-one inference.

Switch live from the plain shell or the cockpit:

```
/accounts
/accounts connect elizacloud
/accounts use elizacloud
/accounts login elizacloud
/accounts refresh
/accounts refresh codex
/accounts refresh claude-code
/accounts use codex
/accounts use claude-code
```

Provider smoke and packaging:

```bash
bun run smoke:linked-providers
bun run smoke:linked-providers -- --provider elizacloud
bun run smoke:linked-providers -- --provider codex --live
bun run smoke:linked-providers -- --provider claude-code --live
bun run publish:providers:check
```

---

## Plugin inventory

The runtime assembles a wide native ElizaOS stack.

Canonical inventory and capability truth now live in:

- [`docs/plugin-inventory.md`](./docs/plugin-inventory.md)
- [`docs/capability-truth.md`](./docs/capability-truth.md)
- [`docs/operator-wow-contract.md`](./docs/operator-wow-contract.md)

The runtime endpoint remains:

- `GET /runtime/plugins`

| Package | Role |
|---|---|
| `@elizaos/core` | Core runtime, message pipeline, character model, action/provider/evaluator contracts |
| `@elizaos/plugin-ollama` | Official local/self-hosted Ollama provider — default native provider path during onboarding |
| `@elizaos/plugin-openai` | Official OpenAI provider for API-key-backed GPT-family model routing |
| `@elizaos/plugin-anthropic` | Official Anthropic provider for API-key-backed Claude-family model routing |
| `@elizaos/plugin-elizacloud` | Eliza Cloud managed inference — optional managed native provider path |
| `@elizaos/plugin-codex` | Linked-account provider reusing local Codex CLI login state |
| `@elizaos/plugin-claude-code` | Linked-account provider reusing local Claude Code OAuth state |
| `@elizaos/plugin-pdf` | Official PDF service plugin for document extraction |
| `@elizaos/plugin-sql` | Required database adapter for runtime initialization (PGLite) |
| `@elizaos/plugin-telegram` | Official Telegram transport — enabled when `TELEGRAM_BOT_TOKEN` is set |
| `@elizaos/plugin-tts` | Runtime TTS adapter over media generation — reports `ready` / `backend` / `mode` and degrades truthfully when no speech backend is configured |
| `@elizaos/plugin-action-bench` | Action benchmark plugin for coverage sweeps and evaluation drills |
| `@elizaos/plugin-autocoder` | Experimental autocoder plugin for planning, research, repository, and secrets workflows — planning-only flows are explicit and non-mutating |
| `@doolittle/plugin-local-sandbox` | Doolittle local sandbox adapter with E2B-compatible methods for autocoder workflows |
| `@doolittle/plugin-forms` | Doolittle forms adapter for operator intake and structured workflow prompts |
| `@doolittle/plugin-planning` | Doolittle planning adapter for plans, milestones, and coordination |
| `@elizaos/autonomous` | First-party architectural reference for native stack alignment |
| `@elizaos/skills` | First-party skills package for native ElizaOS alignment |
| Doolittle product adapters (`packages/plugins/doolittle-plugin/*`) | Gateway, scheduler, coding-agent, orchestrator, autocoder, action-bench, forms, planning, profile, and local-sandbox adapters |
| `doolittle-runtime` custom plugin | Product layer: gateway/session orchestration, scheduler lifecycle, session search, skill inventory, offline fallback |

---

## CLI command reference

Everything the cockpit can do. Use these from the TUI input or the plain CLI:

**Skills**

- `/skills list`
- `/skills show <slug>`
- `/skills generated list`
- `/skills generated describe <slug>`
- `/skills hub`
- `/skills sync`
- `/skills export`
- `/skills import`
- `/skills install`

**Memory and sessions**

- `/memory list memory`
- `/memory add user <text>`
- `/sessions list`
- `/session summary`
- `/search <query>`

**User and agent profiles**

- `/user profile`
- `/user card`
- `/user beliefs`
- `/user relationship`
- `/user engagement`
- `/user search Bun`
- `/user mode hybrid`
- `/user remember context :: we are shipping the final native experience pass`
- `/agent profile`

**Scheduling**

- `/cron list`
- `/cron create every 2h | name:deploy-review | delivery:home | skills:automation/reports | personality:focused | model:gpt-5.4 :: summarize recent deployment logs`
- `/cron show <job-id>`
- `/cron update <job-id> every 4h | delivery:home | runtime:default :: refresh release notes`
- `/cron runs`

**Model and personality**

- `/personality list`
- `/personality set autonomous`
- `/model status`
- `/model set model gpt-5.4`
- `/config show`
- `/settings`

**Execution**

- `/execution status`
- `/execution backends`
- `/execution bootstrap`
- `/execution preview git status --short`
- `/execution set backend docker`
- `/execution set backend podman`
- `/execution set backend singularity`
- `/execution set backend daytona`
- `/execution set backend modal`

**Tools**

- `/tools list`
- `/tools summary`
- `/tools search browser`
- `/tools transports`

**Browser**

- `/browser status`
- `/browser fetch https://example.com`
- `/browser inspect https://example.com`
- `/browser snapshot https://example.com`
- `/browser screenshot https://example.com`
- `/browser capture https://example.com`
- `/browser analyze https://example.com`
- `/browser compare https://example.com/left :: https://example.com/right`
- `/browser compare analyze https://example.com/left :: https://example.com/right`

**Media**

- `/media transcript ./recordings/daily-sync.wav`
- `/media caption ./artifacts/screenshot.png`
- `/media bundle ./recordings/daily-sync.wav`
- `/media analyze ./recordings/daily-sync.wav`
- `/media voice ./recordings/daily-sync.wav`
- `/media vision ./artifacts/screenshot.png`
- `/media generate a cinematic dusk skyline over the Doolittle workspace`
- `/media speak Doolittle is ready for the next workspace pass.`
- `/media transcribe ./recordings/daily-sync.wav`
- `/media inspect ./packages/characters/doolittle.character.json`

**MCP bridge**

- `/mcp status`
- `/mcp tools`
- `/mcp cached`
- `/mcp cached describe`
- `/mcp cached search echo`
- `/mcp invoke list-tools`
- `/mcp call sum :: {"a":3,"b":4}`

**ACP registry**

- `/acp status`
- `/acp registry`
- `/acp publish`
- `/acp tools`
- `/acp search terminal`
- `/acp call sum :: {"a":3,"b":4}`

**Delegation**

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

**Trajectories**

Training trajectories are exported through the ElizaOS SDK trajectory service only. Doolittle still keeps local debug bundles for replay, analysis, and operator troubleshooting, but those bundles are marked `trainingCompatible:false` and should not be used as model-training data. If `/trajectories export` cannot reach the SDK trajectory service, it fails closed instead of falling back to Doolittle's debug bundle format.

- `/trajectories list`
- `/trajectories export`
- `/trajectories export start:2026-05-01 end:2026-05-14`
- `/trajectories export scenario:memory-smoke batch:local-eval`
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

**Workspace and repository**

- `/workspace tree`
- `/workspace read package.json`
- `/workspace search elizaos`
- `/workspace write notes/todo.txt :: follow up on transport polish`
- `/terminal recent`
- `/terminal run git status --short`
- `/repo status`
- `/repo diff`
- `/repo log`

**Web**

- `/web fetch https://example.com`
- `/web snapshot https://example.com`
- `/web inspect https://example.com`
- `/pdf extract ./path/to/file.pdf`

**Gateway**

- `/gateway start`
- `/gateway config`
- `/gateway state`
- `/gateway runtime`
- `/gateway trace platform:telegram limit:10`
- `/gateway receive telegram user42 room42 :: hello there`
- `/gateway status`
- `/gateway inbox`
- `/gateway outbox`
- `/gateway attachments`
- `/platforms`
- `/sethome`

**Voice**

- `/voice status`
- `/voice on`
- `/voice tts`
- `/voice join`
- `/voice leave`

**Diagnostics and setup**

- `/status`
- `/runtime status`
- `/doctor`
- `/setup checklist`
- `/setup summary`
- `/update preview`
- `/migrate scan`
- `/migrate inspect /path/to/legacy-agent-home`
- `/migrate apply /path/to/legacy-agent-home :: overwrite=true`
- `/context files`

**Pairing and hooks**

- `/pairing pending`
- `/hooks add gateway:startup startup-log :: Gateway started for {{platforms}}`
- `/hooks recent`

**Accounts**

- `/accounts`
- `/accounts connect elizacloud`
- `/accounts use elizacloud`
- `/accounts login elizacloud`
- `/accounts refresh`
- `/accounts refresh codex`
- `/accounts refresh claude-code`
- `/accounts use codex`
- `/accounts use claude-code`

---

## Environment reference

Copy `.env.example` to `.env` and fill in what you need.

### Identity and runtime

| Variable | Purpose | Default |
|---|---|---|
| `DOOLITTLE_NAME` | Runtime agent display name | `Doolittle` |
| `DOOLITTLE_MODE` | `api`, `cli`, or `both` | `both` |
| `DOOLITTLE_HOST` | Host for the Bun API server | `0.0.0.0` |
| `DOOLITTLE_PORT` | Port for the Bun API server | `3000` |
| `DOOLITTLE_DATA_DIR` | Root directory for state, memories, and cron persistence | `.doolittle` |
| `DOOLITTLE_SKILLS_DIR` | Directory scanned recursively for `SKILL.md` files | `./packages/skills` |
| `DOOLITTLE_TIMEZONE` | Default timezone for scheduling context | `America/Chicago` |

### Agentic loop

| Variable | Purpose | Default |
|---|---|---|
| `DOOLITTLE_RUN_DEPTH` | Run depth preset: `quick`, `standard`, `deep`, `explore` | `standard` |
| `DOOLITTLE_MAX_ITERATIONS` | Explicit iteration limit (overrides run depth preset) | Per depth preset |
| `DOOLITTLE_TOOL_PROGRESS` | Tool progress display: `off`, `new`, `all`, `verbose` | `new` |

### Local Ollama

| Variable | Purpose |
|---|---|
| `OLLAMA_API_ENDPOINT` | Ollama API endpoint used by the official ElizaOS Ollama plugin. Default: `http://localhost:11434/api` |
| `OLLAMA_SMALL_MODEL` | Local small-model identifier. Default: `granite4.1:3b` |
| `OLLAMA_LARGE_MODEL` | Local large-model identifier. Default: `granite4.1:3b` |
| `OLLAMA_EMBEDDING_MODEL` | Local embedding-model identifier. Default: `nomic-embed-text:latest` |
| `DOOLITTLE_EMBEDDING_PROVIDER` | Embedding provider selector. Default: `local` |

For the default local path, run `ollama serve`, `ollama pull granite4.1:3b`, and `ollama pull nomic-embed-text:latest` before the first live prompt. `doolittle setup` can change the endpoint or model names later.

### Eliza Cloud

| Variable | Purpose |
|---|---|
| `ELIZAOS_CLOUD_ENABLED` | Turns on Eliza Cloud as the active managed inference provider |
| `ELIZAOS_CLOUD_API_KEY` | Native Eliza Cloud API key (preferred path: `elizaos login`) |
| `ELIZAOS_CLOUD_BASE_URL` | Base URL for Eliza Cloud managed inference |
| `ELIZAOS_CLOUD_SMALL_MODEL` | Default small-model identifier for Eliza Cloud. Current default: `xai/grok-4.1-fast-non-reasoning` |
| `ELIZAOS_CLOUD_LARGE_MODEL` | Default large-model identifier for Eliza Cloud. Current default: `xai/grok-4.1-fast-reasoning` |
| `ELIZAOS_CLOUD_EMBEDDING_MODEL` | Default embedding-model identifier for Eliza Cloud. Current default: `openai/text-embedding-3-small` |
| `ELIZAOS_CLOUD_EMBEDDING_URL` | Optional custom base URL for the Eliza Cloud embeddings endpoint |
| `ELIZAOS_CLOUD_EMBEDDING_API_KEY` | Optional dedicated API key for Eliza Cloud embeddings. Falls back to `ELIZAOS_CLOUD_API_KEY` |
| `ELIZAOS_CLOUD_EMBEDDING_DIMENSIONS` | Optional embedding dimension override for `text-embedding-3` models |

Doolittle uses a stable per-session conversation id with Eliza Cloud so managed xAI-backed runs can benefit from provider-side prompt caching when the upstream supports cached prompt tokens. This path is optional; the default bootstrap path is local Ollama.

### OpenAI

| Variable | Purpose |
|---|---|
| `OPENAI_API_KEY` | API key for the official ElizaOS OpenAI plugin |
| `OPENAI_BASE_URL` | Base URL for the OpenAI-compatible endpoint |
| `OPENAI_MODEL` | Default OpenAI model name |
| `OPENAI_IMAGE_MODEL` | Optional image model for generation |
| `OPENAI_TEMPERATURE` | Default completion temperature |
| `OPENAI_MAX_TOKENS` | Default completion output cap |

### Anthropic

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | API key for the official ElizaOS Anthropic plugin |
| `ANTHROPIC_BASE_URL` | Optional Anthropic-compatible base URL override |
| `ANTHROPIC_SMALL_MODEL` | Default Anthropic small model identifier |
| `ANTHROPIC_LARGE_MODEL` | Default Anthropic large model identifier |

### Other providers

| Variable | Purpose |
|---|---|
| `FAL_API_KEY` | Enables the TTS plugin when set |

### Memory

| Variable | Purpose |
|---|---|
| `DOOLITTLE_MEMORY_CHAR_LIMIT` | Max characters for `MEMORY.md` |
| `DOOLITTLE_USER_CHAR_LIMIT` | Max characters for `USER.md` |
| `DOOLITTLE_SESSION_SEARCH_LIMIT` | Default number of search hits returned by `/search` |

### Scheduling

| Variable | Purpose |
|---|---|
| `DOOLITTLE_CRON_TICK_SECONDS` | Scheduler polling interval |
| `DOOLITTLE_CRON_OUTPUT_DIR` | Output directory for scheduled report exports |

### Gateway and transports

| Variable | Purpose |
|---|---|
| `DOOLITTLE_GATEWAY_DATA_DIR` | Persistent gateway state directory |
| `DOOLITTLE_HOOKS_DIR` | Directory for hook state |
| `DOOLITTLE_WORKSPACE_DIR` | Workspace directory scanned for context files |
| `DOOLITTLE_ALLOW_ALL_USERS` | Global gateway allow-all switch |
| `DOOLITTLE_PAIRING_MODE` | Default pairing mode for remote platforms |
| `TELEGRAM_BOT_TOKEN` | Enables Telegram transport |
| `TELEGRAM_API_ROOT` | Optional Telegram Bot API root override |
| `TELEGRAM_ALLOWED_CHATS` | JSON-encoded Telegram chat allowlist |
| `DISCORD_BOT_TOKEN` | Enables Discord delivery and webhooks |
| `SLACK_WEBHOOK_URL` | Enables Slack outbound delivery |
| `SLACK_SIGNING_SECRET` | Verifies inbound Slack webhook signatures |
| `WHATSAPP_ACCESS_TOKEN` | Enables WhatsApp Graph API delivery |
| `WHATSAPP_PHONE_NUMBER_ID` | Target sender identity for WhatsApp |
| `WHATSAPP_VERIFY_TOKEN` | Verifies WhatsApp webhook handshakes |
| `SIGNAL_CLI_COMMAND` | Local command for Signal delivery |
| `MATRIX_HOMESERVER` | Matrix homeserver base URL |
| `MATRIX_ACCESS_TOKEN` | Matrix access token for room messaging |
| `EMAIL_SEND_COMMAND` | Local command for email delivery |
| `SMS_SEND_COMMAND` | Local command for SMS delivery |

### Browser

| Variable | Purpose |
|---|---|
| `DOOLITTLE_BROWSER_PROVIDER` | Browser backend: `lightpanda` (default) or `basic` |
| `DOOLITTLE_BROWSER_COMMAND` | Local Lightpanda command |
| `DOOLITTLE_BROWSER_CDP_URL` | Optional CDP endpoint for deeper automation |
| `DOOLITTLE_BROWSER_OBEY_ROBOTS` | Enables robot-policy aware fetching |

### Execution backends

| Variable | Purpose |
|---|---|
| `DOOLITTLE_EXECUTION_COMMAND_TIMEOUT_MS` | Default command timeout |
| `DOOLITTLE_EXECUTION_HEALTH_TIMEOUT_MS` | Backend health probe timeout |
| `DOOLITTLE_CONTAINER_CPU_LIMIT` | CPU limit for Docker/Podman containers |
| `DOOLITTLE_CONTAINER_MEMORY_LIMIT` | Memory limit for Docker/Podman containers |
| `DOOLITTLE_CONTAINER_PIDS_LIMIT` | PIDs limit for Docker/Podman containers |
| `DOOLITTLE_CONTAINER_READ_ONLY_ROOT` | Read-only container root with tmpfs for `/tmp` and `/run` |
| `DOOLITTLE_DOCKER_IMAGE` | Container image for Docker/Podman |
| `DOOLITTLE_DOCKER_NETWORK` | Container network mode |
| `DOOLITTLE_DOCKER_WORKSPACE_PATH` | Mount path inside containers |
| `DOOLITTLE_DOCKER_ENV_PASSTHROUGH` | Comma-separated env vars forwarded into containers |
| `DOOLITTLE_SINGULARITY_IMAGE` | Local SIF path or remote image for Singularity |
| `DOOLITTLE_SSH_HOST` | Remote SSH host |
| `DOOLITTLE_SSH_USER` | Remote SSH user |
| `DOOLITTLE_SSH_PATH` | Remote workspace path |
| `DOOLITTLE_SSH_PORT` | SSH port |
| `DOOLITTLE_SSH_KEY_PATH` | Optional SSH private key |
| `DOOLITTLE_SSH_STRICT_HOST_KEY_CHECKING` | Strict host verification |

### Daytona

| Variable | Purpose |
|---|---|
| `DOOLITTLE_DAYTONA_TARGET` | Target sandbox or workspace |
| `DOOLITTLE_DAYTONA_COMMAND` | Optional CLI command override |
| `DOOLITTLE_DAYTONA_SHELL` | Shell inside sandboxes |
| `DOOLITTLE_DAYTONA_WORKSPACE_PATH` | Remote workspace path |
| `DOOLITTLE_DAYTONA_SNAPSHOT` | Optional snapshot anchor |
| `DOOLITTLE_DAYTONA_BOOTSTRAP_COMMAND` | Optional pre-command bootstrap |
| `DOOLITTLE_DAYTONA_STATUS_COMMAND` | Optional status command |
| `DOOLITTLE_DAYTONA_INSPECT_COMMAND` | Optional inspect command override |

### Modal

| Variable | Purpose |
|---|---|
| `DOOLITTLE_MODAL_TARGET` | Target sandbox or environment |
| `DOOLITTLE_MODAL_COMMAND` | Optional CLI command override |
| `DOOLITTLE_MODAL_SHELL` | Shell inside sandboxes |
| `DOOLITTLE_MODAL_WORKSPACE_PATH` | Remote workspace path |
| `DOOLITTLE_MODAL_ENVIRONMENT` | Optional environment name |
| `DOOLITTLE_MODAL_BOOTSTRAP_COMMAND` | Optional pre-command bootstrap |
| `DOOLITTLE_MODAL_STATUS_COMMAND` | Optional status command |
| `DOOLITTLE_MODAL_INSPECT_COMMAND` | Optional inspect command override |

### Remote sync

| Variable | Purpose |
|---|---|
| `DOOLITTLE_REMOTE_SYNC_MODE` | `mirror` or `snapshot` |
| `DOOLITTLE_REMOTE_SYNC_INCLUDE` | Comma-separated workspace paths to sync |
| `DOOLITTLE_REMOTE_SYNC_EXCLUDE` | Comma-separated paths excluded from sync |
| `DOOLITTLE_REMOTE_ARTIFACT_PATHS` | Comma-separated remote artifact paths |
| `DOOLITTLE_REMOTE_ARTIFACT_POLICY` | `metadata-only` or `allowlisted` |
| `DOOLITTLE_REMOTE_WORKSPACE_LABEL` | Human-readable label for remote sessions |

### MCP / ACP

| Variable | Purpose |
|---|---|
| `MCP_SERVER_COMMAND` | Local MCP server command |
| `MCP_TIMEOUT_MS` | MCP operation timeout |
| `ACP_SERVER_COMMAND` | Local ACP server command |
| `ACP_TIMEOUT_MS` | ACP operation timeout |

---

## Architecture

```text
doolittle/
├── package.json                    # bin: packages/agent/src/index.ts
├── scripts/
│   ├── install.sh                  # First-contact installer
│   └── bootstrap.ts                # Onboarding wizard
├── packages/
│   ├── agent/src/
│   │   ├── index.ts                # #!/usr/bin/env bun — the only entry point
│   │   ├── cli.ts                  # Blessed TUI + plain CLI
│   │   ├── cli/splash.ts           # ANSI truecolor boot splash
│   │   ├── cli/startup.ts          # Pre-boot env, onboarding checks
│   │   ├── server.ts               # Bun HTTP API
│   │   ├── config/env.ts           # Zod-validated env schema
│   │   ├── character.ts            # Character model integration
│   │   ├── runtime/
│   │   │   ├── bootstrap.ts        # ElizaOS AgentRuntime assembly
│   │   │   ├── chat.ts             # Agent turn handler + agentic loop bridge
│   │   │   └── native/
│   │   │       ├── plugin-registry/    # Declarative native plugin assembly
│   │   │       ├── plugin-catalog/     # Native plugin inventory
│   │   │       └── package-audit.ts    # Ecosystem and package audit views
│   │   ├── services/               # 35+ service modules
│   │   ├── evaluators/             # Memory nudge, context evaluators
│   │   ├── providers/              # Context providers
│   │   └── gateway/                # Multi-platform gateway runner
│   ├── plugins/                    # ElizaOS plugins (local + vendored)
│   │   ├── doolittle-plugin.ts   # Product-layer custom plugin
│   │   ├── plugin-action-bench/
│   │   ├── plugin-agent-orchestrator/
│   │   ├── doolittle-plugin/
│   │   ├── plugin-claude-code/
│   │   ├── plugin-codex/
│   │   ├── plugin-devin/
│   │   ├── plugin-elizacloud/
│   │   └── plugin-sql/
│   ├── skills/                     # Curated skill docs (20 categories)
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
│   ├── skill-packs-optional/       # Broader optional skill packs
│   ├── characters/                 # Character definitions
│   │   └── doolittle.character.json
│   ├── acp/                        # Agent Communication Protocol
│   ├── modeling/                   # Persona-alignment assets
│   ├── benchmarks/                 # Evaluation scaffolding
│   ├── distributions/              # Release-channel metadata
│   └── integrations/               # Integration support assets
├── docs/
│   ├── eliza-maximization-matrix.md
│   ├── elizaos-research.md
│   ├── monorepo.md
│   ├── native-experience-ledger.md
│   └── skills-hub.md
├── biome.json
├── tsconfig.json
```

No `bin/` directory. No bash wrapper. The `package.json` points `"bin"` directly at the TypeScript entry point — Bun runs it natively.

Detailed workspace notes live in [`docs/monorepo.md`](./docs/monorepo.md). Native-adoption priorities live in [`docs/eliza-maximization-matrix.md`](./docs/eliza-maximization-matrix.md).

---

## Development

### Workspace commands

```bash
bun run check                # full workspace quality pass
bun run lint:check           # Biome lint
bun run typecheck            # TypeScript type check
bun test                     # all tests (bun:test)
bun run build                # build
bun run bootstrap            # re-run workspace bootstrap
bun run bootstrap:check      # non-mutating check
bun run workspace:list       # list workspaces
```

### Testing

Tests use `bun:test` throughout — unit tests, service tests, and installer smoke tests all in one runner:

```bash
bun test                                           # everything
bun test packages/agent/src/installer-cli.test.ts  # installer smoke tests
bun test packages/agent/src/services/              # service unit tests
```

### Provider packaging

```bash
bun run smoke:linked-providers                              # validate all providers
bun run smoke:linked-providers -- --provider codex --live   # live request test
bun run publish:providers:check                             # verify publish readiness
bun run publish:providers -- --provider all                 # publish all
bun run publish:providers:alpha                             # publish to alpha tag
```

---

## Versioning

Tracks the ElizaOS 2.0 **beta** line (the actively-maintained channel):

- `elizaos: "2.0.0-beta.5"` — umbrella package
- `@elizaos/core: "2.0.0-beta.1"` — core runtime
- `@elizaos/agent: "2.0.0-beta.2"`, `@elizaos/skills: "2.0.0-beta.1"`
- `@elizaos/plugin-{ollama,openai,anthropic,pdf,telegram,sql}: "2.0.0-beta.1"` — provider/feature plugins
- `@elizaos/autonomous: "2.0.0-alpha.85"` — no beta published yet; pinned to alpha and forced onto beta `@elizaos/core` via `overrides` so a single core instance is shared

The vendored `@elizaos/plugin-sql` carries a local `bun patch`
(`patches/@elizaos%2Fplugin-sql@2.0.0-beta.1.patch`) that fixes a broken `bun`
export condition in the published beta.1 package.

Features not covered by official ElizaOS packages are implemented as custom actions, providers, evaluators, and Bun-native services. Official packages not yet compatible on the current runtime line are vendored under `packages/plugins/*` and implemented directly against the current `@elizaos/core` beta service model.

---

> Once the shell is open, try: *summarize this repo and tell me where to start*
>
> Or run a shell action directly: *!git status*
