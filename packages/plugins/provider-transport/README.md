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
applies Eliza core's environment policy, and terminates the POSIX process group
or Windows process tree on a deadline, caller cancellation, or excessive output.
The combined stdout/stderr budget defaults to 8 MiB (`maxOutputBytes` can select
1 byte through 64 MiB). Overflow returns exit code 125 and `output_limit`, never
successful truncated output. The bounded diagnostic can add up to 256 bytes to
the captured output budget.

Windows termination uses the system `taskkill.exe` with `/T /F` and a five-second
termination deadline. Its executable is selected from fixed `Windows/System32`
locations on local drives, rather than executing an environment-supplied path.
Nonstandard Windows system directories fail explicitly. Failed tree termination is reported as `termination_error`
(exit code 126), or rejects cancellation explicitly. Retained descendant pipes
cannot keep the request pending indefinitely; failure is not reported as a
successful cancellation.
