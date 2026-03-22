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
- `plugin-coding-agent`
- `plugin-cron`
- `plugin-browser`
- `plugin-action-bench`
- `plugin-discord`
- `plugin-experience`
- `plugin-forms`
- `plugin-knowledge`
- `plugin-local-embedding`
- `plugin-mcp`
- `plugin-personality`
- `plugin-plugin-manager`
- `plugin-rolodex`
- `plugin-shell`
- `plugin-tts`
- `plugin-trajectory-logger`

## Working rule

If a behavior is specific to Eliza Agent as a product, keep it in `packages/agent/src/` or `packages/plugins/eliza-agent-plugin.ts`. If the change is purely about making an official ElizaOS package work on the current runtime line, keep it under the vendored plugin directories here.
