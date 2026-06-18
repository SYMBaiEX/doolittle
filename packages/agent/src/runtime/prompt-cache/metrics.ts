import type { PromptCacheStats } from "./types";

/** Provider-reported token usage for a single model call. */
export interface PromptCacheUsageSample {
  promptTokens?: number;
  /** Tokens served from the provider prompt cache (Anthropic cache_read, OpenAI cached). */
  cacheReadTokens?: number;
  /** Tokens written to the provider prompt cache (Anthropic cache_creation). */
  cacheWriteTokens?: number;
}

export interface PromptCacheProviderSnapshot {
  calls: number;
  eligible: number;
  segmentsEmitted: number;
  stableChars: number;
  volatileChars: number;
}

export interface PromptCacheSnapshot {
  calls: number;
  eligibleCalls: number;
  segmentsEmitted: number;
  byProvider: Record<string, PromptCacheProviderSnapshot>;
  /** Actuals derived from provider usage reports. */
  usageSamples: number;
  cacheHits: number;
  cacheMisses: number;
  hitRate: number;
  promptTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  /** Prompt tokens served from cache instead of being re-processed at full cost. */
  estimatedTokensSaved: number;
}

/**
 * Process-wide prompt-cache observability. `recordPlan` is called whenever a
 * cacheable prompt is built (what we attempted); `recordUsage` is fed by the
 * model-usage event stream (what actually happened — cache reads/writes). The
 * snapshot powers operator surfaces (`/status`) and structured logs.
 */
class PromptCacheMetrics {
  private calls = 0;
  private eligibleCalls = 0;
  private segmentsEmitted = 0;
  private readonly providers = new Map<string, PromptCacheProviderSnapshot>();
  private usageSamples = 0;
  private cacheHits = 0;
  private cacheMisses = 0;
  private promptTokens = 0;
  private cacheReadTokens = 0;
  private cacheWriteTokens = 0;

  recordPlan(stats: PromptCacheStats): void {
    this.calls += 1;
    if (stats.eligible) {
      this.eligibleCalls += 1;
    }
    if (stats.segmentsEmitted) {
      this.segmentsEmitted += 1;
    }
    const provider = this.providers.get(stats.provider) ?? {
      calls: 0,
      eligible: 0,
      segmentsEmitted: 0,
      stableChars: 0,
      volatileChars: 0,
    };
    provider.calls += 1;
    provider.eligible += stats.eligible ? 1 : 0;
    provider.segmentsEmitted += stats.segmentsEmitted ? 1 : 0;
    provider.stableChars += stats.stableChars;
    provider.volatileChars += stats.volatileChars;
    this.providers.set(stats.provider, provider);
  }

  recordUsage(sample: PromptCacheUsageSample): void {
    this.usageSamples += 1;
    const read = sample.cacheReadTokens ?? 0;
    const write = sample.cacheWriteTokens ?? 0;
    this.promptTokens += sample.promptTokens ?? 0;
    this.cacheReadTokens += read;
    this.cacheWriteTokens += write;
    if (read > 0) {
      this.cacheHits += 1;
    } else {
      this.cacheMisses += 1;
    }
  }

  snapshot(): PromptCacheSnapshot {
    const byProvider: Record<string, PromptCacheProviderSnapshot> = {};
    for (const [name, value] of this.providers) {
      byProvider[name] = { ...value };
    }
    const decided = this.cacheHits + this.cacheMisses;
    return {
      calls: this.calls,
      eligibleCalls: this.eligibleCalls,
      segmentsEmitted: this.segmentsEmitted,
      byProvider,
      usageSamples: this.usageSamples,
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
      hitRate: decided > 0 ? this.cacheHits / decided : 0,
      promptTokens: this.promptTokens,
      cacheReadTokens: this.cacheReadTokens,
      cacheWriteTokens: this.cacheWriteTokens,
      estimatedTokensSaved: this.cacheReadTokens,
    };
  }

  reset(): void {
    this.calls = 0;
    this.eligibleCalls = 0;
    this.segmentsEmitted = 0;
    this.providers.clear();
    this.usageSamples = 0;
    this.cacheHits = 0;
    this.cacheMisses = 0;
    this.promptTokens = 0;
    this.cacheReadTokens = 0;
    this.cacheWriteTokens = 0;
  }
}

/** Process-wide singleton. */
export const promptCacheMetrics = new PromptCacheMetrics();
