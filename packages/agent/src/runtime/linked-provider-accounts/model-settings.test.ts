import { describe, expect, it } from "bun:test";
import type { AgentExecutionContext } from "../chat";
import { syncProviderSettings } from "./model-settings";

describe("syncProviderSettings", () => {
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
});
