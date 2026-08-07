import {
  DOOLITTLE_AUTOMATION_SERVICE,
  DOOLITTLE_AWARENESS_SERVICE,
  DOOLITTLE_BROWSER_SERVICE,
  DOOLITTLE_GATEWAY_SERVICE,
  DOOLITTLE_MCP_SERVICE,
  DOOLITTLE_SCHEDULER_SERVICE,
  DOOLITTLE_SECRETS_VAULT_SERVICE,
  DOOLITTLE_SHELL_SERVICE,
  DOOLITTLE_WORKFLOW_DISPATCH_SERVICE,
} from "@doolittle/contracts";
import type { Action } from "@elizaos/core";
import { describe, expect, it } from "vitest";
import type { AppServices } from "@/services";
import type { EnvConfig } from "@/types/runtime";
import { createDoolittleProductPlugin } from "./index";

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

describe("native Doolittle product plugin", () => {
  it("keeps application composition in the native registry", () => {
    const plugin = createDoolittleProductPlugin(
      {} as AppServices,
      createConfig({ offlineBootstrapMode: false }),
    );

    expect(plugin.actions?.map((action) => action.name)).toEqual(
      expect.arrayContaining([
        "DOOLITTLE_CODING",
        "MEMORY",
        "SHELL",
        "WEB_SEARCH",
        "WEB_FETCH",
        "DOOLITTLE_COMMAND",
        "DOOLITTLE_SHELL_SHORTCUT",
      ]),
    );
    expect(
      plugin.actions?.every(
        (action) =>
          (action as Action & { pluginId?: string }).pluginId ===
          "doolittle-runtime",
      ),
    ).toBe(true);
    expect(
      plugin.actions?.find((action) => action.name === "DOOLITTLE_CODING"),
    ).toMatchObject({
      contexts: ["code", "files"],
      subPlanner: expect.any(Object),
      subActions: expect.arrayContaining([
        "DOOLITTLE_WORKSPACE",
        "READ_FILE",
        "PATCH_FILE",
        "DOOLITTLE_REPOSITORY",
        "SHELL",
      ]),
    });
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
        DOOLITTLE_SECRETS_VAULT_SERVICE,
        DOOLITTLE_SHELL_SERVICE,
        DOOLITTLE_WORKFLOW_DISPATCH_SERVICE,
        DOOLITTLE_AUTOMATION_SERVICE,
      ]),
    );
  });
});
