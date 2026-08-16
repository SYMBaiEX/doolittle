import {
  type IAgentRuntime,
  type Memory,
  runShortcutGate,
  ShortcutRegistry,
  type UUID,
} from "@elizaos/core";
import { describe, expect, it, vi } from "vitest";
import { runWithTurnRuntimeScope } from "@/runtime/turn-runtime-scope";
import type { AppServices } from "@/services";
import type { EnvConfig } from "@/types/runtime";

const {
  executeTerminalCommand,
  formatTerminalCommandResponse,
  requestTerminalCommandApprovalDetails,
} = vi.hoisted(() => ({
  executeTerminalCommand: vi.fn(
    async (
      _runtime: unknown,
      _services: unknown,
      _command: string,
      _abortSignal?: AbortSignal,
    ) => ({
      command: "pwd",
      exitCode: 0,
      stdout: "/workspace/project",
      stderr: "",
      cwd: "/workspace/project",
      durationMs: 12,
    }),
  ),
  formatTerminalCommandResponse: vi.fn(
    (result: { stdout: string }) => `Command output: ${result.stdout}`,
  ),
  requestTerminalCommandApprovalDetails: vi.fn(
    async (
      _input: unknown,
      _context: unknown,
      _command: string,
    ): Promise<{ id: string; prompt: string; created: boolean } | undefined> =>
      undefined,
  ),
}));

vi.mock("@/runtime/commands/shell-command-facade", () => ({
  executeTerminalCommand,
  formatTerminalCommandResponse,
  requestTerminalCommandApprovalDetails,
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
    executionApprovals: {
      deny: vi.fn(async (id: string) => ({ id, status: "denied" })),
    },
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
    expect(requestTerminalCommandApprovalDetails).toHaveBeenCalledWith(
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
      undefined,
    );
    expect(callback).toHaveBeenCalledWith({
      text: "Command output: /workspace/project",
      source: "doolittle-shell-command",
    });
  });

  it("returns an approval prompt without invoking the shell service", async () => {
    vi.clearAllMocks();
    requestTerminalCommandApprovalDetails.mockResolvedValueOnce({
      id: "approval-1",
      prompt: "Remote execution approval required.",
      created: true,
    } as never);
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

  it("denies a newly created approval when the turn cancels before delivery", async () => {
    vi.clearAllMocks();
    const appServices = services();
    const action = createShellCommandAction(appServices, config);
    const shortcutRegistry = new ShortcutRegistry();
    shortcutRegistry.register(createShellCommandShortcut());
    const runtime = {
      actions: [action],
      shortcutRegistry,
      getSetting: vi.fn(),
    } as unknown as IAgentRuntime;
    const callback = vi.fn(async () => []);
    const controller = new AbortController();
    const reason = new DOMException("Turn cancelled", "AbortError");
    requestTerminalCommandApprovalDetails.mockImplementationOnce(async () => {
      controller.abort(reason);
      return {
        id: "approval-created-by-cancelled-turn",
        prompt: "Remote execution approval required.",
        created: true,
      };
    });

    const turn = runWithTurnRuntimeScope(
      runtime,
      { settings: new Map(), abortSignal: controller.signal },
      () =>
        action.handler(
          runtime,
          message("! git push origin main", "telegram"),
          undefined,
          undefined,
          callback,
        ),
    );

    await expect(turn).rejects.toBe(reason);
    expect(appServices.executionApprovals.deny).toHaveBeenCalledWith(
      "approval-created-by-cancelled-turn",
    );
    expect(callback).not.toHaveBeenCalled();
    expect(executeTerminalCommand).not.toHaveBeenCalled();
  });

  it("preserves a reused approval when the turn cancels before delivery", async () => {
    vi.clearAllMocks();
    const appServices = services();
    const action = createShellCommandAction(appServices, config);
    const shortcutRegistry = new ShortcutRegistry();
    shortcutRegistry.register(createShellCommandShortcut());
    const runtime = {
      actions: [action],
      shortcutRegistry,
      getSetting: vi.fn(),
    } as unknown as IAgentRuntime;
    const callback = vi.fn(async () => []);
    const controller = new AbortController();
    const reason = new DOMException("Turn cancelled", "AbortError");
    requestTerminalCommandApprovalDetails.mockImplementationOnce(async () => {
      controller.abort(reason);
      return {
        id: "approval-created-by-another-turn",
        prompt: "Remote execution approval required.",
        created: false,
      };
    });

    const turn = runWithTurnRuntimeScope(
      runtime,
      { settings: new Map(), abortSignal: controller.signal },
      () =>
        action.handler(
          runtime,
          message("! git push origin main", "telegram"),
          undefined,
          undefined,
          callback,
        ),
    );

    await expect(turn).rejects.toBe(reason);
    expect(appServices.executionApprovals.deny).not.toHaveBeenCalled();
    expect(callback).not.toHaveBeenCalled();
  });

  it("denies a newly created approval when cancellation races its delivery", async () => {
    vi.clearAllMocks();
    const appServices = services();
    const action = createShellCommandAction(appServices, config);
    const shortcutRegistry = new ShortcutRegistry();
    shortcutRegistry.register(createShellCommandShortcut());
    const runtime = {
      actions: [action],
      shortcutRegistry,
      getSetting: vi.fn(),
    } as unknown as IAgentRuntime;
    const controller = new AbortController();
    const reason = new DOMException("Turn cancelled", "AbortError");
    let deliveryStarted: (() => void) | undefined;
    let completeDelivery: ((memories: Memory[]) => void) | undefined;
    const deliveryStartedPromise = new Promise<void>((resolve) => {
      deliveryStarted = resolve;
    });
    const callback = vi.fn(
      () =>
        new Promise<Memory[]>((resolve) => {
          completeDelivery = resolve;
          deliveryStarted?.();
        }),
    );
    requestTerminalCommandApprovalDetails.mockResolvedValueOnce({
      id: "approval-delivery-race",
      prompt: "Remote execution approval required.",
      created: true,
    } as never);

    const turn = runWithTurnRuntimeScope(
      runtime,
      { settings: new Map(), abortSignal: controller.signal },
      () =>
        action.handler(
          runtime,
          message("! git push origin main", "telegram"),
          undefined,
          undefined,
          callback,
        ),
    );
    await deliveryStartedPromise;
    controller.abort(reason);

    await expect(turn).rejects.toBe(reason);
    expect(appServices.executionApprovals.deny).toHaveBeenCalledWith(
      "approval-delivery-race",
    );
    expect(
      appServices.runController.setPendingApprovals,
    ).not.toHaveBeenCalled();
    expect(executeTerminalCommand).not.toHaveBeenCalled();
    completeDelivery?.([]);
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

  it("propagates turn cancellation and suppresses a late shell reply", async () => {
    vi.clearAllMocks();
    const appServices = services();
    const action = createShellCommandAction(appServices, config);
    const shortcutRegistry = new ShortcutRegistry();
    shortcutRegistry.register(createShellCommandShortcut());
    const runtime = {
      actions: [action],
      shortcutRegistry,
      getSetting: vi.fn(),
    } as unknown as IAgentRuntime;
    const callback = vi.fn(async () => []);
    const controller = new AbortController();
    let markStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    executeTerminalCommand.mockImplementationOnce(
      async (_runtime, _services, command, abortSignal) => {
        await new Promise<void>((resolve) => {
          if (abortSignal?.aborted) {
            resolve();
            return;
          }
          abortSignal?.addEventListener("abort", () => resolve(), {
            once: true,
          });
          markStarted?.();
        });
        return {
          command,
          exitCode: 130,
          stdout: "",
          stderr: "Command cancelled.",
          cwd: "/workspace/project",
          durationMs: 4,
        };
      },
    );

    const turn = runWithTurnRuntimeScope(
      runtime,
      { settings: new Map(), abortSignal: controller.signal },
      () =>
        action.handler(
          runtime,
          message("! long-command"),
          undefined,
          undefined,
          callback,
        ),
    );
    await started;
    const reason = new DOMException("Turn cancelled", "AbortError");
    controller.abort(reason);

    await expect(turn).rejects.toBe(reason);
    expect(executeTerminalCommand).toHaveBeenCalledWith(
      runtime,
      appServices,
      "long-command",
      controller.signal,
    );
    expect(callback).not.toHaveBeenCalled();
  });
});
