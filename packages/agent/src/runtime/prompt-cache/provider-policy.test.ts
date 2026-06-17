import { describe, expect, it } from "bun:test";
import { resolveProviderCachePolicy } from "./provider-policy";

describe("resolveProviderCachePolicy", () => {
  it("classifies Anthropic (SDK plugin) as explicit with 4 breakpoints", () => {
    const p = resolveProviderCachePolicy("anthropic");
    expect(p.mode).toBe("explicit");
    expect(p.maxStableBreakpoints).toBe(4);
    expect(p.emitsPromptCacheKey).toBe(false);
  });

  it("classifies OpenAI (SDK plugin) as explicit with a prompt cache key", () => {
    const p = resolveProviderCachePolicy("openai");
    expect(p.mode).toBe("explicit");
    expect(p.emitsPromptCacheKey).toBe(true);
  });

  it("classifies ollama / local as implicit", () => {
    expect(resolveProviderCachePolicy("ollama").mode).toBe("implicit");
    expect(resolveProviderCachePolicy("local-llama").mode).toBe("implicit");
  });

  it("classifies custom plugins that ignore segments, and unknowns, as none", () => {
    for (const id of [
      "claude-code",
      "codex",
      "devin",
      "elizacloud",
      "",
      undefined,
    ]) {
      expect(resolveProviderCachePolicy(id).mode).toBe("none");
    }
  });
});
