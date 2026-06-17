import type { ProviderCachePolicy } from "./types";

/**
 * Map a Doolittle provider id (resolved from settings `model.provider`) to its
 * prompt-caching capability.
 *
 * IMPORTANT: only providers whose plugin actually *consumes* `promptSegments`
 * are classified `explicit`. The installed SDK plugins `@elizaos/plugin-anthropic`
 * and `@elizaos/plugin-openai` do (Anthropic → `cache_control: ephemeral`,
 * OpenAI → prefix caching). Doolittle's custom provider plugins (claude-code,
 * codex, devin, elizacloud) build their own requests from `params.prompt` and
 * ignore segments today, so they are `none` until they are made segment-aware
 * (tracked follow-up). ollama is `implicit` — its KV cache reuses identical
 * leading prefixes with no explicit hints.
 *
 * Substring matching keeps unknown providers degrading safely to `none`.
 */
export function resolveProviderCachePolicy(
  provider: string | undefined,
): ProviderCachePolicy {
  const id = (provider ?? "").toLowerCase();

  // @elizaos/plugin-anthropic — explicit cache_control breakpoints (up to 4).
  if (id.includes("anthropic")) {
    return {
      mode: "explicit",
      maxStableBreakpoints: 4,
      emitsPromptCacheKey: false,
    };
  }

  // @elizaos/plugin-openai — automatic prefix caching keyed by promptCacheKey.
  if (id.includes("openai")) {
    return {
      mode: "explicit",
      maxStableBreakpoints: 1,
      emitsPromptCacheKey: true,
    };
  }

  // ollama / local llama.cpp — implicit prefix-KV reuse, no explicit hints.
  if (id.includes("ollama") || id.includes("local")) {
    return {
      mode: "implicit",
      maxStableBreakpoints: 1,
      emitsPromptCacheKey: false,
    };
  }

  // Custom CLI/cloud plugins (claude-code, codex, devin, elizacloud) that do
  // not yet honor promptSegments, plus anything unknown.
  return { mode: "none", maxStableBreakpoints: 0, emitsPromptCacheKey: false };
}
