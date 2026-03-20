# Vendored Official Packages

This workspace folder contains vendored official-compatible ElizaOS packages that were patched locally for the current Eliza Agent runtime line.

## Purpose

- preserve official package names where possible
- keep compatibility fixes close to the upstream package boundary
- avoid scattering runtime-line shims across the product code in `src/`

## Packages here

- `compat`
- `plugin-agent-orchestrator`
- `plugin-agent-skills`
- `plugin-coding-agent`
- `plugin-cron`
- `plugin-discord`
- `plugin-experience`
- `plugin-knowledge`
- `plugin-local-embedding`
- `plugin-personality`
- `plugin-plugin-manager`
- `plugin-rolodex`
- `plugin-shell`
- `plugin-trajectory-logger`

## Working rule

If a behavior is specific to Eliza Agent as a product, keep it in the root application package. If the change is purely about making an official ElizaOS package work on the current runtime line, keep it here.
