# Doolittle prompt caching

Provider-aware prompt caching for the prompts **Doolittle itself owns** — i.e.
the direct `runtime.useModel` calls Doolittle makes outside the ElizaOS SDK
message pipeline.

## TL;DR

- The **SDK already caches** everything routed through `runtime.messageService.handleMessage`
  (the action / evaluator / planner path). `@elizaos/core` builds `promptSegments`
  and a full provider cache plan there. **Do not reimplement that.**
- Normal chat turns no longer contain a Doolittle-owned `useModel` fast path.
  They enter the SDK message service, so its cache plan is authoritative.
- This module remains the shared abstraction for non-chat prompts Doolittle
  owns. The deep-research action uses it for a stable research contract plus a
  volatile question; there is intentionally no normal-chat integration point.

## Where it lives

```
runtime/prompt-cache/
  types.ts             # PromptBlock, CacheablePrompt, ProviderCachePolicy, stats
  provider-policy.ts   # provider id -> caching capability (explicit | implicit | none)
  digest.ts            # deterministic hashing + the stable-prefix version fingerprint
  cacheable-prompt.ts  # buildCacheablePrompt(): the segment builder
  metrics.ts           # promptCacheMetrics: observability recorder + snapshot
```

The former chat-turn shortcut integration was removed with the SDK-native
message-lifecycle migration. New Doolittle-owned prompt construction must use
this module; SDK message-service prompts must not.

## How it works

1. A Doolittle-owned prompt is described as a **stable prefix** (character
   voice, soul, or another reusable contract) plus a **volatile suffix** (fresh
   context and user-derived input).
2. `buildCacheablePrompt` turns that into SDK `promptSegments` (`{content, stable}`)
   plus `providerOptions`, preserving the invariant
   `prompt === promptSegments.map(s => s.content).join("")`.
3. The segments are passed straight to `runtime.useModel`. The provider plugin
   does the rest: `@elizaos/plugin-anthropic` emits `cache_control: ephemeral`
   on the stable segments; `@elizaos/plugin-openai` keys prefix caching by
   `providerOptions.openai.promptCacheKey`.

## Provider awareness (`provider-policy.ts`)

| Mode | Providers | Behavior |
|---|---|---|
| `implicit` | `ollama` / local | No hints; an identical leading prefix is reused by the KV cache automatically. |
| `explicit` | Anthropic API key, linked Claude Code OAuth, OpenAI | Stable prompt segments and provider-native cache controls. |
| `none` | codex, devin, explicit Claude CLI fallback, official Eliza Cloud, unknown | No-op — on the pinned beta, those handlers build their request from `params.prompt` and ignore segments. |

## Cache keys & invalidation

The cache key is `sha256(templateVersion + versionDigest + provider + model + ...stableBlocks)`.
It rotates automatically — and the provider therefore treats the prompt as new —
whenever any of these change:

- **Template** — bump `PROMPT_CACHE_TEMPLATE_VERSION` when segment shape/ordering changes.
- **Stable content** — character voice, soul, or contract text (hashed directly).
- **Persona / character** — via `versionDigest` (the active personality ID on the pinned beta;
  extend with `computeStablePrefixVersion` for character/tool/settings digests).
- **Provider / model** — part of the key string.

Volatile content (user input, fresh memory) is **never** part of the key, so it
can never cause a stale or cross-request hit.

## Observability (`promptCacheMetrics`)

`recordPlan` is called for every cacheable prompt (what we attempted). The
snapshot reports calls, eligible calls, segments emitted, and stable/volatile
volume per provider. Each plan is also debug-logged (`src: "doolittle:prompt-cache"`).

`recordUsage` accepts provider cache-token reports (hits/misses/savings) but is
**not wired** on the pinned beta: the SDK `MODEL_USED` event exposes only
`{prompt, completion, total}` tokens, not `cacheReadInputTokens`. Surfacing real
hit-rate requires the SDK to forward cache usage — see "Known limitations".

## Extending

- **A new caching provider:** add a branch to `resolveProviderCachePolicy`.
- **A new Doolittle-owned `useModel` call:** build a stable/volatile split and
  route it through `buildCacheablePrompt`. Never pass cache hints ad hoc.
- **Make a custom provider plugin cacheable:** teach it to read
  `params.promptSegments` / `params.providerOptions`, then move it to `explicit`.

## When NOT to use it

- Don't segment SDK-pipeline prompts (handleMessage) — core already does it.
- Don't mark anything user-derived, secret, credential-bearing, or per-request
  as `stable`. Correctness beats cache rate: a wrong stable flag is a stale or
  leaked prompt.

## Known limitations / follow-ups

- Real hit-rate/token-savings telemetry needs the SDK to forward provider cache
  usage through `MODEL_USED` (or a usage callback). Today only the *plan* is
  observable.
- `ModelType.RESEARCH` accepts structured `ResearchParams` and does not expose
  `promptSegments` or `providerOptions`. Its Doolittle prompt still uses this
  module for stable/volatile construction and plan telemetry, but is recorded
  under the non-cacheable `research` transport until the SDK supports cache
  hints for that model type.
- The Doolittle Codex and Claude Code bridges and the official Eliza Cloud
  plugin ignore `promptSegments`; extend explicit caching only through their
  public handlers.
- There is intentionally no Doolittle prelude in the SDK message path. Stable
  product context belongs in registered Providers so core can own its cache
  policy.
