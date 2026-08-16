import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentExecutionContext } from "../chat";
import {
  buildProviderRuntimeSettings,
  syncProviderSettings,
} from "./model-settings";

describe("syncProviderSettings", () => {
  beforeEach(() => {
    vi.stubEnv("ELIZAOS_CLOUD_BASE_URL", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("normalizes eliza cloud settings and preserves configured small model", () => {
    const runtimeSettings = new Map<string, string>();
    const context = {
      runtime: {
        setSetting: (key: string, value: string) =>
          runtimeSettings.set(key, value),
        getSetting: (key: string) => runtimeSettings.get(key),
      },
      config: {
        elizaCloudSmallModel: "ec-small",
        elizaCloudLargeModel: "ec-large",
      },
      services: {
        settings: {
          get: () => ({
            model: {
              provider: "elizacloud",
              model: "ec-model",
              baseUrl: "https://my.cloud.test",
            },
          }),
        },
      },
    } as unknown as AgentExecutionContext;

    runtimeSettings.set("ELIZAOS_CLOUD_SMALL_MODEL", "preserved-small");
    syncProviderSettings(context, context.services.settings.get());

    expect(runtimeSettings.get("ELIZAOS_CLOUD_ENABLED")).toBe("true");
    expect(runtimeSettings.get("ELIZAOS_CLOUD_SMALL_MODEL")).toBe(
      "preserved-small",
    );
    expect(runtimeSettings.get("ELIZAOS_CLOUD_LARGE_MODEL")).toBe("ec-model");
    expect(runtimeSettings.get("ELIZAOS_CLOUD_BASE_URL")).toBe(
      "https://my.cloud.test/api/v1",
    );
  });

  it("maps non-eliza providers to openai env settings", () => {
    const runtimeSettings = new Map<string, string>();
    const context = {
      runtime: {
        setSetting: (key: string, value: string) =>
          runtimeSettings.set(key, value),
        getSetting: (key: string) => runtimeSettings.get(key),
      },
      config: {
        elizaCloudSmallModel: "ec-small",
        elizaCloudLargeModel: "ec-large",
      },
      services: {
        settings: {
          get: () => ({
            model: {
              provider: "openai",
              model: "gpt-openai",
              baseUrl: "https://openai.local",
            },
          }),
        },
      },
    } as unknown as AgentExecutionContext;

    syncProviderSettings(context, context.services.settings.get());

    expect(runtimeSettings.get("ELIZAOS_CLOUD_ENABLED")).toBe("false");
    expect(runtimeSettings.get("OPENAI_SMALL_MODEL")).toBe("gpt-openai");
    expect(runtimeSettings.get("OPENAI_LARGE_MODEL")).toBe("gpt-openai");
    expect(runtimeSettings.get("OPENAI_BASE_URL")).toBe("https://openai.local");
  });

  it("projects the selected OpenAI reasoning effort into the current turn", () => {
    const settings = {
      model: {
        provider: "openai",
        model: "gpt-5.4",
        baseUrl: "https://api.openai.com/v1",
        reasoningEffort: "high",
      },
    } as ReturnType<AgentExecutionContext["services"]["settings"]["get"]>;
    const context = {
      runtime: { getSetting: () => undefined },
      config: {},
      services: { settings: { get: () => settings } },
    } as unknown as AgentExecutionContext;

    const runtimeSettings = buildProviderRuntimeSettings(context, settings);

    expect(runtimeSettings.get("OPENAI_REASONING_EFFORT")).toBe("high");
  });

  it("shadows a cleared or unsupported OpenAI reasoning effort", () => {
    const context = {
      runtime: { getSetting: () => undefined },
      config: {},
      services: { settings: { get: () => undefined } },
    } as unknown as AgentExecutionContext;

    for (const reasoningEffort of [undefined, "xhigh"]) {
      const settings = {
        model: {
          provider: "openai",
          model: "gpt-5.4",
          baseUrl: "https://api.openai.com/v1",
          reasoningEffort,
        },
      } as ReturnType<AgentExecutionContext["services"]["settings"]["get"]>;

      expect(
        buildProviderRuntimeSettings(context, settings).get(
          "OPENAI_REASONING_EFFORT",
        ),
      ).toBeNull();
    }
  });

  it("shadows OpenAI reasoning effort after switching to another provider", () => {
    const settings = {
      model: {
        provider: "codex",
        model: "gpt-5.4",
        baseUrl: "https://ignored.example",
        reasoningEffort: "high",
      },
    } as ReturnType<AgentExecutionContext["services"]["settings"]["get"]>;
    const context = {
      runtime: { getSetting: () => undefined },
      config: {},
      services: { settings: { get: () => settings } },
    } as unknown as AgentExecutionContext;

    const runtimeSettings = buildProviderRuntimeSettings(context, settings);

    expect(runtimeSettings.get("CODEX_MODEL")).toBe("gpt-5.4");
    expect(runtimeSettings.get("OPENAI_REASONING_EFFORT")).toBeNull();
  });

  it("keeps the selected Codex reasoning effort in the scoped runtime settings envelope", () => {
    const settings = {
      model: {
        provider: "codex",
        model: "gpt-5.6-sol",
        baseUrl: "https://ignored.example",
        reasoningEffort: "max",
      },
    } as ReturnType<AgentExecutionContext["services"]["settings"]["get"]>;
    const context = {
      runtime: { getSetting: () => undefined },
      config: {},
      services: { settings: { get: () => settings } },
    } as unknown as AgentExecutionContext;

    const envelope = buildProviderRuntimeSettings(context, settings).get(
      "runtimeSettings",
    );

    expect(JSON.parse(String(envelope))).toMatchObject({
      model: { provider: "codex", reasoningEffort: "max" },
    });
  });

  it("maps Codex selection to the official Eliza Codex plugin settings", () => {
    const runtimeSettings = new Map<string, string>();
    const context = {
      runtime: {
        setSetting: (key: string, value: string) =>
          runtimeSettings.set(key, value),
        getSetting: (key: string) => runtimeSettings.get(key),
      },
      config: {
        elizaCloudSmallModel: "ec-small",
        elizaCloudLargeModel: "ec-large",
      },
      services: {
        settings: {
          get: () => ({
            model: {
              provider: "codex",
              model: "gpt-5.4",
              baseUrl: "https://ignored.example",
            },
          }),
        },
      },
    } as unknown as AgentExecutionContext;

    syncProviderSettings(context, context.services.settings.get());

    expect(runtimeSettings.get("CODEX_MODEL")).toBe("gpt-5.4");
    expect(runtimeSettings.get("CODEX_BASE_URL")).toBe(
      "https://chatgpt.com/backend-api/codex",
    );
    expect(runtimeSettings.has("OPENAI_API_KEY")).toBe(false);
    expect(runtimeSettings.has("OPENAI_BASE_URL")).toBe(false);
  });

  it("maps an Ollama route selection to every text model slot", () => {
    const runtimeSettings = new Map<string, string>();
    const context = {
      runtime: {
        setSetting: (key: string, value: string) =>
          runtimeSettings.set(key, value),
        getSetting: (key: string) => runtimeSettings.get(key),
      },
      config: {
        elizaCloudSmallModel: "ec-small",
        elizaCloudLargeModel: "ec-large",
      },
      services: {
        settings: {
          get: () => ({
            model: {
              provider: "ollama",
              model: "qwen3:8b",
              baseUrl: "http://127.0.0.1:11434/api",
            },
          }),
        },
      },
    } as unknown as AgentExecutionContext;

    syncProviderSettings(context, context.services.settings.get());

    for (const key of [
      "OLLAMA_NANO_MODEL",
      "OLLAMA_SMALL_MODEL",
      "OLLAMA_MEDIUM_MODEL",
      "OLLAMA_LARGE_MODEL",
      "OLLAMA_MEGA_MODEL",
      "OLLAMA_RESPONSE_HANDLER_MODEL",
      "OLLAMA_SHOULD_RESPOND_MODEL",
      "OLLAMA_ACTION_PLANNER_MODEL",
      "OLLAMA_PLANNER_MODEL",
    ]) {
      expect(runtimeSettings.get(key)).toBe("qwen3:8b");
    }
    expect(runtimeSettings.get("OLLAMA_API_ENDPOINT")).toBe(
      "http://127.0.0.1:11434/api",
    );
  });

  it("routes linked Claude OAuth through the official Anthropic plugin mode", () => {
    const settings = {
      model: {
        provider: "claude-code",
        model: "claude-sonnet-4.6",
        baseUrl: "",
      },
    } as ReturnType<AgentExecutionContext["services"]["settings"]["get"]>;
    const context = {
      runtime: { getSetting: () => undefined },
      config: { claudeCodeCliFallback: true },
      services: { settings: { get: () => settings } },
    } as unknown as AgentExecutionContext;

    const runtimeSettings = buildProviderRuntimeSettings(context, settings, {
      claudeCodeAccessTokenIsExpiring: () => false,
      getLinkedClaudeCodeCredentials: () => ({
        accessToken: "linked-oauth-token",
      }),
    });

    expect(runtimeSettings.get("ANTHROPIC_AUTH_MODE")).toBe("oauth");
  });

  it("uses the narrow Claude CLI bridge only without reusable OAuth", () => {
    const settings = {
      model: {
        provider: "claude-code",
        model: "claude-sonnet-4.6",
        baseUrl: "",
      },
    } as ReturnType<AgentExecutionContext["services"]["settings"]["get"]>;
    const context = {
      runtime: { getSetting: () => undefined },
      config: { claudeCodeCliFallback: true },
      services: { settings: { get: () => settings } },
    } as unknown as AgentExecutionContext;

    const runtimeSettings = buildProviderRuntimeSettings(context, settings, {
      claudeCodeAccessTokenIsExpiring: () => false,
      getLinkedClaudeCodeCredentials: () => undefined,
    });

    expect(runtimeSettings.get("ANTHROPIC_AUTH_MODE")).toBe("claude-cli");
  });

  it("uses the CLI fallback for an expired linked token when explicitly enabled", () => {
    const settings = {
      model: {
        provider: "claude-code",
        model: "claude-sonnet-4.6",
        baseUrl: "",
      },
    } as ReturnType<AgentExecutionContext["services"]["settings"]["get"]>;
    const context = {
      runtime: { getSetting: () => undefined },
      config: { claudeCodeCliFallback: true },
      services: { settings: { get: () => settings } },
    } as unknown as AgentExecutionContext;

    const runtimeSettings = buildProviderRuntimeSettings(context, settings, {
      claudeCodeAccessTokenIsExpiring: () => true,
      getLinkedClaudeCodeCredentials: () => ({
        accessToken: "expired-oauth-token",
        expiresAt: "1",
      }),
    });

    expect(runtimeSettings.get("ANTHROPIC_AUTH_MODE")).toBe("claude-cli");
  });
});
