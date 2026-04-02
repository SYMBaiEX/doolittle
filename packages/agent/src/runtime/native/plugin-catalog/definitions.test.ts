import { describe, expect, it } from "bun:test";
import {
  getNativePluginCatalogSeeds,
  NATIVE_PLUGIN_CATEGORIES,
} from "./definitions";

describe("getNativePluginCatalogSeeds", () => {
  it("returns the full native catalog seed set with the expected metadata", () => {
    const seeds = getNativePluginCatalogSeeds([
      "@workspace/foundation-agent",
      "@workspace/foundation-autonomous",
      "@workspace/foundation-skills",
    ]);

    expect(seeds).toHaveLength(33);
    expect(NATIVE_PLUGIN_CATEGORIES).toEqual([
      "foundation",
      "providers",
      "messaging",
      "knowledge",
      "browser",
      "media",
      "research",
      "execution",
      "integration",
      "automation",
      "product",
    ]);
    expect(seeds[0]).toMatchObject({
      id: "foundation.agent",
      category: "foundation",
      kind: "vendored",
      maturity: "alpha",
      enablement: "always",
    });
    expect(seeds[1]).toMatchObject({
      id: "foundation.autonomous",
      packageName: "@workspace/foundation-autonomous",
      category: "foundation",
    });
    expect(seeds.find((seed) => seed.id === "browser.browser")).toMatchObject({
      category: "browser",
      kind: "adapter",
      maturity: "alpha",
      persistence: "injected",
    });
    expect(
      seeds.find((seed) => seed.id === "research.autocoder"),
    ).toMatchObject({
      category: "research",
      kind: "adapter",
      maturity: "experimental",
      persistence: "injected",
    });
    expect(
      seeds.find((seed) => seed.id === "product.doolittle-runtime"),
    ).toMatchObject({
      category: "product",
      kind: "adapter",
      maturity: "alpha",
      persistence: "injected",
    });
  });
});
