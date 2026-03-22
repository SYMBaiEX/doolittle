# Plugin Workspace

This workspace contains both product-native Eliza Agent plugins and vendored official ElizaOS plugin packages updated locally for the current runtime line.

## Purpose

- preserve official package names where possible
- keep upstream adjustments close to the package boundary
- avoid scattering runtime-line changes across the product code in `packages/agent/src/`
- keep all plugin-shaped code under `packages/plugins/*` so the monorepo stays coherent

## Workspace contents

- `eliza-agent-plugin.ts`
- `plugin-agent-orchestrator`
- `plugin-agent-skills`
- `plugin-autocoder`
- `plugin-coding-agent`
- `plugin-codex`
- `plugin-claude-code`
- `plugin-cron`
- `plugin-browser`
- `plugin-action-bench`
- `plugin-discord`
- `plugin-e2b`
- `plugin-experience`
- `plugin-forms`
- `plugin-knowledge`
- `plugin-local-embedding`
- `plugin-mcp`
- `plugin-personality`
- `plugin-planning`
- `plugin-plugin-manager`
- `plugin-rolodex`
- `plugin-shell`
- `plugin-tts`
- `plugin-trajectory-logger`

## Working rule

If a behavior is specific to Eliza Agent as a product, keep it in `packages/agent/src/` or `packages/plugins/eliza-agent-plugin.ts`. If the change is purely about making an official ElizaOS package work on the current runtime line, keep it under the vendored plugin directories here.

## Linked providers

Two workspace plugins are intentionally user-facing provider bridges rather than hidden internals:

- `plugin-codex`
- `plugin-claude-code`

They are designed for people who already use local Codex or Claude Code CLIs and want Eliza Agent to reuse those signed-in accounts directly.

Suggested runtime flow:

- `/accounts connect codex`
- `/accounts connect claude-code`
- `/accounts doctor`
- `/accounts use codex`
- `/accounts use claude-code`

Publish-ready provider references:

- [`plugin-codex`](./plugin-codex)
- [`plugin-claude-code`](./plugin-claude-code)
