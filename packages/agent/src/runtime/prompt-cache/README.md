# Doolittle prompt caching

Shared prompt construction for model calls owned by Doolittle. Ordinary chat
uses the SDK message lifecycle and its cache policy. Direct Doolittle calls use
this module so stable and volatile content have one consistent contract.

## Build a prompt

Internal callers import [`index.ts`](index.ts):

```ts
import { buildCacheablePrompt, promptCacheMetrics } from "./prompt-cache/index";

const plan = buildCacheablePrompt({
  stableBlocks: ["Reusable product instructions."],
  volatile: currentQuestion,
  provider: settings.model.provider,
  model: settings.model.model,
  versionDigest: "my-product-prompt-v1",
});
promptCacheMetrics.recordPlan(plan.stats);
```

Pass `plan.prompt` and any supported `plan.promptSegments` and
`plan.providerOptions` to the model API. The builder keeps the plain prompt
identical to the concatenated segments. APIs such as structured research may
accept only the plain prompt; the shared construction and plan telemetry still
apply.

Stable blocks are reusable product instructions. User input, credentials, fresh
memory, timestamps, and per-request data stay volatile. If a caller supplies an
entire prompt without a reliable stable split, use no stable blocks.

## Policy and keys

[`provider-policy.ts`](provider-policy.ts) classifies current handlers:

| Mode | Provider family | Output |
| --- | --- | --- |
| Explicit | Anthropic/linked Claude OAuth, OpenAI | Stable segments and supported provider options. |
| Implicit | Ollama/local | Unchanged plain prompt; the provider may reuse prefix state. |
| None | Codex, Eliza Cloud, unknown | Unchanged plain prompt without cache hints. |

Explicit Claude CLI fallback receives the same plain prompt and ignores native
cache hints. Cache eligibility is not proof that a provider used its cache.

Keys depend on the template version, supplied version digest, provider, model,
and stable block content. Bump the template or caller version when changing
prompt construction semantics. Volatile text does not enter the cache key.
See [`cacheable-prompt.ts`](cacheable-prompt.ts) and [`digest.ts`](digest.ts).

## Consumers and verification

Current consumers include direct model analysis, automation, research, and coding
delegation. Their call sites choose which model parameters are supported; do not
add a parallel prompt path inside the SDK message lifecycle.

[`metrics.ts`](metrics.ts) records construction plans and can accept explicit
provider usage samples. No current runtime caller feeds `recordUsage`; plan
counts alone do not establish cache hits or token savings.

After changing the module, run the consuming agent typecheck and relevant caller
tests from the repository root:

```sh
nub run --cwd packages/agent typecheck
nub run test:related packages/agent/src/runtime/prompt-cache/cacheable-prompt.ts
```

Select explicit caller tests when related discovery finds no matching case;
see [testing](../../../../../docs/testing.md).
