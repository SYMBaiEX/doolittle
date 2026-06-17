import { describe, expect, it } from "bun:test";
import { buildCacheablePrompt } from "./cacheable-prompt";

const base = { joiner: "\n", versionDigest: "v1", conversationId: "room1" };

function options(result: { providerOptions?: Record<string, unknown> }) {
  return result.providerOptions as
    | {
        openai?: { promptCacheKey?: string };
        eliza?: { conversationId?: string };
      }
    | undefined;
}

describe("buildCacheablePrompt", () => {
  it("emits lossless stable + volatile segments for explicit providers", () => {
    const r = buildCacheablePrompt({
      ...base,
      stableBlocks: ["SYS", "TOOLS"],
      volatile: "USER",
      provider: "anthropic",
      model: "claude",
    });
    expect(r.prompt).toBe("SYS\nTOOLS\nUSER");
    expect(r.promptSegments).toBeDefined();
    // The SDK invariant: segments reconstruct the prompt exactly.
    expect(r.promptSegments?.map((s) => s.content).join("")).toBe(r.prompt);
    expect(r.promptSegments?.filter((s) => s.stable).length).toBe(2);
    expect(r.promptSegments?.at(-1)?.stable).toBe(false);
    expect(r.stats).toMatchObject({ mode: "explicit", segmentsEmitted: true });
  });

  it("sets openai promptCacheKey + eliza conversationId for OpenAI-family", () => {
    const r = buildCacheablePrompt({
      ...base,
      stableBlocks: ["SYS"],
      volatile: "U",
      provider: "openai",
      model: "gpt",
    });
    expect(options(r)?.openai?.promptCacheKey).toBe(r.cacheKey);
    expect(options(r)?.eliza?.conversationId).toBe("room1");
  });

  it("does NOT emit segments for implicit providers (ollama) but stays eligible", () => {
    const r = buildCacheablePrompt({
      ...base,
      stableBlocks: ["SYS"],
      volatile: "U",
      provider: "ollama",
      model: "granite",
    });
    expect(r.promptSegments).toBeUndefined();
    expect(r.providerOptions).toBeUndefined();
    expect(r.prompt).toBe("SYS\nU");
    expect(r.stats).toMatchObject({
      mode: "implicit",
      eligible: true,
      segmentsEmitted: false,
    });
  });

  it("is a no-op for providers with no caching (devin / CLI)", () => {
    const r = buildCacheablePrompt({
      ...base,
      stableBlocks: ["SYS"],
      volatile: "U",
      provider: "devin",
      model: "x",
    });
    expect(r.promptSegments).toBeUndefined();
    expect(r.stats).toMatchObject({ mode: "none", eligible: false });
  });

  it("caps stable segments to the provider breakpoint budget, losslessly", () => {
    const r = buildCacheablePrompt({
      ...base,
      stableBlocks: ["A", "B", "C"],
      volatile: "U",
      provider: "openai", // maxStableBreakpoints = 1
      model: "gpt",
    });
    expect(r.promptSegments?.filter((s) => s.stable).length).toBe(1);
    expect(r.promptSegments?.map((s) => s.content).join("")).toBe(r.prompt);
    expect(r.prompt).toBe("A\nB\nC\nU");
  });

  it("produces deterministic keys that rotate on every invalidation input", () => {
    const key = (over: Record<string, unknown>) =>
      buildCacheablePrompt({
        ...base,
        stableBlocks: ["SYS"],
        volatile: "U",
        provider: "anthropic",
        model: "claude",
        ...over,
      }).cacheKey;
    const baseline = key({});
    expect(key({})).toBe(baseline); // deterministic
    expect(key({ versionDigest: "v2" })).not.toBe(baseline); // persona/character change
    expect(key({ model: "claude-2" })).not.toBe(baseline); // model change
    expect(key({ provider: "openai" })).not.toBe(baseline); // provider change
    expect(key({ stableBlocks: ["SYS2"] })).not.toBe(baseline); // stable content change
    // volatile content must NOT affect the key
    expect(key({ volatile: "different user input" })).toBe(baseline);
  });

  it("emits nothing when there is no stable content", () => {
    const r = buildCacheablePrompt({
      ...base,
      stableBlocks: ["", ""],
      volatile: "U",
      provider: "anthropic",
      model: "claude",
    });
    expect(r.promptSegments).toBeUndefined();
    expect(r.prompt).toBe("U");
    expect(r.stats.eligible).toBe(false);
  });
});
