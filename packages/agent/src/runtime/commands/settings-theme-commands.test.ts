import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentExecutionContext } from "../chat";
import { handleSettingsThemeCommand } from "./settings-theme-commands";

const accountPool = vi.hoisted(() => ({
  applyAccountPoolApiCredentials: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/runtime/native/account-pool", () => accountPool);

describe("settings and theme command router", () => {
  beforeEach(() => {
    accountPool.applyAccountPoolApiCredentials
      .mockReset()
      .mockResolvedValue(undefined);
  });

  it("updates model settings, previews execution, and rotates themes", async () => {
    const runtimeSettings: Record<string, string> = {};
    const state = {
      model: {
        provider: "openai",
        model: "gpt-5.4",
        baseUrl: "https://api.openai.com/v1",
        temperature: 0.2,
      },
      execution: {
        backend: "local",
      },
      ui: {
        theme: "orange",
      },
    };
    const context = {
      config: {
        elizaCloudSmallModel: "small",
        elizaCloudLargeModel: "large",
        elizaCloudBaseUrl: "https://cloud.eliza.test",
        ollamaApiEndpoint: "http://localhost:11434/api",
        ollamaLargeModel: "granite4.1:3b",
        ollamaEmbeddingModel: "nomic-embed-text:latest",
        devinModel: "swe-1-6-fast",
      },
      runtime: {
        setSetting: (key: string, value: string) => {
          runtimeSettings[key] = value;
        },
        getSetting: (key: string) => runtimeSettings[key],
      },
      services: {
        settings: {
          get: () => JSON.parse(JSON.stringify(state)),
          set: (path: string, value: unknown) => {
            const [, field] = path.split(".");
            if (path.startsWith("model.")) {
              (state.model as Record<string, unknown>)[field ?? ""] = value;
            }
            if (path.startsWith("ui.")) {
              (state.ui as Record<string, unknown>)[field ?? ""] = value;
            }
            if (path.startsWith("execution.")) {
              (state.execution as Record<string, unknown>)[field ?? ""] = value;
            }
            return JSON.parse(JSON.stringify(state));
          },
        },
        terminal: {
          preview: (command: string) => ({ command, safe: true }),
          health: async () => [],
          status: () => ({ backend: "local" }),
        },
      },
    } as unknown as AgentExecutionContext;

    const model = await handleSettingsThemeCommand(
      "/model set temperature 0.7",
      context,
    );
    const modelList = await handleSettingsThemeCommand("/model list", context);
    const modelUse = await handleSettingsThemeCommand(
      "/model use ollama granite4.1:3b",
      context,
    );
    const preview = await handleSettingsThemeCommand(
      "/execution preview pwd",
      context,
    );
    const theme = await handleSettingsThemeCommand("/theme set ember", context);

    expect(model).toContain('"temperature": 0.7');
    expect(modelList).toContain("ollama");
    expect(modelUse).toContain("Activated Ollama");
    expect(preview).toContain('"command": "pwd"');
    expect(theme).toContain('"theme": "ember"');
    expect(runtimeSettings.OLLAMA_LARGE_MODEL).toBe("granite4.1:3b");
  });

  it("projects direct API credentials for CLI model route changes", async () => {
    const state = {
      model: {
        provider: "openai",
        model: "gpt-5.4",
        baseUrl: "https://api.openai.com/v1",
      },
      execution: { backend: "local" },
      ui: { theme: "orange" },
    };
    const context = {
      config: {
        elizaCloudSmallModel: "small",
        elizaCloudLargeModel: "large",
        elizaCloudBaseUrl: "https://cloud.eliza.test",
        ollamaApiEndpoint: "http://localhost:11434/api",
        ollamaLargeModel: "granite4.1:3b",
        ollamaEmbeddingModel: "nomic-embed-text:latest",
        devinModel: "swe-1-6-fast",
      },
      runtime: { setSetting: vi.fn(), getSetting: vi.fn() },
      services: {
        settings: {
          get: () => JSON.parse(JSON.stringify(state)),
          set: (path: string, value: unknown) => {
            const [, field] = path.split(".");
            if (path.startsWith("model.")) {
              (state.model as Record<string, unknown>)[field ?? ""] = value;
            }
            return JSON.parse(JSON.stringify(state));
          },
        },
      },
    } as unknown as AgentExecutionContext;

    await handleSettingsThemeCommand("/model set provider openai", context);
    await handleSettingsThemeCommand("/model set provider anthropic", context);
    await handleSettingsThemeCommand("/model use ollama", context);

    expect(accountPool.applyAccountPoolApiCredentials).toHaveBeenNthCalledWith(
      1,
      { activeBackend: "openai" },
    );
    expect(accountPool.applyAccountPoolApiCredentials).toHaveBeenNthCalledWith(
      2,
      { activeBackend: "anthropic" },
    );
    expect(accountPool.applyAccountPoolApiCredentials).toHaveBeenLastCalledWith(
      { activeBackend: "ollama" },
    );
  });

  it("reports account-pool projection failures without throwing from the CLI", async () => {
    accountPool.applyAccountPoolApiCredentials.mockRejectedValueOnce(
      new Error("credential projection failed"),
    );
    const context = {
      config: {},
      runtime: { setSetting: vi.fn(), getSetting: vi.fn() },
      services: {
        settings: {
          get: () => ({ model: { provider: "openai", model: "gpt-5.4" } }),
          set: vi.fn(),
        },
      },
    } as unknown as AgentExecutionContext;

    await expect(
      handleSettingsThemeCommand("/model set provider openai", context),
    ).resolves.toBe(
      "Unable to apply model settings: credential projection failed",
    );
  });
});
