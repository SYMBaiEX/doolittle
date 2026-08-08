# @doolittle/plugin-claude-code

Doolittle-owned ElizaOS provider bridge for using a locally signed-in Claude Code account.

## What It Does

- Detects reusable Claude Code OAuth credentials from local CLI stores
- Exposes Claude Code-linked provider state to the Eliza runtime
- Routes text generation through the Anthropic Messages API with Claude Code headers
- Refreshes expired linked OAuth credentials automatically when possible
- Supports the Doolittle `connect` flow so native auth is the default path
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
import { createClaudeCodePlugin } from "@doolittle/plugin-claude-code";

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
nub run smoke:linked-providers -- --provider claude-code
nub run smoke:linked-providers -- --provider claude-code --live
```

The live smoke command succeeds only when a reusable local Claude Code login is
available and returns `LINKED_PROVIDER_OK` when the provider round trip passes.

## Notes

This package is intended for the Doolittle alpha-native workspace and is designed for linked-account flows rather than API-key-only Anthropic usage.
