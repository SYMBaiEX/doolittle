import {
  type IAgentRuntime,
  ModelType,
  NoModelProviderConfiguredError,
} from "@elizaos/core";
import { describe, expect, it } from "vitest";
import {
  createSelectedProviderModels,
  createSelectedProviderResearchModel,
  createSelectedProviderTextModel,
  createSelectedProviderTextModels,
  resolveSelectedModelProviderPlugin,
} from "./model-router";

describe("resolveSelectedModelProviderPlugin", () => {
  it.each([
    ["ollama", "ollama"],
    ["elizacloud", "elizaOSCloud"],
    ["codex", "codex-cli"],
    ["claude-code", "anthropic"],
    ["devin", "@doolittle/plugin-devin"],
    ["openai", "openai"],
    ["anthropic", "anthropic"],
  ])("maps %s to its registered Eliza plugin", (provider, plugin) => {
    expect(resolveSelectedModelProviderPlugin(provider)).toBe(plugin);
  });

  it("keeps only explicit Claude CLI fallback on the Doolittle bridge", () => {
    expect(
      resolveSelectedModelProviderPlugin("claude-code", "claude-cli"),
    ).toBe("@doolittle/plugin-claude-code");
    expect(resolveSelectedModelProviderPlugin("claude-code", "oauth")).toBe(
      "anthropic",
    );
  });

  it("preserves extension provider names and rejects empty selections", () => {
    expect(resolveSelectedModelProviderPlugin("@custom/provider")).toBe(
      "@custom/provider",
    );
    expect(resolveSelectedModelProviderPlugin("  ")).toBeUndefined();
    expect(resolveSelectedModelProviderPlugin(undefined)).toBeUndefined();
  });
});

describe("createSelectedProviderTextModel", () => {
  it("routes consecutive calls through the currently selected provider", async () => {
    let activeProvider = "ollama";
    let anthropicAuthMode: string | undefined;
    const routedProviders: string[] = [];
    const runtime = {
      getSetting: (key: string) => {
        if (key === "runtimeSettings") {
          return JSON.stringify({ model: { provider: activeProvider } });
        }
        return key === "ANTHROPIC_AUTH_MODE" ? anthropicAuthMode : undefined;
      },
      useModel: async (
        _modelType: string,
        _params: unknown,
        provider: string,
      ) => {
        routedProviders.push(provider);
        return `response from ${provider}`;
      },
    } as unknown as IAgentRuntime;
    const model = createSelectedProviderTextModel(ModelType.RESPONSE_HANDLER);

    await expect(model(runtime, { prompt: "first" })).resolves.toBe(
      "response from ollama",
    );
    activeProvider = "claude-code";
    await expect(model(runtime, { prompt: "second" })).resolves.toBe(
      "response from anthropic",
    );
    anthropicAuthMode = "claude-cli";
    await expect(model(runtime, { prompt: "fallback" })).resolves.toBe(
      "response from @doolittle/plugin-claude-code",
    );
    activeProvider = "codex";
    await expect(model(runtime, { prompt: "third" })).resolves.toBe(
      "response from codex-cli",
    );

    expect(routedProviders).toEqual([
      "ollama",
      "anthropic",
      "@doolittle/plugin-claude-code",
      "codex-cli",
    ]);
  });

  it("keeps the model type and structured params intact", async () => {
    const params = {
      messages: [{ role: "user", content: "inspect this" }],
      temperature: 0.2,
    };
    const runtime = {
      getSetting: () =>
        JSON.stringify({ model: { provider: "@custom/provider" } }),
      useModel: async (
        modelType: string,
        receivedParams: unknown,
        provider: string,
      ) => {
        expect(modelType).toBe(ModelType.ACTION_PLANNER);
        expect(receivedParams).toBe(params);
        expect(provider).toBe("@custom/provider");
        return "planned";
      },
    } as unknown as IAgentRuntime;

    await expect(
      createSelectedProviderTextModel(ModelType.ACTION_PLANNER)(
        runtime,
        params as never,
      ),
    ).resolves.toBe("planned");
  });

  it.each([undefined, "", "doolittle-runtime", "malformed-runtime-settings"])(
    "fails without recursively selecting itself for %s",
    async (provider) => {
      const runtime = {
        getSetting: () =>
          provider === "malformed-runtime-settings"
            ? "{invalid"
            : JSON.stringify({ model: { provider } }),
        useModel: async () => {
          throw new Error("must not delegate");
        },
      } as unknown as IAgentRuntime;

      await expect(
        createSelectedProviderTextModel(ModelType.TEXT_LARGE)(runtime, {
          prompt: "hello",
        }),
      ).rejects.toBeInstanceOf(NoModelProviderConfiguredError);
    },
  );
});

describe("createSelectedProviderTextModels", () => {
  it("covers Eliza's complete text generation surface", () => {
    const models = createSelectedProviderTextModels();

    for (const modelType of [
      ModelType.TEXT_NANO,
      ModelType.TEXT_SMALL,
      ModelType.TEXT_MEDIUM,
      ModelType.TEXT_LARGE,
      ModelType.TEXT_MEGA,
      ModelType.RESPONSE_HANDLER,
      ModelType.ACTION_PLANNER,
      ModelType.TEXT_REASONING_SMALL,
      ModelType.TEXT_REASONING_LARGE,
      ModelType.TEXT_COMPLETION,
    ]) {
      expect(models[modelType]).toBeTypeOf("function");
    }
  });
});

describe("createSelectedProviderResearchModel", () => {
  it("routes official deep research through the active provider", async () => {
    const params = {
      input: "Research official Eliza packages",
      tools: [{ type: "web_search_preview" as const }],
    };
    const runtime = {
      getSetting: () => JSON.stringify({ model: { provider: "elizacloud" } }),
      useModel: async (
        modelType: string,
        receivedParams: unknown,
        provider: string,
      ) => {
        expect(modelType).toBe(ModelType.RESEARCH);
        expect(receivedParams).toBe(params);
        expect(provider).toBe("elizaOSCloud");
        return {
          id: "research-1",
          text: "report",
          annotations: [],
          outputItems: [],
        };
      },
    } as unknown as IAgentRuntime;

    await expect(
      createSelectedProviderResearchModel()(runtime, params),
    ).resolves.toMatchObject({ id: "research-1", text: "report" });
  });

  it("registers research beside the complete text surface", () => {
    expect(createSelectedProviderModels()[ModelType.RESEARCH]).toBeTypeOf(
      "function",
    );
  });
});
