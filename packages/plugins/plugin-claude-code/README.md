# @doolittle/plugin-claude-code

Doolittle's narrow structured local-CLI fallback behind the official Eliza
Anthropic provider.

## What It Does

- Exposes linked Claude Code status to Doolittle's operator surfaces
- Converts Eliza's single required response schema to Claude CLI structured output
- Prevents the CLI from starting a second nested tool/agent loop
- Runs only when explicit CLI fallback is enabled and reusable OAuth is absent

Official `@elizaos/plugin-anthropic` owns OAuth inference, credential/account
rotation, Messages API transport, tools, response handling, streaming, and
prompt caching.

## Expected Local Login State

This plugin expects the user to already be signed in through the local Claude Code CLI.

Credential sources:

- `~/.claude/.credentials.json`
- `~/.claude.json`

## Runtime Behavior

- Product provider id: `claude-code`
- Runtime model owner with OAuth: `anthropic`
- Runtime fallback owner without OAuth: `@doolittle/plugin-claude-code`
- Default model: `claude-sonnet-4.6`

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
    reusable: false,
    fallbackReady: true,
    authMode: "claude.ai",
    source: "claude status",
    detail: "Claude CLI is signed in.",
  }),
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

This package is not an OAuth or Anthropic API implementation. Remove it once
the official plugin's CLI mode supports native messages/tools/response schemas.
