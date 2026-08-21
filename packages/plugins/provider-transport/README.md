# @doolittle/provider-transport

Shared transport helpers for ElizaOS provider plugins that ultimately accept a
plain-text prompt.

The adapter preserves the native `GenerateTextParams` contract for as long as
possible, delegates chat rendering to `@elizaos/core`, and only down-converts
attachments and tool selection when the destination transport cannot accept
them natively.

```ts
import {
  getRuntimeModelSettings,
  getRuntimeProvider,
  resolveModelPromptText,
} from "@doolittle/provider-transport";

const prompt = resolveModelPromptText(params);
const provider = getRuntimeProvider(runtime);
const model = getRuntimeModelSettings(runtime);
```

Provider CLIs can use the package's narrow Node command runner without pulling
the full Eliza agent package into their published dependency graph:

```ts
import { runProviderCommand } from "@doolittle/provider-transport";

const result = await runProviderCommand({
  command: "provider-cli",
  args: ["--print", prompt],
  timeoutMs: 120_000,
  signal,
});
```

The runner does not invoke a shell. It preserves stdout and stderr separately,
applies Eliza core's environment policy, and terminates the process group on a
deadline or caller cancellation.
