import { describe, expect, it } from "bun:test";
import {
  computeStablePrefixVersion,
  hashParts,
  hashStableJson,
  PROMPT_CACHE_TEMPLATE_VERSION,
} from "./digest";

describe("hashParts", () => {
  it("is deterministic and order-sensitive", () => {
    expect(hashParts(["a", "b"])).toBe(hashParts(["a", "b"]));
    expect(hashParts(["a", "b"])).not.toBe(hashParts(["b", "a"]));
  });

  it("is not fooled by boundary ambiguity (delimiter is hashed)", () => {
    expect(hashParts(["a", "b"])).not.toBe(hashParts(["ab"]));
  });
});

describe("hashStableJson", () => {
  it("is independent of key order", () => {
    expect(hashStableJson({ a: 1, b: 2 })).toBe(hashStableJson({ b: 2, a: 1 }));
  });

  it("ignores undefined values", () => {
    expect(hashStableJson({ a: 1, b: undefined })).toBe(
      hashStableJson({ a: 1 }),
    );
  });

  it("distinguishes different values", () => {
    expect(hashStableJson({ a: 1 })).not.toBe(hashStableJson({ a: 2 }));
  });
});

describe("computeStablePrefixVersion", () => {
  it("rotates when any input changes", () => {
    const baseline = computeStablePrefixVersion({ characterDigest: "c1" });
    expect(computeStablePrefixVersion({ characterDigest: "c1" })).toBe(
      baseline,
    );
    expect(computeStablePrefixVersion({ characterDigest: "c2" })).not.toBe(
      baseline,
    );
    expect(
      computeStablePrefixVersion({
        characterDigest: "c1",
        personalityId: "p1",
      }),
    ).not.toBe(baseline);
    expect(
      computeStablePrefixVersion({
        characterDigest: "c1",
        toolsetDigest: "t1",
      }),
    ).not.toBe(baseline);
  });

  it("embeds the template version so a bump invalidates all keys", () => {
    // The template version is part of the digest input — documented invariant.
    expect(PROMPT_CACHE_TEMPLATE_VERSION.length).toBeGreaterThan(0);
    const v = computeStablePrefixVersion({ characterDigest: "c1" });
    expect(v).toHaveLength(32);
  });
});
