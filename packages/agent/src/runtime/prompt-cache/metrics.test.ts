import { beforeEach, describe, expect, it } from "bun:test";
import { promptCacheMetrics } from "./metrics";
import type { PromptCacheStats } from "./types";

function stats(over: Partial<PromptCacheStats> = {}): PromptCacheStats {
  return {
    provider: "anthropic",
    model: "claude",
    mode: "explicit",
    cacheKey: "k",
    stableChars: 100,
    volatileChars: 10,
    stableSegments: 1,
    eligible: true,
    segmentsEmitted: true,
    ...over,
  };
}

describe("promptCacheMetrics", () => {
  beforeEach(() => promptCacheMetrics.reset());

  it("aggregates plan records globally and per provider", () => {
    promptCacheMetrics.recordPlan(stats());
    promptCacheMetrics.recordPlan(
      stats({ provider: "ollama", mode: "implicit", segmentsEmitted: false }),
    );
    promptCacheMetrics.recordPlan(
      stats({
        provider: "devin",
        mode: "none",
        eligible: false,
        segmentsEmitted: false,
      }),
    );
    const snap = promptCacheMetrics.snapshot();
    expect(snap.calls).toBe(3);
    expect(snap.eligibleCalls).toBe(2);
    expect(snap.segmentsEmitted).toBe(1);
    expect(snap.byProvider.anthropic.calls).toBe(1);
    expect(snap.byProvider.anthropic.segmentsEmitted).toBe(1);
    expect(snap.byProvider.ollama.eligible).toBe(1);
    expect(snap.byProvider.devin.eligible).toBe(0);
  });

  it("computes hits / misses / hitRate and token savings from usage", () => {
    promptCacheMetrics.recordUsage({
      promptTokens: 1000,
      cacheReadTokens: 800,
    });
    promptCacheMetrics.recordUsage({ promptTokens: 1000, cacheReadTokens: 0 });
    const snap = promptCacheMetrics.snapshot();
    expect(snap.cacheHits).toBe(1);
    expect(snap.cacheMisses).toBe(1);
    expect(snap.hitRate).toBe(0.5);
    expect(snap.promptTokens).toBe(2000);
    expect(snap.estimatedTokensSaved).toBe(800);
  });

  it("reports a zero hit-rate before any usage is observed", () => {
    promptCacheMetrics.recordPlan(stats());
    expect(promptCacheMetrics.snapshot().hitRate).toBe(0);
  });

  it("reset clears every counter", () => {
    promptCacheMetrics.recordPlan(stats());
    promptCacheMetrics.recordUsage({ cacheReadTokens: 5 });
    promptCacheMetrics.reset();
    const snap = promptCacheMetrics.snapshot();
    expect(snap.calls).toBe(0);
    expect(snap.usageSamples).toBe(0);
    expect(Object.keys(snap.byProvider)).toHaveLength(0);
  });
});
