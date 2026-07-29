import {
  type IAgentRuntime,
  type Memory,
  runShortcutGate,
  ShortcutRegistry,
  type UUID,
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
    expect(aliases).toContain("/codegen");
    expect(aliases).toContain("/session");
    expect(aliases).toContain("/voice");
    expect(aliases).toContain("/migration");
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
    const callback = vi.fn(async () => []);
    await expect(
      action.handler(runtime, input, undefined, undefined, callback),
    ).resolves.toMatchObject({
      success: true,
      text: "Runtime is ready.",
      userFacingText: "Runtime is ready.",
      verifiedUserFacing: true,
    });
    expect(callback).toHaveBeenCalledWith({
      text: "Runtime is ready.",
      source: "doolittle-command",
    });
    expect(executeSlashCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "/status",
        source: "api",
      }),
      expect.objectContaining({ config, runtime }),
    );
  });

  it("resolves explicit commands through Eliza's pre-LLM shortcut gate", async () => {
    const action = createCommandAction({} as AppServices, config);
    const shortcutRegistry = new ShortcutRegistry();
    shortcutRegistry.register(createCommandShortcut(config.workspaceDir));
    const id = "00000000-0000-4000-8000-000000000001" as UUID;
    const input = message("/status");
    const runtime = {
      actions: [action],
      agentId: id,
      shortcutRegistry,
      logger: { warn: vi.fn(), debug: vi.fn() },
      emitEvent: vi.fn(async () => undefined),
    };

    const result = await runShortcutGate({
      runtime: runtime as never,
      message: input,
      state: {} as never,
      responseId: id,
      senderRole: "OWNER",
    });

    expect(result?.kind).toBe("direct_reply");
    if (result?.kind !== "direct_reply") {
      throw new Error(
        "Expected the SDK shortcut gate to return a direct command reply.",
      );
    }
    expect(result.result.responseContent?.text).toBe("Runtime is ready.");
  });
});
