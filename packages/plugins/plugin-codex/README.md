# @elizaos/plugin-codex

Workspace-native ElizaOS provider plugin for using a locally signed-in Codex account.

## What It Does

- Detects reusable Codex credentials from `~/.codex/auth.json`
- Exposes Codex-linked provider state to the Eliza runtime
- Routes text generation through the Codex Responses endpoint
- Refreshes expired linked credentials automatically when possible

## Expected Local Login State

This plugin expects the user to already be signed in through the local Codex CLI.

Credential source:

- `~/.codex/auth.json`

## Runtime Behavior

- Provider id: `codex`
- Default model: `gpt-5.3-codex`
- Default base URL: `https://chatgpt.com/backend-api/codex`

## Operator Flows

- `/accounts`
- `/accounts refresh codex`
- `/accounts use codex`

## Notes

This package is intended for the Eliza Agent alpha-native workspace and is designed for linked-account flows rather than API-key-only OpenAI usage.
