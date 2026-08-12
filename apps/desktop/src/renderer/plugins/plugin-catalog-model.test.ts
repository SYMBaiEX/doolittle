import { describe, expect, it } from "vitest";
import {
  buildPluginCatalogEntries,
  pluginDisplayTitle,
} from "./plugin-catalog-model";

describe("buildPluginCatalogEntries", () => {
  it("groups plugins while keeping the useful row facts visible", () => {
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
        group: "Providers",
        title: "OpenAI Model",
        description: "Adds OpenAI model support.",
        descriptionMode: "inline",
        status: undefined,
        tone: undefined,
        code: "@elizaos/plugin-openai",
        meta: "Official · Stable",
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

  it("does not invent unknown metadata", () => {
    expect(
      buildPluginCatalogEntries([
        { id: "local-extension", category: "custom", enabled: false },
      ])[0],
    ).toMatchObject({
      group: "Custom",
      meta: undefined,
      status: "Inactive",
      tone: "warn",
    });
  });
});
