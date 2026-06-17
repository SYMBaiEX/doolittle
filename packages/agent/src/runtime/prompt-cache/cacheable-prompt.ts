import type { PromptSegment } from "@elizaos/core";
import { hashParts, PROMPT_CACHE_TEMPLATE_VERSION } from "./digest";
import { resolveProviderCachePolicy } from "./provider-policy";
import type {
  CacheablePrompt,
  PromptCacheStats,
  ProviderCachePolicy,
} from "./types";

export interface BuildCacheablePromptInput {
  /**
   * Ordered stable prefix blocks — content that is identical across calls for
   * the same character / schema / tool set (character voice, soul, conversation
   * contract, runtime facts, per-path instructions, tool schemas).
   */
  stableBlocks: string[];
  /**
   * The volatile suffix — content that changes every call (fresh memory and
   * conversation context, the user message, timestamps, ids). NEVER cached as
   * stable.
   */
  volatile: string;
  /** Separator between every block; must match how the original prompt joins. */
  joiner?: string;
  /** Resolved provider id (settings `model.provider`). */
  provider: string | undefined;
  /** Resolved model id (settings `model.model`). */
  model: string | undefined;
  /** Stable-prefix version fingerprint — see `computeStablePrefixVersion`. */
  versionDigest: string;
  /** Slot key for provider cache scoping (typically the room id). */
  conversationId?: string;
}

/**
 * Segment a Doolittle-owned prompt into a cacheable stable prefix + volatile
 * suffix and produce the `promptSegments` / `providerOptions` to pass to
 * `runtime.useModel`. Provider-aware and lossless:
 * `prompt === promptSegments.map(s => s.content).join("")` always holds when
 * segments are emitted. On any inconsistency it degrades safely to the plain
 * prompt — caching is never allowed to change what the model is asked.
 */
export function buildCacheablePrompt(
  input: BuildCacheablePromptInput,
): CacheablePrompt {
  const joiner = input.joiner ?? "\n";
  const provider = input.provider ?? "unknown";
  const model = input.model ?? "unknown";
  const stableBlocks = input.stableBlocks.filter((block) => block.length > 0);
  const volatile = input.volatile;
  const policy = resolveProviderCachePolicy(provider);

  const prompt = [...stableBlocks, volatile].join(joiner);
  const stableChars = stableBlocks.reduce((total, b) => total + b.length, 0);
  const cacheKey = hashParts([
    PROMPT_CACHE_TEMPLATE_VERSION,
    input.versionDigest,
    provider,
    model,
    ...stableBlocks,
  ]).slice(0, 32);

  const eligible = policy.mode !== "none" && stableBlocks.length > 0;
  const stats: PromptCacheStats = {
    provider,
    model,
    mode: policy.mode,
    cacheKey,
    stableChars,
    volatileChars: volatile.length,
    stableSegments: 0,
    eligible,
    segmentsEmitted: false,
  };

  // Explicit-mode providers (Anthropic / OpenAI-family) are the only ones that
  // consume promptSegments. Implicit providers (ollama) already benefit from an
  // identical leading prefix, and `none` providers cannot cache at all — for
  // both we send the plain prompt unchanged.
  if (!eligible || policy.mode !== "explicit") {
    return { prompt, cacheKey, stats };
  }

  const cappedStable = capStableBlocks(
    stableBlocks,
    policy.maxStableBreakpoints,
    joiner,
  );
  const promptSegments: PromptSegment[] = [
    ...cappedStable.map((content) => ({
      content: content + joiner,
      stable: true,
    })),
    { content: volatile, stable: false },
  ];

  if (promptSegments.map((s) => s.content).join("") !== prompt) {
    // Lossless invariant violated — never send an altered prompt.
    return { prompt, cacheKey, stats };
  }

  return {
    prompt,
    promptSegments,
    providerOptions: buildProviderOptions(
      policy,
      cacheKey,
      input.conversationId,
    ),
    cacheKey,
    stats: {
      ...stats,
      stableSegments: cappedStable.length,
      segmentsEmitted: true,
    },
  };
}

/** Merge leading blocks until the count fits the provider's breakpoint budget. */
function capStableBlocks(
  blocks: string[],
  max: number,
  joiner: string,
): string[] {
  if (blocks.length <= max || max <= 0) {
    if (max <= 0) {
      return [blocks.join(joiner)];
    }
    return blocks;
  }
  const mergeCount = blocks.length - max + 1;
  const merged = blocks.slice(0, mergeCount).join(joiner);
  return [merged, ...blocks.slice(mergeCount)];
}

function buildProviderOptions(
  policy: ProviderCachePolicy,
  cacheKey: string,
  conversationId: string | undefined,
): Record<string, object | undefined> | undefined {
  const options: Record<string, object | undefined> = {};
  if (policy.emitsPromptCacheKey) {
    options.openai = { promptCacheKey: cacheKey };
  }
  if (conversationId) {
    options.eliza = { conversationId };
  }
  return Object.keys(options).length > 0 ? options : undefined;
}
