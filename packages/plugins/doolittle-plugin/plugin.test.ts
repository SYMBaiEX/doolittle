import type { EnvConfig } from "@doolittle/agent/plugin-api";
import {
  DOOLITTLE_AUTOMATION_SERVICE,
  DOOLITTLE_GATEWAY_SERVICE,
  DOOLITTLE_SCHEDULER_SERVICE,
  DOOLITTLE_WORKFLOW_DISPATCH_SERVICE,
} from "@doolittle/contracts";
import { ModelType } from "@elizaos/core";
import { describe, expect, it } from "vitest";
import { OFFLINE_BOOTSTRAP_EMBEDDING_PRIORITY } from "./model-fallback";
import { createDoolittlePlugin } from "./plugin";

function createConfig(overrides: Partial<EnvConfig> = {}): EnvConfig {
  return {
    dataDir: "/tmp/doolittle-data",
    workspaceDir: "/tmp/doolittle-workspace",
    discordBotToken: "",
    telegramBotToken: "",
    falApiKey: "",
    openAiApiKey: "",
    ...overrides,
  } as EnvConfig;
}

describe("createDoolittlePlugin offline bootstrap", () => {
  it("registers high-priority embedding and text guards only in offline bootstrap mode", () => {
    const offlinePlugin = createDoolittlePlugin({
      services: {} as never,
      config: createConfig({ offlineBootstrapMode: true }),
    });
    const onlinePlugin = createDoolittlePlugin({
      services: {} as never,
      config: createConfig({ offlineBootstrapMode: false }),
    });

    expect(offlinePlugin.models?.[ModelType.TEXT_EMBEDDING]).toBeTypeOf(
      "function",
    );
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
      expect(offlinePlugin.models?.[modelType]).toBeTypeOf("function");
      expect(onlinePlugin.models?.[modelType]).toBeUndefined();
    }
    expect(offlinePlugin.priority).toBe(OFFLINE_BOOTSTRAP_EMBEDDING_PRIORITY);
    expect(onlinePlugin.models?.[ModelType.TEXT_EMBEDDING]).toBeUndefined();
    expect(onlinePlugin.priority).toBeUndefined();
  });

  it("registers web and command routing through Eliza actions and shortcuts", () => {
    const plugin = createDoolittlePlugin({
      services: {} as never,
      config: createConfig({ offlineBootstrapMode: false }),
    });

    expect(plugin.actions?.map((action) => action.name)).toEqual(
      expect.arrayContaining(["WEB_SEARCH", "WEB_FETCH", "DOOLITTLE_COMMAND"]),
    );
    expect(plugin.shortcuts?.map((shortcut) => shortcut.id)).toEqual([
      "doolittle-web-search-command",
      "doolittle-research-command",
      "doolittle-command-catalog",
    ]);
    expect(plugin.services?.map((service) => service.serviceType)).toEqual(
      expect.arrayContaining([
        "memoryStorage",
        DOOLITTLE_GATEWAY_SERVICE,
        DOOLITTLE_SCHEDULER_SERVICE,
        DOOLITTLE_WORKFLOW_DISPATCH_SERVICE,
        DOOLITTLE_AUTOMATION_SERVICE,
      ]),
    );
  });
});
