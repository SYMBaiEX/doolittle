import { ModelType } from "@elizaos/core";
import { describe, expect, it } from "vitest";
import {
  installDynamicModelProviderRouting,
  resolveModelProviderPlugin,
} from "./model-provider-routing";

describe("resolveModelProviderPlugin", () => {
  it("maps active providers to their registered Eliza plugin", () => {
    expect(
      resolveModelProviderPlugin({
        modelType: ModelType.TEXT_LARGE,
        activeProvider: "claude-code",
      }),
    ).toBe("@elizaos/plugin-claude-code");
    expect(
      resolveModelProviderPlugin({
        modelType: ModelType.RESPONSE_HANDLER,
        activeProvider: "ollama",
      }),
    ).toBe("ollama");
  });

  it("preserves explicit SDK routing and leaves embeddings unpinned", () => {
    expect(
      resolveModelProviderPlugin({
        modelType: ModelType.TEXT_LARGE,
        activeProvider: "claude-code",
        requestedProvider: "@custom/provider",
      }),
    ).toBe("@custom/provider");
    expect(
      resolveModelProviderPlugin({
        modelType: ModelType.TEXT_EMBEDDING,
        activeProvider: "claude-code",
      }),
    ).toBeUndefined();
  });
});

describe("installDynamicModelProviderRouting", () => {
  it("routes consecutive turns through newly selected providers", async () => {
    let activeProvider = "ollama";
    const routedProviders: Array<string | undefined> = [];
    const useModel = async (
      _modelType: string,
      _params: unknown,
      provider?: string,
    ) => {
      routedProviders.push(provider);
      return "response";
    };
    const runtime = { useModel };

    installDynamicModelProviderRouting(runtime as never, () => activeProvider);

    await runtime.useModel(ModelType.TEXT_LARGE, { prompt: "first" });
    activeProvider = "claude-code";
    await runtime.useModel(ModelType.TEXT_LARGE, { prompt: "second" });
    activeProvider = "codex";
    await runtime.useModel(ModelType.RESPONSE_HANDLER, { prompt: "third" });

    expect(routedProviders).toEqual([
      "ollama",
      "@elizaos/plugin-claude-code",
      "@elizaos/plugin-codex",
    ]);
  });
});
