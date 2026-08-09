import { describe, expect, it } from "vitest";
import { trimTextOrUndefined } from "./token-loaders";

describe("account-auth token text normalization", () => {
  it("uses the shared non-empty string semantics", () => {
    expect(trimTextOrUndefined("  token-123  ")).toBe("token-123");
    expect(trimTextOrUndefined("   ")).toBeUndefined();
    expect(trimTextOrUndefined(123)).toBeUndefined();
  });
});
