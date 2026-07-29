import {
  type IAgentRuntime,
  type Memory,
  ShortcutRegistry,
} from "@elizaos/core";
import { describe, expect, it, vi } from "vitest";
import type { AppServices } from "@/services";
import type { EnvConfig } from "@/types/runtime";

const { executeSlashCommand } = vi.hoisted(() => ({
  executeSlashCommand: vi.fn(async () => "Runtime is ready."),
}));

vi.mock("@/runtime/chat", () => ({ executeSlashCommand }));

import {
  commandShortcutAliases,
  createCommandAction,
  createCommandShortcut,
  DOOLITTLE_COMMAND_ACTION,
} from "./command-action";

const config = {
  workspaceDir: "/workspace/project",
} as EnvConfig;

function message(text: string): Memory {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    entityId: "00000000-0000-4000-8000-000000000002",
    roomId: "00000000-0000-4000-8000-000000000003",
    content: { text },
    createdAt: Date.now(),
  } as Memory;
}

describe("SDK command action", () => {
  it("projects the runtime catalog into one explicit SDK shortcut", () => {
    const aliases = commandShortcutAliases(config.workspaceDir);
    expect(aliases).toContain("/commands");
    expect(aliases).toContain("/cron");
    expect(aliases).not.toContain("/web");
    expect(aliases.every((alias) => !alias.includes("<"))).toBe(true);
    expect(createCommandShortcut(config.workspaceDir)).toMatchObject({
      id: "doolittle-command-catalog",
      kind: "explicit",
      target: { kind: "action", name: DOOLITTLE_COMMAND_ACTION },
      aliases,
    });
  });

  it("returns command output as the verified SDK action reply", async () => {
    const action = createCommandAction({} as AppServices, config);
    const shortcutRegistry = new ShortcutRegistry();
    shortcutRegistry.register(createCommandShortcut(config.workspaceDir));
    const runtime = {
      actions: [action],
      shortcutRegistry,
    } as unknown as IAgentRuntime;
    const input = message("/status");

    await expect(action.validate(runtime, input)).resolves.toBe(true);
    await expect(
      action.validate(runtime, message("tell me the status")),
    ).resolves.toBe(false);
    await expect(action.handler(runtime, input)).resolves.toMatchObject({
      success: true,
      text: "Runtime is ready.",
      userFacingText: "Runtime is ready.",
      verifiedUserFacing: true,
    });
    expect(executeSlashCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "/status",
        source: "api",
      }),
      expect.objectContaining({ config, runtime }),
    );
  });
});
