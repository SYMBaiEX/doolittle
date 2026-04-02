import { describe, expect, it } from "bun:test";
import { resolveLinkedProviderName } from "./provider-name";

describe("resolveLinkedProviderName", () => {
  it("resolves common aliases for supported providers", () => {
    expect(resolveLinkedProviderName("codex")).toBe("codex");
    expect(resolveLinkedProviderName("eliza-cloud")).toBe("elizacloud");
    expect(resolveLinkedProviderName("Claude")).toBe("claude-code");
    expect(resolveLinkedProviderName("claude-code")).toBe("claude-code");
    expect(resolveLinkedProviderName("cloud")).toBe("elizacloud");
  });

  it("returns undefined for unsupported providers", () => {
    expect(resolveLinkedProviderName("azure")).toBeUndefined();
    expect(resolveLinkedProviderName(undefined)).toBeUndefined();
    expect(resolveLinkedProviderName("")).toBeUndefined();
  });
});
