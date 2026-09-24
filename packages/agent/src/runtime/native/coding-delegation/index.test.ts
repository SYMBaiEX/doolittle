import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type Action,
  type IAgentRuntime,
  type Memory,
  type Plugin,
  promoteSubactionsToActions,
} from "@elizaos/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runWithTurnRuntimeScope } from "@/runtime/turn-runtime-scope";
import { RunControllerService } from "@/services/run-controller-service";
import { DelegationEvidence } from "./evidence";
import { resolveDelegationAdapter, withManagedCodingDelegation } from "./index";
import { codexCommandForRoute } from "./model";
import type { AcpSpawnOptions, ManagedAcpService } from "./types";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function fixture(
  activeManagedApps: Array<{
    id: string;
    cwd: string;
    command: string;
    processId?: number;
  }> = [],
) {
  const root = await mkdtemp(join(tmpdir(), "doolittle-delegation-"));
  directories.push(root);
  const listeners = new Set<
    (session: string, event: string, data: unknown) => void
  >();
  const emit = (session: string, event: string, data: unknown) => {
    for (const listener of listeners) listener(session, event, data);
  };
  let counter = 0;
  const service: ManagedAcpService = {
    spawnSession: vi.fn(async (options: AcpSpawnOptions) => ({
      sessionId: `child-${++counter}`,
      agentType: options.agentType ?? "claude",
      workdir: options.workdir ?? root,
      status: "ready",
    })),
    sendPrompt: vi.fn(async () => ({ stopReason: "end_turn", exitCode: 0 })),
    cancelSession: vi.fn(async () => undefined),
    stopSession: vi.fn(async () => undefined),
    onSessionEvent: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  const runController = new RunControllerService();
  runController.startTurn({
    runId: "run-a",
    sessionId: "chat-a",
    roomId: "room-a",
    source: "desktop",
    message: "Build a blog",
    runDepth: "standard",
    configuredMaxIterations: 45,
    progressMode: "verbose",
  });
  const settings = new Map<string, unknown>([
    [
      "runtimeSettings",
      JSON.stringify({
        model: {
          provider: "codex",
          model: "gpt-5.6-luna",
          reasoningEffort: "medium",
        },
      }),
    ],
    [
      "DOOLITTLE_CODING_REQUEST_TEXT",
      "Build a blog with shadcn and run the production build.",
    ],
  ]);
  const runtime = {
    getSetting: (name: string) => settings.get(name),
    getService: (name: string) =>
      name === "ACP_SUBPROCESS_SERVICE" ? service : undefined,
  } as unknown as IAgentRuntime;
  const handler = vi.fn<Action["handler"]>(
    async (scoped, _message, _state, options) => {
      const parameters = options?.parameters as Record<string, unknown>;
      const acp = scoped.getService(
        "ACP_SUBPROCESS_SERVICE",
      ) as unknown as ManagedAcpService;
      const session = await acp.spawnSession({
        agentType: String(
          scoped.getSetting("ELIZA_ACP_DEFAULT_AGENT") ?? parameters.agentType,
        ),
        workdir: String(parameters.workdir),
        initialTask: "Implement the original task, then verify it.",
        metadata: {
          roomId: "room-a",
          taskRoomId: "room-a",
          source: "desktop",
          initialTask: "task",
          label: "blog",
        },
      });
      return {
        success: true,
        text: "",
        continueChain: false,
        data: { sessionId: session.sessionId, status: session.status },
      };
    },
  );
  const action = withManagedCodingDelegation(
    {
      name: "official",
      description: "Official fixture",
      actions: [
        {
          name: "TASKS",
          description: "Task fixture",
          validate: async () => true,
          handler,
        },
      ],
    },
    {
      workspace: { root: () => root },
      runController,
      terminal: {
        appServers: { listOwnedSessions: () => activeManagedApps },
      },
    },
  ).actions?.[0];
  if (!action) throw new Error("missing action");
  const message = {
    roomId: "room-a",
    content: { text: "planner message" },
  } as unknown as Memory;
  const execute = (parameters: Record<string, unknown> = {}) =>
    action.handler(
      runtime,
      message,
      undefined,
      {
        parameters: {
          action: "spawn_agent",
          agentType: "claude",
          workdir: root,
          ...parameters,
        },
      },
      undefined,
    );
  return {
    root,
    runtime,
    settings,
    message,
    action,
    execute,
    service,
    emit,
    runController,
    handler,
    listeners,
  };
}

describe("managed official coding delegation", () => {
  it.each<{ name: string; parameters: Record<string, string> }>([
    { name: "TASKS", parameters: { action: "spawn_agent" } },
    { name: "TASKS_SPAWN_AGENT", parameters: {} },
    { name: "TASKS_SPAWN_AGENT", parameters: { action: "create" } },
  ])(
    "adapts installed SDK $name with $parameters",
    async ({ name, parameters }) => {
      const input = await fixture();
      const { agentOrchestratorPlugin, tasksAction } = await import(
        "@elizaos/plugin-agent-orchestrator"
      );
      Object.assign(input.runtime, {
        logger: {
          info: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
          debug: vi.fn(),
        },
      });
      // Match the production factory's promoted actions, including handlers that
      // receive no action discriminator. The test-mode plugin export can be legacy.
      const plugin = {
        ...agentOrchestratorPlugin,
        actions: [...promoteSubactionsToActions(tasksAction)],
      };
      const adapted = withManagedCodingDelegation(plugin, {
        workspace: { root: () => input.root },
        runController: input.runController,
      });
      expect(adapted.services).toBe(plugin.services);
      for (const action of plugin.actions) {
        if (["TASKS", "TASKS_SPAWN_AGENT"].includes(action.name)) continue;
        expect(
          adapted.actions?.find((entry) => entry.name === action.name),
        ).toBe(action);
      }
      const official = adapted.actions?.find((action) => action.name === name);
      expect(official).toBeDefined();
      const configuredCommand = "/opt/tools/codex-acp";
      input.settings.set("ELIZA_CODEX_ACP_COMMAND", configuredCommand);
      const observedCommands: unknown[] = [];
      const spawn = input.service.spawnSession;
      input.service.spawnSession = vi.fn(async (options: AcpSpawnOptions) => {
        observedCommands.push(
          input.runtime.getSetting("ELIZA_CODEX_ACP_COMMAND"),
        );
        return spawn(options);
      });
      vi.mocked(input.service.sendPrompt).mockImplementation(async () => {
        observedCommands.push(
          input.runtime.getSetting("ELIZA_CODEX_ACP_COMMAND"),
        );
        return { stopReason: "end_turn", exitCode: 0 };
      });
      const result = await official?.handler(
        input.runtime,
        input.message,
        undefined,
        {
          parameters: {
            ...parameters,
            task: "Implement with actual shadcn components",
            agentType: "claude",
            workdir: input.root,
          },
        },
        undefined,
      );
      expect(result).toMatchObject({
        success: true,
        continueChain: true,
        text: expect.stringContaining("without changing user files"),
        data: {
          delegatedExecution: {
            agentType: "codex",
            workdir: input.root,
            status: "completed",
            verifiedLocalMutation: false,
          },
        },
      });
      expect(input.service.sendPrompt).toHaveBeenCalledOnce();
      expect(input.service.spawnSession).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          agentType: "codex",
          model: "gpt-5.6-luna",
          workdir: input.root,
          initialTask: undefined,
        }),
      );
      expect(input.service.sendPrompt).toHaveBeenCalledWith(
        "child-1",
        expect.any(String),
        { model: "gpt-5.6-luna", timeoutMs: 1_200_000 },
      );
      const selectedCommand = `${configuredCommand} -c 'model="gpt-5.6-luna"' -c 'model_reasoning_effort="medium"'`;
      expect(observedCommands).toEqual([selectedCommand, selectedCommand]);
      expect(input.runtime.getSetting("ELIZA_CODEX_ACP_COMMAND")).toBe(
        configuredCommand,
      );
      expect(vi.mocked(input.service.sendPrompt).mock.calls[0]?.[1]).toContain(
        "Original user requirements:",
      );
      expect(vi.mocked(input.service.sendPrompt).mock.calls[0]?.[1]).toContain(
        "actual shadcn components",
      );
      expect(vi.mocked(input.service.sendPrompt).mock.calls[0]?.[1]).toContain(
        "The existing implementation already satisfies the request; no changes were needed.",
      );
    },
  );

  it("hands Bun install, build, and app startup back to the parent turn", async () => {
    const input = await fixture();
    input.settings.set(
      "DOOLITTLE_CODING_REQUEST_TEXT",
      "Use Bun to install dependencies, run the production build, and start the app.",
    );

    const result = await input.execute();

    expect(result).toMatchObject({
      success: true,
      continueChain: true,
      text: expect.stringContaining(`cd "${input.root}" && bun install`),
    });
    expect(result?.text).toContain(`cd "${input.root}" && bun run build`);
    expect(result?.text).toContain("DOOLITTLE_APP_SERVER");
    expect(result?.text).toContain("parent-turn SHELL receipt");
  });

  it("blocks repeat coding delegation for the same workspace within one turn", async () => {
    const input = await fixture();
    const otherWorkdir = await mkdtemp(
      join(tmpdir(), "doolittle-delegation-other-"),
    );
    directories.push(otherWorkdir);

    const sameTurn = await runWithTurnRuntimeScope(
      input.runtime,
      { settings: input.settings, settledActionResults: [] },
      async () => {
        const first = await input.execute();
        const duplicate = await input.execute();
        const duplicateAgain = await input.execute();
        const otherWorkspace = await input.execute({ workdir: otherWorkdir });
        return { first, duplicate, duplicateAgain, otherWorkspace };
      },
    );

    expect(sameTurn.first).toMatchObject({
      success: true,
      data: {
        delegatedExecution: { status: "completed", workdir: input.root },
      },
    });
    expect(sameTurn.duplicate).toMatchObject({
      success: true,
      continueChain: true,
      text: expect.stringContaining("did not launch a duplicate"),
      data: {
        duplicateDelegationPrevented: {
          status: "blocked",
          workdir: input.root,
          previousSessionId: "child-1",
        },
      },
    });
    expect(sameTurn.duplicateAgain).toMatchObject({
      success: true,
      continueChain: false,
      text: expect.stringContaining(
        "additional same-workspace delegation was blocked",
      ),
    });
    expect(sameTurn.otherWorkspace).toMatchObject({
      success: true,
      data: {
        delegatedExecution: { status: "completed", workdir: otherWorkdir },
      },
    });
    expect(input.service.spawnSession).toHaveBeenCalledTimes(2);

    const nextTurn = await runWithTurnRuntimeScope(
      input.runtime,
      { settings: input.settings, settledActionResults: [] },
      () => input.execute(),
    );
    expect(nextTurn).toMatchObject({
      success: true,
      data: {
        delegatedExecution: { status: "completed", workdir: input.root },
      },
    });
    expect(input.service.spawnSession).toHaveBeenCalledTimes(3);
  });

  it("recovers from a worker sandbox failure without respawning the same workspace", async () => {
    const input = await fixture();
    input.settings.set(
      "DOOLITTLE_CODING_REQUEST_TEXT",
      "Create a Next.js blog, build it, and start the application.",
    );
    vi.mocked(input.service.sendPrompt).mockResolvedValue({
      stopReason: "error",
      exitCode: 1,
      error: "listen EPERM: operation not permitted 127.0.0.1:3000",
    });

    const sameTurn = await runWithTurnRuntimeScope(
      input.runtime,
      { settings: input.settings, settledActionResults: [] },
      async () => {
        const first = await input.execute();
        const duplicate = await input.execute();
        const duplicateAgain = await input.execute();
        return { first, duplicate, duplicateAgain };
      },
    );

    expect(sameTurn.first).toMatchObject({
      success: true,
      continueChain: true,
      text: expect.stringContaining(
        "continue with Doolittle's native workspace and shell actions",
      ),
      data: {
        delegatedExecution: {
          status: "failed",
          verifiedLocalMutation: false,
        },
      },
    });
    expect(sameTurn.first?.text).toContain(input.root);
    expect(sameTurn.first?.text).not.toContain(
      "No successful completion was recorded",
    );
    expect(sameTurn.first).not.toHaveProperty("verifiedUserFacing");
    expect(sameTurn.first?.data).not.toHaveProperty("verifiedUserFacing");
    expect(sameTurn.first?.data).not.toHaveProperty("userFacingText");
    expect(sameTurn.duplicate).toMatchObject({
      success: true,
      continueChain: true,
      text: expect.stringContaining("did not launch a duplicate"),
      data: {
        duplicateDelegationPrevented: {
          status: "blocked",
          workdir: input.root,
          previousSessionId: "child-1",
        },
      },
    });
    expect(sameTurn.duplicateAgain).toMatchObject({
      success: true,
      continueChain: false,
    });
    expect(input.service.spawnSession).toHaveBeenCalledOnce();
  });

  it("warns a delegated coding agent not to rebuild over a live managed app", async () => {
    const input = await fixture([
      {
        id: "managed-1",
        cwd: "/workspace/app",
        command: "bun run dev",
        processId: 321,
      },
    ]);
    await input.execute({ task: "Fix the current app", workdir: input.root });
    const workerPrompt = vi.mocked(input.service.sendPrompt).mock.calls[0]?.[1];
    expect(workerPrompt).toContain("MANAGED APPLICATIONS ALREADY RUNNING");
    expect(workerPrompt).toContain("Next.js dev and build share .next");
    expect(workerPrompt).toContain("session=managed-1");
  });

  it("does not count SDK session identity files as user task changes", async () => {
    const input = await fixture();
    vi.mocked(input.service.spawnSession).mockImplementation(
      async (options) => {
        await writeFile(
          join(input.root, "AGENTS.md"),
          "SDK workspace identity",
        );
        return {
          sessionId: "child-1",
          agentType: options.agentType ?? "codex",
          workdir: input.root,
          status: "ready",
        };
      },
    );
    expect(await input.execute()).toMatchObject({
      data: {
        delegatedExecution: { verifiedLocalMutation: false, changedFiles: [] },
      },
    });
  });
  it("awaits the real prompt and fingerprints changes, not the ready session or tool output", async () => {
    const input = await fixture();
    await writeFile(join(input.root, "page.tsx"), "old page");
    let finish: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      finish = resolve;
    });
    vi.mocked(input.service.sendPrompt).mockImplementation(
      async (sessionId) => {
        await gate;
        input.emit(sessionId, "message", {
          text: "Implemented the blog and checked its layout.",
        });
        input.emit(sessionId, "tool_running", {
          toolCall: {
            id: "write",
            title: "Write page.tsx",
            kind: "edit",
            status: "completed",
          },
        });
        await writeFile(join(input.root, "page.tsx"), "new page");
        return {
          stopReason: "end_turn",
          exitCode: 0,
          response: "raw shell output should never become final prose",
        };
      },
    );
    let settled = false;
    const promise = input.execute().then((result) => {
      settled = true;
      return result;
    });
    await vi.waitFor(() =>
      expect(input.service.sendPrompt).toHaveBeenCalledOnce(),
    );
    expect(settled).toBe(false);
    finish?.();
    const result = await promise;
    expect(result).toMatchObject({
      success: true,
      continueChain: true,
      data: {
        delegatedExecution: {
          agentType: "codex",
          status: "completed",
          verifiedLocalMutation: true,
          summary: "Implemented the blog and checked its layout.",
          changedFiles: [{ path: join(input.root, "page.tsx"), bytes: 8 }],
        },
      },
    });
    expect(JSON.stringify(result)).not.toContain("raw shell output");
    expect(input.service.sendPrompt).toHaveBeenCalledWith(
      "child-1",
      expect.any(String),
      { model: "gpt-5.6-luna", timeoutMs: 1_200_000 },
    );
    expect(input.service.spawnSession).toHaveBeenCalledWith(
      expect.objectContaining({
        initialTask: undefined,
        model: "gpt-5.6-luna",
        metadata: {
          label: "blog",
          doolittleParentRoomId: "room-a",
          doolittleParentRunId: expect.any(String),
        },
      }),
    );
    expect(input.service.stopSession).toHaveBeenCalledWith("child-1");
    expect(input.listeners.size).toBe(0);
  });

  it("does not turn ready or a claimed change into a verified mutation", async () => {
    const input = await fixture();
    vi.mocked(input.service.sendPrompt).mockImplementation(
      async (sessionId) => {
        input.emit(sessionId, "message", { text: "I created files." });
        return { stopReason: "end_turn", exitCode: 0 };
      },
    );
    const result = await input.execute();
    expect(result).toMatchObject({
      data: {
        delegatedExecution: { changedFiles: [], verifiedLocalMutation: false },
      },
    });
    expect(
      result && typeof result === "object" && result.data,
    ).not.toHaveProperty("mutation");
  });

  it("surfaces authentication failures safely instead of the local mutation error", async () => {
    const input = await fixture();
    vi.mocked(input.service.sendPrompt).mockResolvedValue({
      stopReason: "error",
      exitCode: 1,
      error: "Authentication required token=private-provider-value",
    });
    const result = await input.execute();
    expect(result).toMatchObject({
      success: false,
      continueChain: false,
      verifiedUserFacing: true,
      userFacingText: expect.stringContaining("Sign in to codex"),
      data: {
        verifiedUserFacing: true,
        delegatedExecution: {
          status: "failed",
          failureMessage: expect.stringContaining("Sign in to codex"),
        },
      },
    });
    expect(JSON.stringify(result)).not.toContain("private-provider-value");
  });

  it("reports the final child model-version error instead of its first metadata warning", async () => {
    const input = await fixture();
    input.service.getSession = vi.fn(async () => ({
      lastError:
        'Internal error (data: {"message":"The gpt-5.6-luna model requires a newer version of Codex. Please upgrade to the latest app or CLI and try again.","credential":"private-provider-value"})',
    }));
    vi.mocked(input.service.sendPrompt).mockImplementation(async (id) => {
      input.emit(id, "message", {
        text: "Model metadata for gpt-5.6-luna not found. Defaulting to fallback metadata.",
      });
      return { stopReason: "error", exitCode: 1, error: "Internal error" };
    });
    const result = await input.execute();
    expect(input.service.getSession).toHaveBeenCalledExactlyOnceWith("child-1");
    expect(result).toMatchObject({
      success: false,
      continueChain: false,
      verifiedUserFacing: true,
      userFacingText: expect.stringContaining("older Codex version"),
      data: {
        delegatedExecution: {
          status: "failed",
          failureMessage: expect.stringContaining(
            "Update Doolittle's Codex ACP adapter",
          ),
          verifiedLocalMutation: false,
        },
      },
    });
    expect(JSON.stringify(result)).not.toContain("private-provider-value");
  });

  it("fails closed before native SDK spawn for an incompatible security preset", async () => {
    const input = await fixture();
    const { tasksAction } = await import("@elizaos/plugin-agent-orchestrator");
    Object.assign(input.runtime, {
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    });
    const action = withManagedCodingDelegation(
      {
        name: "official",
        description: "Native fixture",
        actions: [...promoteSubactionsToActions(tasksAction)],
      },
      {
        workspace: { root: () => input.root },
        runController: input.runController,
      },
    ).actions?.find((entry) => entry.name === "TASKS_SPAWN_AGENT");
    expect(action).toBeDefined();
    expect(action?.descriptionCompressed).toContain(
      "configured coding adapter",
    );
    expect(action?.descriptionCompressed).toContain(
      "do not substitute the selected project root",
    );
    const result = await action?.handler(
      input.runtime,
      input.message,
      undefined,
      {
        parameters: {
          task: "Inspect package.json without changes",
          workdir: input.root,
          approvalPreset: "readonly",
        },
      },
      undefined,
    );
    expect(result).toMatchObject({
      success: false,
      continueChain: false,
      verifiedUserFacing: true,
      userFacingText: expect.stringContaining("cannot enforce this read-only"),
    });
    expect(input.service.spawnSession).not.toHaveBeenCalled();
    expect(input.service.sendPrompt).not.toHaveBeenCalled();
  });

  it("closes a failed child when reading its final error throws", async () => {
    const input = await fixture();
    input.service.getSession = vi.fn(() => {
      throw new Error("store unavailable");
    });
    vi.mocked(input.service.sendPrompt).mockResolvedValue({
      stopReason: "error",
      exitCode: 1,
      error: "The selected model requires a newer version of Codex.",
    });
    expect(await input.execute()).toMatchObject({
      success: false,
      userFacingText: expect.stringContaining("older Codex version"),
    });
    expect(input.service.stopSession).toHaveBeenCalledExactlyOnceWith(
      "child-1",
    );
  });

  it("rejects nonexistent and relative workspaces before the SDK can fall back", async () => {
    const input = await fixture();
    expect(
      await input.execute({ workdir: join(input.root, "missing") }),
    ).toMatchObject({
      success: false,
      continueChain: false,
      error: "WORKSPACE_NOT_FOUND",
    });
    expect(
      await input.execute({ workdir: "austin/dev/this-is-a-test" }),
    ).toMatchObject({ success: false, error: "WORKSPACE_PATH_AMBIGUOUS" });
    expect(input.service.spawnSession).not.toHaveBeenCalled();
  });

  it("treats a streamed Codex API error as failure even when ACP reports end_turn", async () => {
    const input = await fixture();
    input.service.getSession = vi.fn(async () => ({
      lastError: "Internal error",
    }));
    vi.mocked(input.service.sendPrompt).mockImplementation(
      async (sessionId) => {
        input.emit(sessionId, "message", {
          text: JSON.stringify({
            type: "error",
            status: 400,
            error: {
              type: "invalid_request_error",
              message:
                "The 'gpt-6-luna' model is not supported when using Codex with a ChatGPT account.",
            },
          }),
        });
        return { stopReason: "end_turn", exitCode: 0 };
      },
    );

    const result = await input.execute();

    expect(result).toMatchObject({
      success: false,
      continueChain: false,
      userFacingText: expect.stringContaining(
        "cannot use the selected model with this account",
      ),
      data: {
        delegatedExecution: {
          status: "failed",
          stopReason: "end_turn",
          summary: "",
          failureMessage: expect.stringContaining(
            "Choose a model exposed by the installed Codex CLI",
          ),
          verifiedLocalMutation: false,
        },
      },
    });
    expect(JSON.stringify(result)).not.toContain("gpt-6-luna");
    expect(input.service.getSession).not.toHaveBeenCalled();
    expect(input.service.sendPrompt).toHaveBeenCalledOnce();
  });

  it("honors an explicit user adapter choice without inheriting the wrong model", async () => {
    const input = await fixture();
    input.settings.set(
      "DOOLITTLE_CODING_REQUEST_TEXT",
      "Use Claude Code to implement this change.",
    );
    await input.execute();
    expect(input.service.spawnSession).toHaveBeenCalledWith(
      expect.objectContaining({ agentType: "claude", model: undefined }),
    );
    expect(input.runtime.getSetting("ELIZA_ACP_DEFAULT_AGENT")).toBeUndefined();
    expect(
      resolveDelegationAdapter("Build a Claude-themed page", "codex"),
    ).toBe("codex");
    expect(
      resolveDelegationAdapter("Do not use Claude; use Codex.", "codex"),
    ).toBe("codex");
    expect(resolveDelegationAdapter("Don't use Claude.", "codex")).toBe(
      "codex",
    );
    expect(resolveDelegationAdapter("Avoid using Claude Code.", "codex")).toBe(
      "codex",
    );
  });

  it("passes selected model and effort through scoped ACP argv without changing global or account settings", async () => {
    const input = await fixture();
    const configuredCommand =
      "/opt/tools/codex-acp -c 'sandbox_mode=\"workspace-write\"'";
    input.settings.set("ELIZA_CODEX_ACP_COMMAND", configuredCommand);
    const observed: unknown[] = [];
    vi.mocked(input.service.sendPrompt).mockImplementation(async () => {
      observed.push(input.runtime.getSetting("ELIZA_CODEX_ACP_COMMAND"));
      observed.push(input.runtime.getSetting("runtimeSettings"));
      return { stopReason: "end_turn", exitCode: 0 };
    });
    await input.execute();
    expect(observed[0]).toBe(
      `${configuredCommand} -c 'model="gpt-5.6-luna"' -c 'model_reasoning_effort="medium"'`,
    );
    expect(observed[1]).toBe(input.settings.get("runtimeSettings"));
    expect(input.runtime.getSetting("ELIZA_CODEX_ACP_COMMAND")).toBe(
      configuredCommand,
    );
    expect(
      vi.mocked(input.service.spawnSession).mock.calls[0]?.[0],
    ).not.toHaveProperty("customCredentials");
    expect(() =>
      codexCommandForRoute({ model: "bad'; touch /tmp/injected" }),
    ).toThrow("CODING_MODEL_INVALID");
    expect(() =>
      codexCommandForRoute({
        command: "unrelated-agent",
        model: "gpt-5.6-luna",
      }),
    ).toThrow("CODING_CUSTOM_COMMAND_MODEL_UNSUPPORTED");
  });

  it("isolates simultaneous model settings and child events for different chats", async () => {
    const first = await fixture();
    const second = await fixture();
    second.settings.set(
      "runtimeSettings",
      JSON.stringify({
        model: {
          provider: "codex",
          model: "gpt-5.6-sol",
          reasoningEffort: "high",
        },
      }),
    );
    const seen: string[] = [];
    for (const input of [first, second]) {
      vi.mocked(input.service.sendPrompt).mockImplementation(
        async (sessionId) => {
          await Promise.resolve();
          seen.push(
            String(
              vi.mocked(input.service.spawnSession).mock.calls[0]?.[0].env
                ?.CODEX_CONFIG,
            ),
          );
          input.emit("not-this-child", "message", { text: "wrong chat" });
          input.emit(sessionId, "message", { text: input.root });
          return { stopReason: "end_turn", exitCode: 0 };
        },
      );
    }
    const results = await Promise.all([first.execute(), second.execute()]);
    expect(results[0]).toMatchObject({
      data: { delegatedExecution: { summary: first.root } },
    });
    expect(results[1]).toMatchObject({
      data: { delegatedExecution: { summary: second.root } },
    });
    expect(seen).toEqual(
      expect.arrayContaining([
        expect.stringContaining('"model":"gpt-5.6-luna"'),
        expect.stringContaining('"model":"gpt-5.6-sol"'),
      ]),
    );
    expect(first.runtime.getSetting("ELIZA_CODEX_ACP_COMMAND")).toBeUndefined();
    expect(
      second.runtime.getSetting("ELIZA_CODEX_ACP_COMMAND"),
    ).toBeUndefined();
  });

  it("cancels and closes only the matching child before returning", async () => {
    const input = await fixture();
    const controller = new AbortController();
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.mocked(input.service.sendPrompt).mockImplementation(async () => {
      await gate;
      return { stopReason: "cancelled", exitCode: 0 };
    });
    vi.mocked(input.service.stopSession).mockImplementation(async () => {
      release?.();
    });
    const promise = runWithTurnRuntimeScope(
      input.runtime,
      { settings: input.settings, abortSignal: controller.signal },
      () => input.execute(),
    );
    await vi.waitFor(() =>
      expect(input.service.sendPrompt).toHaveBeenCalledOnce(),
    );
    input.emit("unrelated-child", "message", { text: "other conversation" });
    controller.abort();
    const result = await promise;
    expect(result).toMatchObject({
      success: false,
      data: { delegatedExecution: { status: "cancelled", summary: "" } },
    });
    expect(input.service.cancelSession).toHaveBeenCalledExactlyOnceWith(
      "child-1",
    );
    expect(input.service.stopSession).toHaveBeenCalledExactlyOnceWith(
      "child-1",
    );
  });

  it("leaves connector tasks and unrelated official actions unchanged", async () => {
    const input = await fixture();
    input.runController.finishTurn("chat-a", "complete");
    input.runController.startTurn({
      runId: "connector-run",
      sessionId: "connector",
      roomId: "room-a",
      source: "discord",
      message: "connector message",
      runDepth: "standard",
      configuredMaxIterations: 45,
      progressMode: "verbose",
    });
    await input.execute();
    expect(input.service.sendPrompt).not.toHaveBeenCalled();
    const other = { name: "OTHER" } as Action;
    expect(
      withManagedCodingDelegation(
        { name: "official", actions: [other] } as Plugin,
        {
          workspace: { root: () => input.root },
          runController: input.runController,
        },
      ).actions?.[0],
    ).toBe(other);
  });

  it("never submits a coding task after cancellation during native startup", async () => {
    const input = await fixture();
    const controller = new AbortController();
    let finishStartup: (() => void) | undefined;
    const startup = new Promise<void>((resolve) => {
      finishStartup = resolve;
    });
    vi.mocked(input.service.spawnSession).mockImplementation(
      async (options) => {
        await startup;
        return {
          sessionId: "starting-child",
          agentType: options.agentType ?? "codex",
          workdir: input.root,
          status: "ready",
        };
      },
    );
    const promise = runWithTurnRuntimeScope(
      input.runtime,
      { settings: input.settings, abortSignal: controller.signal },
      () => input.execute(),
    );
    const rejected = expect(promise).rejects.toThrow();
    await vi.waitFor(() =>
      expect(input.service.spawnSession).toHaveBeenCalledOnce(),
    );
    controller.abort();
    finishStartup?.();
    await rejected;
    expect(input.service.sendPrompt).not.toHaveBeenCalled();
    expect(input.service.stopSession).toHaveBeenCalledExactlyOnceWith(
      "starting-child",
    );
    expect(input.service.spawnSession).toHaveBeenCalledWith(
      expect.objectContaining({ timeoutMs: 30_000, initialTask: undefined }),
    );
  });

  it("rejects an SDK cwd substitution before any worker task can run", async () => {
    const input = await fixture();
    vi.mocked(input.service.spawnSession).mockResolvedValue({
      sessionId: "wrong-directory",
      agentType: "codex",
      workdir: tmpdir(),
      status: "ready",
    });
    await expect(input.execute()).rejects.toThrow("CODING_WORKSPACE_MISMATCH");
    expect(input.service.sendPrompt).not.toHaveBeenCalled();
    expect(input.service.stopSession).toHaveBeenCalledExactlyOnceWith(
      "wrong-directory",
    );
  });

  it("isolates nested settings, events, and Stop on one shared runtime and ACP service", async () => {
    const input = await fixture();
    input.runController.startTurn({
      runId: "run-b",
      sessionId: "chat-b",
      roomId: "room-b",
      source: "desktop",
      message: "Another task",
      runDepth: "standard",
      configuredMaxIterations: 45,
      progressMode: "verbose",
    });
    const progress = vi.spyOn(input.runController, "noteRuntimeStream");
    const releases = new Map<string, () => void>();
    const modelSettings = new Map<string, string>();
    vi.mocked(input.service.sendPrompt).mockImplementation(
      async (sessionId) => {
        modelSettings.set(
          sessionId,
          String(input.runtime.getSetting("ELIZA_CODEX_ACP_COMMAND")),
        );
        await new Promise<void>((resolve) => {
          releases.set(sessionId, resolve);
        });
        // Settings must remain correct after another shared-runtime turn runs.
        expect(input.runtime.getSetting("ELIZA_CODEX_ACP_COMMAND")).toBe(
          modelSettings.get(sessionId),
        );
        return {
          stopReason: sessionId === "child-1" ? "cancelled" : "end_turn",
          exitCode: 0,
        };
      },
    );
    vi.mocked(input.service.stopSession).mockImplementation(
      async (sessionId) => {
        releases.get(sessionId)?.();
      },
    );
    const controller = new AbortController();
    const first = runWithTurnRuntimeScope(
      input.runtime,
      { settings: input.settings, abortSignal: controller.signal },
      () => input.execute(),
    );
    await vi.waitFor(() => expect(releases.has("child-1")).toBe(true));
    const secondSettings = new Map(input.settings);
    secondSettings.set(
      "runtimeSettings",
      JSON.stringify({
        model: {
          provider: "codex",
          model: "gpt-5.6-sol",
          reasoningEffort: "high",
        },
      }),
    );
    const second = runWithTurnRuntimeScope(
      input.runtime,
      { settings: secondSettings, abortSignal: new AbortController().signal },
      () =>
        input.action.handler(
          input.runtime,
          {
            roomId: "room-b",
            content: { text: "second task" },
          } as unknown as Memory,
          undefined,
          { parameters: { action: "spawn_agent", workdir: input.root } },
          undefined,
        ),
    );
    await vi.waitFor(() => expect(releases.has("child-2")).toBe(true));
    input.emit("child-1", "message", { text: "Only chat A" });
    input.emit("child-2", "message", { text: "Only chat B" });
    input.emit("child-2", "tool_running", {
      toolCall: {
        id: "tool-b",
        title: "Read B",
        status: "completed",
        kind: "read",
      },
    });
    controller.abort();
    expect(await first).toMatchObject({
      success: false,
      data: {
        delegatedExecution: {
          sessionId: "child-1",
          status: "cancelled",
          summary: "Only chat A",
        },
      },
    });
    expect(input.service.cancelSession).toHaveBeenCalledExactlyOnceWith(
      "child-1",
    );
    expect(input.service.stopSession).not.toHaveBeenCalledWith("child-2");
    releases.get("child-2")?.();
    expect(await second).toMatchObject({
      success: true,
      data: {
        delegatedExecution: {
          sessionId: "child-2",
          status: "completed",
          summary: "Only chat B",
        },
      },
    });
    expect(modelSettings.get("child-1")).toBe(
      "npx -y @agentclientprotocol/codex-acp@1.13.1",
    );
    expect(modelSettings.get("child-2")).toBe(modelSettings.get("child-1"));
    expect(
      vi
        .mocked(input.service.spawnSession)
        .mock.calls.map(([options]) =>
          JSON.parse(options.env?.CODEX_CONFIG ?? "{}"),
        ),
    ).toEqual([
      expect.objectContaining({
        model: "gpt-5.6-luna",
        model_reasoning_effort: "medium",
      }),
      expect.objectContaining({
        model: "gpt-5.6-sol",
        model_reasoning_effort: "high",
      }),
    ]);
    expect(
      progress.mock.calls
        .filter(([room]) => room === "room-a")
        .every(([, , detail]) => !detail?.includes("chat B")),
    ).toBe(true);
    expect(
      progress.mock.calls
        .filter(([room]) => room === "room-b")
        .every(([, , detail]) => !detail?.includes("chat A")),
    ).toBe(true);
    expect(
      input.runController
        .getTaskEvents("run-a")
        .some((event) => JSON.stringify(event).includes("tool-b")),
    ).toBe(false);
    expect(
      input.runController
        .getTaskEvents("run-b")
        .some((event) => JSON.stringify(event).includes("tool-b")),
    ).toBe(true);
    expect(input.runtime.getSetting("ELIZA_CODEX_ACP_COMMAND")).toBeUndefined();
    expect(input.listeners.size).toBe(0);
  });
});

describe("delegated filesystem receipts", () => {
  it("does not treat files beyond an exact inventory cap as newly created", async () => {
    const root = await mkdtemp(join(tmpdir(), "doolittle-evidence-cap-"));
    directories.push(root);
    await mkdir(join(root, "nested"));
    await writeFile(join(root, "nested", "existing.ts"), "preexisting");
    await Promise.all(
      Array.from({ length: 1_999 }, (_, i) =>
        writeFile(join(root, `file-${i}.ts`), "existing"),
      ),
    );
    const evidence = new DelegationEvidence(root);
    await evidence.start();
    await rm(join(root, "file-0.ts"));
    const changed = await evidence.finish();
    expect(changed.some((file) => file.path.endsWith("existing.ts"))).toBe(
      false,
    );
    expect(changed).toHaveLength(1);
  });
  it("excludes credentials and uses contents rather than file existence", async () => {
    const root = await mkdtemp(join(tmpdir(), "doolittle-evidence-"));
    directories.push(root);
    await writeFile(join(root, "page.tsx"), "before");
    await writeFile(join(root, ".env.local"), "secret-before");
    const evidence = new DelegationEvidence(root);
    await evidence.start();
    await writeFile(join(root, "page.tsx"), "after");
    await writeFile(join(root, ".env.local"), "secret-after");
    const changes = await evidence.finish();
    expect(changes).toHaveLength(1);
    expect(changes[0]?.beforeSha256).not.toBe(changes[0]?.afterSha256);
    expect(changes[0]?.path).toBe(join(root, "page.tsx"));
    expect(await readFile(join(root, ".env.local"), "utf8")).toBe(
      "secret-after",
    );
  });
});
