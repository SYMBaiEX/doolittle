# Doolittle prompt caching

Provider-aware prompt caching for the prompts **Doolittle itself owns** — i.e.
the direct `runtime.useModel` calls Doolittle makes outside the ElizaOS SDK
message pipeline.

## TL;DR

- The **SDK already caches** everything routed through `runtime.messageService.handleMessage`
  (the action / evaluator / planner path). `@elizaos/core` builds `promptSegments`
  and a full provider cache plan there. **Do not reimplement that.**
- The only prompts with **zero caching** were Doolittle's own direct `useModel`
  calls (the chat-turn "shortcut" fast paths). This module fixes exactly those.
- It is a small, shared abstraction — never hand-rolled per call site.

## Where it lives

```
runtime/prompt-cache/
  types.ts             # PromptBlock, CacheablePrompt, ProviderCachePolicy, stats
  provider-policy.ts   # provider id -> caching capability (explicit | implicit | none)
  digest.ts            # deterministic hashing + the stable-prefix version fingerprint
  cacheable-prompt.ts  # buildCacheablePrompt(): the segment builder
  metrics.ts           # promptCacheMetrics: observability recorder + snapshot
```

Integration point: `chat-turn/native/shortcuts.ts#buildShortcutPromptCache`,
used by all three shortcut handlers (direct-informational + the two
profile-memory paths). That is the single funnel for Doolittle-owned model
calls, so caching is applied once and uniformly.

## How it works

1. A prompt is described as a **stable prefix** (character voice, soul,
   conversation contract — identical across calls for the same character) plus a
   **volatile suffix** (recent conversation, durable memory, the user message).
   `buildDirectInformationalPromptParts` splits the fast-path prompt losslessly:
   `stablePrefix + "\n" + volatileSuffix` equals the original wire prompt.
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
| `explicit` | `anthropic`, `openai` (SDK plugins) | Emit `promptSegments` (+ `promptCacheKey` for OpenAI). |
| `implicit` | `ollama` / local | No hints; an identical leading prefix is reused by the KV cache automatically. |
| `none` | claude-code, codex, devin, elizacloud (custom plugins), unknown | No-op — those plugins build their own request from `params.prompt` and ignore segments today. |

## Cache keys & invalidation

The cache key is `sha256(templateVersion + versionDigest + provider + model + ...stableBlocks)`.
It rotates automatically — and the provider therefore treats the prompt as new —
whenever any of these change:

- **Template** — bump `PROMPT_CACHE_TEMPLATE_VERSION` when segment shape/ordering changes.
- **Stable content** — character voice, soul, or contract text (hashed directly).
- **Persona / character** — via `versionDigest` (active personality id today;
  extend with `computeStablePrefixVersion` for character/tool/settings digests).
- **Provider / model** — part of the key string.

Volatile content (user input, fresh memory) is **never** part of the key, so it
can never cause a stale or cross-request hit.

## Observability (`promptCacheMetrics`)

`recordPlan` is called for every cacheable prompt (what we attempted). The
snapshot reports calls, eligible calls, segments emitted, and stable/volatile
volume per provider. Each plan is also debug-logged (`src: "doolittle:prompt-cache"`).

`recordUsage` accepts provider cache-token reports (hits/misses/savings) but is
**not wired** today: the SDK `MODEL_USED` event exposes only
`{prompt, completion, total}` tokens, not `cacheReadInputTokens`. Surfacing real
hit-rate requires the SDK to forward cache usage — see "Known limitations".

## Extending

- **A new caching provider:** add a branch to `resolveProviderCachePolicy`.
- **A new Doolittle-owned `useModel` call:** build a stable/volatile split and
  route it through `buildShortcutPromptCache` (or `buildCacheablePrompt`
  directly). Never pass cache hints ad hoc.
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
- Custom provider plugins (claude-code, codex, elizacloud) ignore `promptSegments`
  — make them segment-aware to extend explicit caching to those providers.
- The SDK main-path **prelude** (`chat-turn/model-input.ts`) still rides as
  volatile; hoisting its stable half into a static provider would let core cache
  it. Tracked separately.
