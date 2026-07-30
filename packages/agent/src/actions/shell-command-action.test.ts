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

const {
  executeTerminalCommand,
  formatTerminalCommandResponse,
  requestTerminalCommandApproval,
} = vi.hoisted(() => ({
  executeTerminalCommand: vi.fn(async () => ({
    command: "pwd",
    exitCode: 0,
    stdout: "/workspace/project",
    stderr: "",
    cwd: "/workspace/project",
    durationMs: 12,
  })),
  formatTerminalCommandResponse: vi.fn(
    (result: { stdout: string }) => `Command output: ${result.stdout}`,
  ),
  requestTerminalCommandApproval: vi.fn(async () => undefined),
}));

vi.mock("@/runtime/commands/shell-command-facade", () => ({
  executeTerminalCommand,
  formatTerminalCommandResponse,
  requestTerminalCommandApproval,
}));

import {
  createShellCommandAction,
  createShellCommandShortcut,
  DOOLITTLE_SHELL_SHORTCUT_ACTION,
  parseExplicitShellCommand,
} from "./shell-command-action";

const config = { workspaceDir: "/workspace/project" } as EnvConfig;

function message(text: string, source = "cli"): Memory {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    entityId: "00000000-0000-4000-8000-000000000002",
    roomId: "00000000-0000-4000-8000-000000000003",
    content: { text, source },
    metadata: { sessionId: "session-1" },
    createdAt: Date.now(),
  } as Memory;
}

function services() {
  return {
    runController: {
      setPendingApprovals: vi.fn(),
    },
  } as unknown as AppServices;
}

describe("SDK shell shortcut action", () => {
  it("registers ! as a single explicit SDK shortcut and parses its command", () => {
    expect(createShellCommandShortcut()).toMatchObject({
      id: "doolittle-shell-command",
      kind: "explicit",
      aliases: ["!"],
      target: { kind: "action", name: DOOLITTLE_SHELL_SHORTCUT_ACTION },
    });
    expect(parseExplicitShellCommand(" ! pwd ")).toBe("pwd");
    expect(parseExplicitShellCommand("not a shell command")).toBeUndefined();
    const action = createShellCommandAction(services(), config);
    expect(action.suppressPostActionContinuation).toBe(true);
    expect(action.suppressEarlyReply).toBe(true);
  });

  it("returns a verified shell response through the registered service action", async () => {
    vi.clearAllMocks();
    const appServices = services();
    const action = createShellCommandAction(appServices, config);
    const shortcutRegistry = new ShortcutRegistry();
    shortcutRegistry.register(createShellCommandShortcut());
    const runtime = {
      actions: [action],
      shortcutRegistry,
    } as unknown as IAgentRuntime;
    const callback = vi.fn(async () => []);
    const input = message("! pwd");

    await expect(action.validate(runtime, input)).resolves.toBe(true);
    await expect(
      action.handler(runtime, input, undefined, undefined, callback),
    ).resolves.toMatchObject({
      success: true,
      text: "Command output: /workspace/project",
      userFacingText: "Command output: /workspace/project",
      verifiedUserFacing: true,
      data: expect.objectContaining({
        actionName: DOOLITTLE_SHELL_SHORTCUT_ACTION,
        command: "pwd",
      }),
    });
    expect(requestTerminalCommandApproval).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "! pwd",
        roomId: "session-1",
        source: "cli",
      }),
      expect.objectContaining({ config, runtime }),
      "pwd",
    );
    expect(executeTerminalCommand).toHaveBeenCalledWith(
      runtime,
      appServices,
      "pwd",
    );
    expect(callback).toHaveBeenCalledWith({
      text: "Command output: /workspace/project",
      source: "doolittle-shell-command",
    });
  });

  it("returns an approval prompt without invoking the shell service", async () => {
    vi.clearAllMocks();
    requestTerminalCommandApproval.mockResolvedValueOnce(
      "Remote execution approval required." as never,
    );
    const appServices = services();
    const action = createShellCommandAction(appServices, config);
    const shortcutRegistry = new ShortcutRegistry();
    shortcutRegistry.register(createShellCommandShortcut());
    const runtime = {
      actions: [action],
      shortcutRegistry,
    } as unknown as IAgentRuntime;
    const callback = vi.fn(async () => []);

    await expect(
      action.handler(
        runtime,
        message("! rm scratch"),
        undefined,
        undefined,
        callback,
      ),
    ).resolves.toMatchObject({
      success: true,
      text: "Remote execution approval required.",
      data: expect.objectContaining({ pendingApproval: true }),
    });
    expect(executeTerminalCommand).not.toHaveBeenCalled();
    expect(appServices.runController.setPendingApprovals).toHaveBeenCalledWith(
      "session-1",
      1,
    );
  });

  it("routes ! commands through Eliza's pre-LLM shortcut gate", async () => {
    vi.clearAllMocks();
    const appServices = services();
    const action = createShellCommandAction(appServices, config);
    const shortcutRegistry = new ShortcutRegistry();
    shortcutRegistry.register(createShellCommandShortcut());
    const id = "00000000-0000-4000-8000-000000000001" as UUID;
    const runtime = {
      actions: [action],
      agentId: id,
      shortcutRegistry,
      logger: { warn: vi.fn(), debug: vi.fn() },
      emitEvent: vi.fn(async () => undefined),
    };

    const result = await runShortcutGate({
      runtime: runtime as never,
      message: message("! pwd"),
      state: {} as never,
      responseId: id,
      senderRole: "OWNER",
    });

    expect(result?.kind).toBe("direct_reply");
    if (result?.kind !== "direct_reply") {
      throw new Error(
        "Expected the SDK shortcut gate to return a shell reply.",
      );
    }
    expect(result.result.responseContent?.text).toBe(
      "Command output: /workspace/project",
    );
  });
});
