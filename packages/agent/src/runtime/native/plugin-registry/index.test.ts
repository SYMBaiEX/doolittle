import { describe, expect, it } from "vitest";
import { normalizePlugin } from "./support";

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
