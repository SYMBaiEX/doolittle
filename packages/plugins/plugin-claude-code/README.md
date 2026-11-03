# @doolittle/plugin-claude-code

Structured local Claude CLI fallback behind the official Eliza Anthropic
provider. Normal linked OAuth inference, account rotation, Messages API
transport, tools, streaming, and prompt caching belong to
`@elizaos/plugin-anthropic`.

## Integration

The [package root](src/index.ts) exports `createClaudeCodePlugin`,
`resolveClaudeCliModel`, `invokeClaudeCodeCliPrint`, and the live-generation
parameter type. The host supplies the account-status callback and can supply
credential refresh and CLI invocation ports.

The host selects the CLI route and supplies account readiness. Generation
requires `allowCliFallback` and rejects a different active provider; see the
[generation boundary](src/anthropic.ts). The bridge converts a single
required response schema to structured CLI output and suppresses a nested
CLI tool/agent loop. It does not implement OAuth or the Anthropic API.

Doolittle wires this plugin through its
[provider registry](../../agent/src/runtime/native/plugin-registry/providers.ts).
Provider identity is `claude-code`; native OAuth inference uses the SDK's
`anthropic` owner. Keep credentials in the provider's account store and return
only status projections to clients.

## Develop and verify

From the repository root:

```sh
nub run --cwd packages/plugins/plugin-claude-code typecheck
nub run test:scope tests/boundary/provider-command.test.ts
nub run smoke:linked-providers -- --provider claude-code
nub run publish:claude-code:dry-run
```

The smoke command inspects readiness without inference by default. Add `--live`
only when you intend to use the existing local authentication for a provider
round trip; it may consume model quota. A dry run validates publishing contracts
without publishing a package. See [testing](../../../docs/testing.md) and
[releases](../../../docs/releases.md).
