import type { EnvConfig } from "@doolittle/agent/plugin-api";
import {
  DOOLITTLE_AUTOMATION_SERVICE,
  DOOLITTLE_AWARENESS_SERVICE,
  DOOLITTLE_BROWSER_SERVICE,
  DOOLITTLE_GATEWAY_SERVICE,
  DOOLITTLE_MCP_SERVICE,
  DOOLITTLE_SCHEDULER_SERVICE,
  DOOLITTLE_SHELL_SERVICE,
  DOOLITTLE_WORKFLOW_DISPATCH_SERVICE,
} from "@doolittle/contracts";
import { type Action, ModelType } from "@elizaos/core";
import { describe, expect, it } from "vitest";
import { DOOLITTLE_MODEL_ROUTER_PRIORITY } from "./model-router";
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

describe("createDoolittlePlugin model ownership", () => {
  it("registers native text routing online and guarded models during offline bootstrap", () => {
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
      expect(onlinePlugin.models?.[modelType]).toBeTypeOf("function");
    }
    expect(offlinePlugin.priority).toBe(DOOLITTLE_MODEL_ROUTER_PRIORITY);
    expect(onlinePlugin.models?.[ModelType.TEXT_EMBEDDING]).toBeUndefined();
    expect(onlinePlugin.priority).toBe(DOOLITTLE_MODEL_ROUTER_PRIORITY);
  });

  it("registers web and command routing through Eliza actions and shortcuts", () => {
    const plugin = createDoolittlePlugin({
      services: {} as never,
      config: createConfig({ offlineBootstrapMode: false }),
    });

    expect(plugin.actions?.map((action) => action.name)).toEqual(
      expect.arrayContaining([
        "MEMORY",
        "SHELL",
        "WEB_SEARCH",
        "WEB_FETCH",
        "DOOLITTLE_COMMAND",
        "DOOLITTLE_SHELL_SHORTCUT",
      ]),
    );
    expect(plugin.actions?.map((action) => action.name)).not.toContain(
      "RUN_IN_TERMINAL",
    );
    expect(plugin.actions?.map((action) => action.name)).not.toContain(
      "DOOLITTLE_MEMORY",
    );
    expect(
      plugin.actions?.every(
        (action) =>
          (action as Action & { pluginId?: string }).pluginId ===
          "doolittle-runtime",
      ),
    ).toBe(true);
    expect(
      plugin.actions
        ?.find((action) => action.name === "SHELL")
        ?.similes?.includes("RUN_IN_TERMINAL"),
    ).toBe(true);
    expect(plugin.shortcuts?.map((shortcut) => shortcut.id)).toEqual([
      "doolittle-web-search-command",
      "doolittle-research-command",
      "doolittle-shell-command",
      "doolittle-command-catalog",
    ]);
    expect(plugin.services?.map((service) => service.serviceType)).toEqual(
      expect.arrayContaining([
        "memoryStorage",
        DOOLITTLE_AWARENESS_SERVICE,
        DOOLITTLE_BROWSER_SERVICE,
        DOOLITTLE_GATEWAY_SERVICE,
        DOOLITTLE_MCP_SERVICE,
        DOOLITTLE_SCHEDULER_SERVICE,
        DOOLITTLE_SHELL_SERVICE,
        DOOLITTLE_WORKFLOW_DISPATCH_SERVICE,
        DOOLITTLE_AUTOMATION_SERVICE,
      ]),
    );
  });
});
