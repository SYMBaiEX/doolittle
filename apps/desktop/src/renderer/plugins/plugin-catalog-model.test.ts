import { describe, expect, it } from "vitest";
import {
  buildPluginCatalogEntries,
  pluginDisplayTitle,
} from "./plugin-catalog-model";

describe("buildPluginCatalogEntries", () => {
  it("normalizes the runtime plugin facts used by the focused catalog", () => {
    expect(
      buildPluginCatalogEntries([
        {
          id: "openai-model",
          packageName: "@elizaos/plugin-openai",
          category: "providers",
          notes: "Adds OpenAI model support.",
          source: "official",
          maturity: "stable",
          enabled: true,
        },
      ]),
    ).toEqual([
      {
        id: "openai-model",
        title: "OpenAI Model",
        description: "Adds OpenAI model support.",
        packageName: "@elizaos/plugin-openai",
        category: "providers",
        source: "official",
        kind: "unknown",
        maturity: "stable",
        persistence: "none",
        enabled: true,
      },
    ]);
  });

  it("removes the repeated group prefix and preserves product acronyms", () => {
    expect(pluginDisplayTitle("providers-sql", "providers")).toBe("SQL");
    expect(pluginDisplayTitle("providers:pdf", "providers")).toBe("PDF");
    expect(pluginDisplayTitle("providers.elizacloud", "providers")).toBe(
      "Eliza Cloud",
    );
    expect(pluginDisplayTitle("providers/openai", "providers")).toBe("OpenAI");
    expect(pluginDisplayTitle("foundation_agent", "foundation")).toBe("Agent");
  });

  it("uses explicit neutral fallbacks instead of inventing plugin metadata", () => {
    expect(
      buildPluginCatalogEntries([
        { id: "local-extension", category: "custom", enabled: false },
      ])[0],
    ).toMatchObject({
      category: "custom",
      source: "unknown",
      kind: "unknown",
      maturity: "unknown",
      persistence: "none",
      enabled: false,
    });
  });
});
