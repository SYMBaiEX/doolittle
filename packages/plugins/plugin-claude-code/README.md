# @elizaos/plugin-claude-code

Native-first ElizaOS provider plugin for using a locally signed-in Claude Code account.

## What It Does

- Detects reusable Claude Code OAuth credentials from local CLI stores
- Exposes Claude Code-linked provider state to the Eliza runtime
- Routes text generation through the Anthropic Messages API with Claude Code headers
- Refreshes expired linked OAuth credentials automatically when possible
- Supports the Eliza Agent `connect` flow so native auth is the default path
- Keeps local Claude CLI fallback available only as an explicit escape hatch

## Expected Local Login State

This plugin expects the user to already be signed in through the local Claude Code CLI.

Credential sources:

- `~/.claude/.credentials.json`
- `~/.claude.json`

## Runtime Behavior

- Provider id: `claude-code`
- Default model: `claude-sonnet-4.6`
- Default base URL: `https://api.anthropic.com`

## Operator Flows

- `/accounts connect claude-code`
- `/accounts`
- `/accounts doctor`
- `/accounts login claude-code`
- `/accounts setup-token claude-code`
- `/accounts refresh claude-code`
- `/accounts use claude-code`

## Example

```ts
import { createClaudeCodePlugin } from "@elizaos/plugin-claude-code";

export const claudeCodePlugin = createClaudeCodePlugin({
  enabled: true,
  allowCliFallback: false,
  getStatus: () => ({
    provider: "claude-code",
    available: true,
    reusable: true,
    nativeReady: true,
    fallbackReady: false,
    authMode: "oauth",
    source: "~/.claude/.credentials.json",
    detail: "Linked Claude Code account detected.",
  }),
  getCredentials: () => ({ accessToken: "..." }),
});
```

## Verification

From the repo root:

```bash
bun run smoke:linked-providers -- --provider claude-code
bun run smoke:linked-providers -- --provider claude-code --live
```

The live smoke path was verified in this workspace against a locally signed-in Claude Code account and returned `LINKED_PROVIDER_OK`.

## Notes

This package is intended for the Eliza Agent alpha-native workspace and is designed for linked-account flows rather than API-key-only Anthropic usage.
