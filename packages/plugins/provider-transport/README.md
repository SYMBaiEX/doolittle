# @elizaos/provider-transport

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
} from "@elizaos/provider-transport";

const prompt = resolveModelPromptText(params);
const provider = getRuntimeProvider(runtime);
const model = getRuntimeModelSettings(runtime);
```
