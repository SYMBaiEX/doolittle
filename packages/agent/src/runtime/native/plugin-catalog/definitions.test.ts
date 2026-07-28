import { describe, expect, it } from "vitest";
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

    expect(seeds.length).toBeGreaterThan(0);
    expect(NATIVE_PLUGIN_CATEGORIES).toContain("foundation");
    expect(NATIVE_PLUGIN_CATEGORIES).toContain("execution");
    expect(NATIVE_PLUGIN_CATEGORIES).toContain("product");
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
    expect(
      seeds.find((seed) => seed.id === "research.autocoder"),
    ).toMatchObject({
      category: "research",
      kind: "adapter",
      maturity: "experimental",
      persistence: "injected",
    });
    expect(
      seeds.find((seed) => seed.id === "execution.agent-orchestrator"),
    ).toMatchObject({
      packageName: "@elizaos/plugin-agent-orchestrator",
      category: "execution",
      source: "official",
      kind: "adapter",
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
