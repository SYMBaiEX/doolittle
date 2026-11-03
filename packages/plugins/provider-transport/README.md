# @doolittle/provider-transport

Shared helpers for ElizaOS providers whose destination accepts a plain-text
prompt. This is the compatibility boundary for input conversion, subprocess
execution, and structured transport failures; native providers should consume
the SDK's messages, attachments, and tools directly.

## API

Import helpers from the [package root](src/index.ts):

```ts
import {
  resolveModelPromptText,
  runProviderCommand,
} from "@doolittle/provider-transport";

const prompt = resolveModelPromptText(params);
const result = await runProviderCommand({
  command: "provider-cli",
  args: ["--print", prompt],
  timeoutMs: 120_000,
  signal,
});
```

`resolveModelPromptText` preserves prompt-segment text, falls back to the prompt
or SDK-rendered messages, and appends the applicable text-transport tool
contract. Model-setting readers consume Doolittle's `runtimeSettings` envelope.
The root also exports full text-model handler registration helpers and the
`ProviderTransportError` normalization and HTTP-status helpers.

## Implementation

The public root stays stable while implementation is grouped by responsibility:

- [runtime-settings.ts](src/runtime-settings.ts) reads the model settings envelope.
- [prompt.ts](src/prompt.ts) adapts messages and tool contracts to plain text.
- [text-models.ts](src/text-models.ts) registers the SDK text-generation surface.
- [errors.ts](src/errors.ts) carries structured failures and recovery metadata.
- [command.ts](src/command.ts) owns subprocess execution and termination.

Consumers should keep importing the package root rather than these private paths.

## Process boundary

The [command runner](src/command.ts) uses literal argv without a shell, keeps
stdout and stderr separate, and sanitizes supplied environment overrides with
the SDK policy. It bounds
execution and combined output, propagates cancellation, and terminates the
POSIX process group or Windows process tree.

The default output budget is 8 MiB; callers can select 1 byte through 64 MiB.
Overflow reports `output_limit` with exit code 125. Windows uses a fixed system
`taskkill.exe` location with a bounded termination deadline. Failed tree
termination reports `termination_error` with exit code 126, or explicitly rejects
cancellation. Consumers must preserve these failures rather than treating
partial output or an uncertain termination as success.

## Develop

From the repository root:

```sh
nub run --cwd packages/plugins/provider-transport typecheck
nub run test:scope tests/boundary/provider-command.test.ts
nub run publish:provider-transport:dry-run
```

Source is exported directly; provider publication builds and verifies its staged
artifact through the root publishing script. See
[releases](../../../docs/releases.md) for distribution and
[architecture](../../../docs/architecture.md) for dependency ownership.
