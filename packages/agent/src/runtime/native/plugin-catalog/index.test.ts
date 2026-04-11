import { describe, expect, it } from "bun:test";
import type { NativePluginDescriptor } from "@doolittle/contracts";
import type { EnvConfig } from "@/types/runtime";
import {
  getNativePluginCatalog,
  groupNativePluginCatalog,
  listNativePluginCategories,
} from "./index";

describe("listNativePluginCategories", () => {
  it("returns the native plugin categories in catalog order", () => {
    expect(listNativePluginCategories()).toEqual([
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
  });
});

describe("groupNativePluginCatalog", () => {
  it("groups plugins by category and preserves input order within each group", () => {
    const catalog: NativePluginDescriptor[] = [
      {
        id: "foundation",
        packageName: "@example/foundation",
        category: "foundation",
        source: "official",
        kind: "adapter",
        maturity: "alpha",
        enabled: true,
        persistence: "none",
        notes: "",
      },
      {
        id: "provider",
        packageName: "@example/provider",
        category: "providers",
        source: "official",
        kind: "provider",
        maturity: "production",
        enabled: true,
        persistence: "none",
        notes: "",
      },
      {
        id: "provider-2",
        packageName: "@example/provider-2",
        category: "providers",
        source: "vendored",
        kind: "provider",
        maturity: "alpha",
        enabled: false,
        persistence: "injected",
        notes: "",
      },
    ];

    const grouped = groupNativePluginCatalog(catalog);

    expect(Object.keys(grouped)).toEqual(listNativePluginCategories());
    expect(grouped.foundation.map((entry) => entry.id)).toEqual(["foundation"]);
    expect(grouped.providers.map((entry) => entry.id)).toEqual([
      "provider",
      "provider-2",
    ]);
    expect(grouped.execution).toEqual([]);
  });
});

describe("getNativePluginCatalog", () => {
  it("applies config-gated enablement while preserving static descriptor metadata", () => {
    const catalog = getNativePluginCatalog({
      elizaCloudApiKey: "cloud-key",
      elizaCloudEnabled: false,
      useLinkedCodexAuth: true,
      useLinkedClaudeCodeAuth: false,
      openAiApiKey: "openai-key",
      anthropicApiKey: "",
      telegramBotToken: "telegram-token",
      discordBotToken: "",
    } as EnvConfig);

    expect(
      catalog.find((entry) => entry.id === "providers.elizacloud"),
    ).toMatchObject({
      category: "providers",
      source: "custom",
      kind: "provider",
      maturity: "alpha",
      enabled: true,
    });
    expect(
      catalog.find((entry) => entry.id === "providers.codex")?.enabled,
    ).toBe(true);
    expect(
      catalog.find((entry) => entry.id === "providers.claude-code")?.enabled,
    ).toBe(false);
    expect(
      catalog.find((entry) => entry.id === "providers.openai")?.enabled,
    ).toBe(true);
    expect(
      catalog.find((entry) => entry.id === "providers.anthropic")?.enabled,
    ).toBe(false);
    expect(
      catalog.find((entry) => entry.id === "messaging.telegram")?.enabled,
    ).toBe(true);
    expect(
      catalog.find((entry) => entry.id === "messaging.discord")?.enabled,
    ).toBe(false);
    expect(
      catalog.find((entry) => entry.id === "browser.browser")?.persistence,
    ).toBe("injected");
    expect(
      catalog.find((entry) => entry.id === "product.doolittle-runtime"),
    ).toMatchObject({
      category: "product",
      source: "custom",
      kind: "adapter",
      enabled: true,
    });
  });
});
