import type { PromptSegment } from "@elizaos/core";

/**
 * Per-provider prompt-caching capability.
 *  - `explicit`  — provider honors cache breakpoints we mark (Anthropic
 *    `cache_control: ephemeral` derived from stable `promptSegments`; OpenAI /
 *    Eliza Cloud automatic prefix caching keyed by `providerOptions`).
 *  - `implicit`  — provider reuses a KV cache for identical leading prefixes
 *    with no explicit hints (ollama / llama.cpp). Stable-first ordering helps;
 *    no provider options are emitted.
 *  - `none`      — provider has no prompt caching (CLI-print providers such as
 *    devin / codex / claude-code). Segmentation is a no-op but harmless.
 */
export type ProviderCacheMode = "explicit" | "implicit" | "none";

export interface ProviderCachePolicy {
  mode: ProviderCacheMode;
  /** Max number of stable cache breakpoints the provider supports (Anthropic = 4). */
  maxStableBreakpoints: number;
  /** Whether to emit `providerOptions.openai.promptCacheKey` (OpenAI-family). */
  emitsPromptCacheKey: boolean;
}

/** A semantic chunk of a prompt with an explicit cache-stability classification. */
export interface PromptBlock {
  /** Semantic label, e.g. "character", "soul", "contract", "memory", "user". */
  kind: string;
  content: string;
  /**
   * `true` when this block is identical across calls for the same character /
   * schema / tool set (safe to cache). `false` for per-call content (user
   * input, fresh memory/conversation, timestamps, ids, secrets).
   */
  stable: boolean;
}

export interface PromptCacheStats {
  provider: string;
  model: string;
  mode: ProviderCacheMode;
  /** Deterministic identity of the stable prefix (version + provider + model + content). */
  cacheKey: string;
  stableChars: number;
  volatileChars: number;
  stableSegments: number;
  /** True when a cacheable stable prefix exists and the provider caches in some form. */
  eligible: boolean;
  /** True when we attached `promptSegments` (explicit-mode providers only). */
  segmentsEmitted: boolean;
}

/**
 * The result of segmenting a prompt for caching. `prompt` is always the exact
 * text that would have been sent; `promptSegments`/`providerOptions` are only
 * populated when caching is eligible. The invariant
 * `prompt === promptSegments.map(s => s.content).join("")` always holds when
 * segments are present.
 */
export interface CacheablePrompt {
  prompt: string;
  promptSegments?: PromptSegment[];
  providerOptions?: Record<string, object | undefined>;
  cacheKey: string;
  stats: PromptCacheStats;
}
