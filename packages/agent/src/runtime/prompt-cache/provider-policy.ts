import type { ProviderCachePolicy } from "./types";

/**
 * Map a Doolittle provider id (resolved from settings `model.provider`) to its
 * prompt-caching capability.
 *
 * IMPORTANT: only providers whose plugin actually *consumes* `promptSegments`
 * are classified `explicit`. The installed SDK plugins `@elizaos/plugin-anthropic`
 * and `@elizaos/plugin-openai` do (Anthropic → `cache_control: ephemeral`,
 * OpenAI → prefix caching). Linked Claude OAuth now routes through the same
 * official Anthropic handler. The official Codex provider, Doolittle's Devin
 * bridge, explicit Claude CLI fallback, and the official Eliza Cloud plugin build their requests from
 * `params.prompt` and ignore segments, so they are `none` until their public
 * handlers become segment-aware. ollama is `implicit` — its KV cache reuses
 * identical leading prefixes with no explicit hints.
 *
 * Substring matching keeps unknown providers degrading safely to `none`.
 */
export function resolveProviderCachePolicy(
  provider: string | undefined,
): ProviderCachePolicy {
  const id = (provider ?? "").toLowerCase();

  // @elizaos/plugin-anthropic — explicit cache_control breakpoints (up to 4).
  if (id.includes("anthropic") || id.includes("claude-code")) {
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

  // Prompt-only provider handlers (codex, devin, elizacloud) and
  // anything unknown.
  return { mode: "none", maxStableBreakpoints: 0, emitsPromptCacheKey: false };
}
