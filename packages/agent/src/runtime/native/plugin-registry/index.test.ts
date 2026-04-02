import { describe, expect, it } from "bun:test";
import { shouldIncludeDirectProviderPlugin } from "./support";

describe("shouldIncludeDirectProviderPlugin", () => {
  it("excludes direct providers when Eliza Cloud owns the runtime", () => {
    expect(shouldIncludeDirectProviderPlugin("elizacloud", "openai")).toBe(
      false,
    );
    expect(shouldIncludeDirectProviderPlugin("elizacloud", "anthropic")).toBe(
      false,
    );
  });

  it("excludes direct providers when linked specialist providers are active", () => {
    expect(shouldIncludeDirectProviderPlugin("codex", "openai")).toBe(false);
    expect(shouldIncludeDirectProviderPlugin("claude-code", "anthropic")).toBe(
      false,
    );
  });

  it("keeps only the selected direct provider when a direct model path is active", () => {
    expect(shouldIncludeDirectProviderPlugin("openai", "openai")).toBe(true);
    expect(shouldIncludeDirectProviderPlugin("openai", "anthropic")).toBe(
      false,
    );
    expect(shouldIncludeDirectProviderPlugin("anthropic", "anthropic")).toBe(
      true,
    );
    expect(shouldIncludeDirectProviderPlugin("anthropic", "openai")).toBe(
      false,
    );
  });

  it("allows both direct providers when no specific runtime owner is selected", () => {
    expect(shouldIncludeDirectProviderPlugin("auto", "openai")).toBe(true);
    expect(shouldIncludeDirectProviderPlugin("auto", "anthropic")).toBe(true);
  });
});
