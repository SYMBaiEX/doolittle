import type { Action, Plugin } from "@elizaos/core";
import { describe, expect, it } from "vitest";
import { deduplicateNativePluginActions, normalizePlugin } from "./support";

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
