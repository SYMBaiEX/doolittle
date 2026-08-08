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
      seeds.find((seed) => seed.id === "foundation.secrets"),
    ).toMatchObject({
      packageName: "@elizaos/core",
      category: "foundation",
      source: "official",
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
      seeds.find((seed) => seed.id === "execution.native-forms"),
    ).toMatchObject({
      packageName: "@elizaos/plugin-form",
      category: "execution",
      source: "official",
      persistence: "injected",
    });
    expect(seeds.find((seed) => seed.id === "execution.github")).toMatchObject({
      packageName: "@elizaos/plugin-github",
      category: "execution",
      source: "official",
    });
    expect(
      seeds.find((seed) => seed.id === "execution.agent-orchestrator"),
    ).toMatchObject({
      packageName: "@elizaos/plugin-agent-orchestrator",
      category: "execution",
      source: "official",
      kind: "adapter",
    });
    expect(seeds.find((seed) => seed.id === "execution.mcp")).toMatchObject({
      packageName: "@elizaos/plugin-mcp",
      category: "execution",
      source: "official",
      kind: "adapter",
    });
    expect(seeds.find((seed) => seed.id === "browser.official")).toMatchObject({
      packageName: "@elizaos/plugin-browser",
      category: "browser",
      source: "official",
      enablement: "always",
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
