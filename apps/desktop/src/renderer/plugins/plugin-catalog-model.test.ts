import { describe, expect, it } from "vitest";
import { buildPluginCatalogEntries } from "./plugin-catalog-model";

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
        title: "Openai Model",
        description: "Adds OpenAI model support.",
        descriptionMode: "inline",
        status: undefined,
        tone: undefined,
        code: "@elizaos/plugin-openai",
        meta: "Official · Stable",
      },
    ]);
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
