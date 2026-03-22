# @elizaos/plugin-codex

Native-first ElizaOS provider plugin for using a locally signed-in Codex account.

## What It Does

- Detects reusable Codex credentials from `~/.codex/auth.json`
- Exposes Codex-linked provider state to the Eliza runtime
- Routes text generation through the Codex Responses endpoint
- Handles Codex streaming responses and normalizes them into plain provider output
- Refreshes expired linked credentials automatically when possible
- Pairs cleanly with the Eliza Agent `connect` flow for one-step activation

## Expected Local Login State

This plugin expects the user to already be signed in through the local Codex CLI.

Credential source:

- `~/.codex/auth.json`

## Runtime Behavior

- Provider id: `codex`
- Default model: `gpt-5.3-codex`
- Default base URL: `https://chatgpt.com/backend-api/codex`

## Operator Flows

- `/accounts connect codex`
- `/accounts`
- `/accounts doctor`
- `/accounts login codex`
- `/accounts refresh codex`
- `/accounts use codex`

## Example

```ts
import { createCodexPlugin } from "@elizaos/plugin-codex";

export const codexPlugin = createCodexPlugin({
  enabled: true,
  getStatus: () => ({
    provider: "codex",
    available: true,
    reusable: true,
    nativeReady: true,
    fallbackReady: false,
    authMode: "chatgpt",
    source: "~/.codex/auth.json",
    detail: "Linked Codex account detected.",
  }),
  getCredentials: () => ({ accessToken: "..." }),
});
```

## Verification

From the repo root:

```bash
bun run smoke:linked-providers -- --provider codex
bun run smoke:linked-providers -- --provider codex --live
```

The live smoke path was verified in this workspace against a locally signed-in Codex account and returned `LINKED_PROVIDER_OK`.

## Notes

This package is intended for the Eliza Agent alpha-native workspace and is designed for linked-account flows rather than API-key-only OpenAI usage.
