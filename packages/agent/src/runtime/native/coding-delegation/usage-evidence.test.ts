import { describe, expect, it } from "vitest";
import { DelegatedUsageCollector } from "./usage-evidence";

const event = (changes: Record<string, unknown> = {}) => ({
  sourceEventId: "child:prompt-1",
  state: "measured",
  inputTokens: 100,
  outputTokens: 10,
  reasoningTokens: 4,
  cacheTokens: 50,
  ...changes,
});

describe("DelegatedUsageCollector", () => {
  it("keeps missing usage unavailable, not zero", () => {
    expect(new DelegatedUsageCollector().receipt()).toMatchObject({
      state: "unavailable",
      acceptedEvents: 0,
      inputTokens: null,
      outputTokens: null,
      reasoningTokens: null,
      cacheTokens: null,
      costCoverageEvents: 0,
      costUsd: null,
    });
  });

  it("sums deduplicated SDK events without double-counting reasoning or cache as total tokens", () => {
    const collector = new DelegatedUsageCollector();
    collector.observe(event());
    collector.observe(event());
    collector.observe(
      event({ sourceEventId: "child:prompt-2", inputTokens: 200 }),
    );
    expect(collector.receipt()).toMatchObject({
      state: "measured",
      source: "eliza-sdk-session-usage-update",
      coverage: "reported-sdk-events-only",
      acceptedEvents: 2,
      duplicateEvents: 1,
      inputTokens: 300,
      outputTokens: 20,
      reasoningTokens: 8,
      cacheTokens: 100,
      costUsd: null,
    });
    expect(collector.receipt()).not.toHaveProperty("totalTokens");
    expect(collector.receipt()).not.toHaveProperty("providerCalls");
  });

  it("excludes contradictory IDs and does not let a later delivery revive them", () => {
    const collector = new DelegatedUsageCollector();
    collector.observe(event({ costUsd: 0.1 }));
    collector.observe(event({ inputTokens: 900, costUsd: 0.1 }));
    collector.observe(event({ costUsd: 0.1 }));
    collector.observe(event({ sourceEventId: "child:prompt-2", costUsd: 0.2 }));
    expect(collector.receipt()).toMatchObject({
      acceptedEvents: 1,
      conflictingEvents: 2,
      inputTokens: 100,
      costCoverageEvents: 1,
      costUsd: null,
    });
  });

  it("reports cost only with explicit cost on every accepted event and no ambiguous coverage", () => {
    const collector = new DelegatedUsageCollector();
    collector.observe(event({ costUsd: 0.125 }));
    collector.observe(
      event({ sourceEventId: "child:prompt-2", costUsd: 0.25 }),
    );
    expect(collector.receipt()).toMatchObject({
      costCoverageEvents: 2,
      costUsd: 0.375,
    });
    collector.observe(event({ sourceEventId: "child:prompt-3" }));
    expect(collector.receipt()).toMatchObject({
      costCoverageEvents: 2,
      costUsd: null,
    });
  });

  it("accepts a provider-explicit zero cost, not an inferred free invocation", () => {
    const collector = new DelegatedUsageCollector();
    collector.observe(event({ costUsd: 0 }));
    expect(collector.receipt()).toMatchObject({
      costCoverageEvents: 1,
      costUsd: 0,
    });
  });

  it.each([
    null,
    [],
    event({ sourceEventId: undefined }),
    event({ sourceEventId: "" }),
    event({ sourceEventId: "x".repeat(513) }),
    event({ state: "estimated" }),
    event({ inputTokens: -1 }),
    event({ outputTokens: 1.5 }),
    event({ reasoningTokens: Number.NaN }),
    event({ cacheTokens: Number.POSITIVE_INFINITY }),
    event({ inputTokens: Number.MAX_SAFE_INTEGER + 1 }),
    event({ outputTokens: undefined }),
    event({ costUsd: -1 }),
    event({ costUsd: Number.NaN }),
    event({ costUsd: null }),
    event({ costUsd: "0.5" }),
    event({
      inputTokens: 0,
      outputTokens: 0,
      reasoningTokens: 0,
      cacheTokens: 0,
    }),
  ])("rejects unavailable, malformed or unkeyed evidence %j", (data) => {
    const collector = new DelegatedUsageCollector();
    collector.observe(data);
    expect(collector.receipt()).toMatchObject({
      state: "unavailable",
      acceptedEvents: 0,
      rejectedEvents: 1,
      inputTokens: null,
      costUsd: null,
    });
  });

  it("bounds unique events while still deduplicating retained evidence", () => {
    const collector = new DelegatedUsageCollector();
    for (let index = 0; index < 129; index += 1)
      collector.observe(
        event({ sourceEventId: `event-${index}`, costUsd: 0.1 }),
      );
    collector.observe(event({ sourceEventId: "event-0", costUsd: 0.1 }));
    expect(collector.receipt()).toMatchObject({
      acceptedEvents: 128,
      truncatedEvents: 1,
      duplicateEvents: 1,
      inputTokens: 12800,
      costUsd: null,
    });
  });

  it("leaves overflowing totals unavailable without losing other safe counts", () => {
    const collector = new DelegatedUsageCollector();
    collector.observe(event({ inputTokens: Number.MAX_SAFE_INTEGER }));
    collector.observe(event({ sourceEventId: "child:prompt-2" }));
    expect(collector.receipt()).toMatchObject({
      state: "measured",
      acceptedEvents: 2,
      inputTokens: null,
      outputTokens: 20,
    });
  });

  it("does not persist IDs, provider labels or incidental private payload fields", () => {
    const collector = new DelegatedUsageCollector();
    collector.observe(
      event({
        sourceEventId: "secret-source-id",
        provider: "private-provider",
        model: "private-model",
        prompt: "private-prompt",
        apiKey: "private-credential",
      }),
    );
    const serialized = JSON.stringify(collector.receipt());
    for (const value of [
      "secret-source-id",
      "private-provider",
      "private-model",
      "private-prompt",
      "private-credential",
    ])
      expect(serialized).not.toContain(value);
  });
});
