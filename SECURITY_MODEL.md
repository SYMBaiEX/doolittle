# Security Model


## System overview

Doolittle is a desktop (Electron) and CLI client for ElizaOS: a local-first agent harness that lets a model-driven agent run tools, shell commands, file operations and network actions on the user's machine. Conversation transcripts and trajectories live in a local data directory (SQLite / PGlite). Plugins, skills and MCP servers extend the runtime at the user's permission level.

## Trust boundaries

- Renderer ↔ Electron main: context-isolated preload transport; host validates sender, route, bot, conversation, workspace and action authority. No generic fs/shell/network through preload.
- Network ↔ API: HTTP API binds 127.0.0.1 by default; non-loopback requires `ELIZA_API_TOKEN` (bearer). Terminal/PTY mutation routes additionally require `X-Eliza-Terminal-Token`. Timing-safe auth, DNS-rebinding host checks, origin allowlist.
- Untrusted content ↔ model: chat messages, context files, tool results, MCP results, delegated agent output; context-files service passes through the prompt-injection scanner (heuristic, not a guarantee).
- Model ↔ privileged execution: execution-approval layer (`services/execution-approval`, `process-execution`) gates commands/processes/file writes/tool calls; workspace grants enforced at the effect boundary (`tests/boundary`).
- Untrusted code ↔ runtime: skills (native-loader, official-loader, skill-synthesis), plugins (packages/plugins), MCP servers (services/mcp) execute with the current user's permissions.

## Components

- **Desktop** — `apps/desktop`: Electron main process (IPC handlers, bot-process registry, execution admission, workspace grants), preload, renderer.
- **CLI** — `apps/cli`: terminal chat, cockpit, process entrypoints and commands.
- **AgentRuntime / API** — `packages/agent` server + gateway: HTTP routes, authorization, transport/platform adapters, message normalization, gateway pairing.
- **Execution layer** — `services/execution-approval`, `process-execution`, `terminal`, `native-tools`, `run-controller`, `delegation`, `autocoder-pipeline`, `acp`.
- **Extensibility** — `services/skills`, `skill-synthesis`, `skills-hub`, `mcp`, `packages/plugins`, `packages/skills`.
- **Storage & state** — `packages/storage`, session/trajectory stores, `.doolittle/` data dir, settings-service secrets, `packages/solana-layouts` (wallet/private keys).
- **Desktop host orchestration** — `apps/desktop/src/main` (also its own trust boundary; grouped under Desktop for finding tags).

## Entry points and who can reach them

- Local user via desktop renderer and CLI (primary path).
- Loopback HTTP clients — trusted local terminal access.
- Remote HTTP clients — only when the operator sets a non-loopback bind + `ELIZA_API_TOKEN`; terminal mutation additionally needs the terminal token.
- Untrusted content arriving through chat, context files, web/media fetches, MCP results and delegated workers.

## Assets and sensitivity

- Provider credentials / API keys in `.env`, `.doolittle/`, settings-service secrets — sensitive; never in prompts, logs, outbound adapters or diagnostics.
- Wallet / private keys (`packages/solana-layouts`) — highest sensitivity.
- Workspace files and the local data directory — readable by same-account local processes; treated as sensitive.
- Transcripts and trajectories (SQLite/PGlite) — private conversation content.

## Attacker profiles that matter

- **Prompt-injection adversary**: content the agent reads steers it into privileged tool calls; the key question is whether an approval gate sits on the path.
- **Unauthenticated/remote attacker**: relevant only when the operator exposes the API non-loopback; bypasses of token/terminal-token auth, pairing-token weaknesses, DNS rebinding.
- **Malicious local renderer/dependency**: renderer compromises or supply-chain code attempting IPC abuse, preload escape, or secret exfiltration.
- **Malicious installed component**: rogue skill/plugin/MCP server executing with user permissions — the product's accepted-risk surface to some degree.

## Existing controls

- Execution-approval layer + execution leases/admission tokens.
- Loopback default bind, bearer token, terminal-run token, timing-safe auth, host/origin checks, 20 MiB body cap.
- Prompt-injection scanner on context files.
- Canonical-path workspace grants at the effect boundary (`tests/boundary`).
- Boundary checks: `check:plugin-boundaries`, `check:repo-hygiene`, `check:workflow-security`, `check:eliza-sdk`, dependency audits.

## Out of scope / accepted risk (awaiting user confirmation)

- Local-first design assumes the user's own account is not hostile; same-account local processes can read the data dir.
- Plugins/tools execute code with the current user's permissions — inherent to the product.
- Prompt-injection scanner is a heuristic, not a guarantee.

## Open questions

- Are remote (non-loopback) deployments a scenario to defend, or is local-only the assumed posture?
- Which assets rank highest if findings compete (credentials vs. workspace integrity vs. wallet keys)?
- Any attacker/asset/surface the user explicitly accepts as risk?
