import { describe, expect, it } from "bun:test";
import type { Action, Plugin } from "@elizaos/core";
import {
  deduplicateNativePluginActions,
  normalizePlugin,
  shouldIncludeDirectProviderPlugin,
} from "./support";

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

describe("normalizePlugin", () => {
  it("uses the ElizaOS SDK plugin validator before accepting imports", () => {
    expect(normalizePlugin({ name: "@example/plugin" }).name).toBe(
      "@example/plugin",
    );
    expect(() => normalizePlugin({}, "broken plugin")).toThrow(
      "broken plugin has an invalid ElizaOS plugin shape: Plugin must have a name",
    );
  });
});

describe("deduplicateNativePluginActions", () => {
  it("keeps the first action implementation across the ordered plugin list", () => {
    const firstAction = { name: "SAME_ACTION" } as Action;
    const duplicateAction = { name: "SAME_ACTION" } as Action;
    const secondAction = { name: "SECOND_ACTION" } as Action;
    const plugins: Plugin[] = [
      {
        name: "first",
        description: "First test plugin",
        actions: [firstAction, secondAction],
      },
      {
        name: "second",
        description: "Second test plugin",
        actions: [duplicateAction],
      },
    ];

    expect(deduplicateNativePluginActions(plugins)).toBe(plugins);
    expect(plugins[0]?.actions).toEqual([firstAction, secondAction]);
    expect(plugins[1]?.actions).toEqual([]);
  });
});
