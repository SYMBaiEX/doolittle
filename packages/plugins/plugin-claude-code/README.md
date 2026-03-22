# @elizaos/plugin-claude-code

Workspace-native ElizaOS provider plugin for using a locally signed-in Claude Code account.

## What It Does

- Detects reusable Claude Code OAuth credentials from local CLI stores
- Exposes Claude Code-linked provider state to the Eliza runtime
- Routes text generation through the Anthropic Messages API with Claude Code headers
- Refreshes expired linked OAuth credentials automatically when possible

## Expected Local Login State

This plugin expects the user to already be signed in through the local Claude Code CLI.

Credential sources:

- `~/.claude/.credentials.json`
- `~/.claude.json`

## Runtime Behavior

- Provider id: `claude-code`
- Default model: `claude-sonnet-4-20250514`
- Default base URL: `https://api.anthropic.com`

## Operator Flows

- `/accounts`
- `/accounts refresh claude-code`
- `/accounts use claude-code`

## Notes

This package is intended for the Eliza Agent alpha-native workspace and is designed for linked-account flows rather than API-key-only Anthropic usage.
