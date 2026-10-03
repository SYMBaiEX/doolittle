import {
  CODING_VERIFICATION_COMMAND,
  CODING_VERIFICATION_SUCCESS_MARKER,
} from "@doolittle/contracts";
import { EventType, type IAgentRuntime } from "@elizaos/core";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  agentEventLabel,
  createRunProgressEvents,
  createRunProgressRuntimeService,
  eventActionLabel,
  eventActionResult,
  eventRoomId,
  shouldProjectNativeToolProgress,
} from "./run-progress";

const previousCodingVerificationOptIn =
  process.env.DOOLITTLE_EVAL_CODING_VERIFICATION;
const previousWorkspaceDir = process.env.DOOLITTLE_WORKSPACE_DIR;

afterEach(() => {
  if (previousCodingVerificationOptIn === undefined)
    delete process.env.DOOLITTLE_EVAL_CODING_VERIFICATION;
  else
    process.env.DOOLITTLE_EVAL_CODING_VERIFICATION =
      previousCodingVerificationOptIn;
  if (previousWorkspaceDir === undefined)
    delete process.env.DOOLITTLE_WORKSPACE_DIR;
  else process.env.DOOLITTLE_WORKSPACE_DIR = previousWorkspaceDir;
});

function codingVerificationServices(input: {
  observed?: unknown;
  history?: unknown[];
}) {
  const publishRuntimeCodingVerification = vi.fn();
  let executionResultListener: ((event: never) => void) | undefined;
  const activeRun = {
    sessionId: "cli:session",
    runId: "runtime-run-1",
    roomId: "room-1",
    source: "cli",
    progressMode: "off",
  };
  const services = {
    runController: {
      getByRoomId: () => activeRun,
      onUpdate: () => () => undefined,
      noteRuntimeActionStarted: vi.fn(),
      noteRuntimeActionCompleted: vi.fn(),
      publishRuntimeCodingVerification,
    },
    settings: { get: () => ({ model: {} }) },
    terminal: {
      onExecutionResult: (listener: (event: never) => void) => {
        executionResultListener = listener;
        return () => {
          executionResultListener = undefined;
        };
      },
      recent: () => input.history ?? [],
    },
  } as never;
  return {
    services,
    publishRuntimeCodingVerification,
    observeExecutionResult: () => {
      if (input.observed) executionResultListener?.(input.observed as never);
    },
  };
}

function codingVerificationPayload(overrides: Record<string, unknown> = {}) {
  return {
    success: true,
    data: {
      actionName: "SHELL",
      command: CODING_VERIFICATION_COMMAND,
      runId: "terminal-run-1",
      exitCode: 0,
      timedOut: false,
      truncated: false,
      executedIn: "/task/workspace",
      stdout: CODING_VERIFICATION_SUCCESS_MARKER,
      stderr: "",
      ...overrides,
    },
  };
}

function localCodingVerificationTerminalRun(
  recordOverrides: Record<string, unknown> = {},
  sandbox = "host",
) {
  return {
    record: {
      id: "terminal-run-1",
      command: CODING_VERIFICATION_COMMAND,
      exitCode: 0,
      backend: "local",
      backendMode: "local",
      timedOut: false,
      stdout: CODING_VERIFICATION_SUCCESS_MARKER,
      stderr: "",
      cwd: "/task/workspace",
      startedAt: "2026-10-03T00:00:00.000Z",
      completedAt: "2026-10-03T00:00:01.000Z",
      ...recordOverrides,
    },
    sandbox,
  };
}

describe("run progress helpers", () => {
  it("keeps coding verification receipt observation disabled by default", async () => {
    delete process.env.DOOLITTLE_EVAL_CODING_VERIFICATION;
    const { services, publishRuntimeCodingVerification } =
      codingVerificationServices({
        observed: localCodingVerificationTerminalRun(),
      });
    const events = createRunProgressEvents(services);

    await events[EventType.ACTION_STARTED]?.[0]?.({
      roomId: "room-1",
      content: { actions: ["SHELL"] },
    } as never);
    await events[EventType.ACTION_COMPLETED]?.[0]?.({
      roomId: "room-1",
      content: {
        actions: ["SHELL"],
        actionStatus: "completed",
        actionResult: codingVerificationPayload(),
      },
    } as never);

    expect(publishRuntimeCodingVerification).not.toHaveBeenCalled();
  });

  it("publishes a verified receipt only from a fresh original host result", async () => {
    process.env.DOOLITTLE_EVAL_CODING_VERIFICATION = "true";
    process.env.DOOLITTLE_WORKSPACE_DIR = "/task/workspace";
    const {
      services,
      publishRuntimeCodingVerification,
      observeExecutionResult,
    } = codingVerificationServices({
      observed: localCodingVerificationTerminalRun(),
    });
    const events = createRunProgressEvents(services);

    await events[EventType.ACTION_STARTED]?.[0]?.({
      roomId: "room-1",
      content: { actions: ["SHELL"] },
    } as never);
    observeExecutionResult();
    await events[EventType.ACTION_COMPLETED]?.[0]?.({
      roomId: "room-1",
      runId: "runtime-run-1",
      content: {
        actions: ["SHELL"],
        actionStatus: "completed",
        actionResult: codingVerificationPayload(),
      },
    } as never);

    expect(publishRuntimeCodingVerification).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "cli:session",
        runId: "runtime-run-1",
        roomId: "room-1",
        receipt: expect.objectContaining({
          status: "verified",
          reason: "verified",
          workdirMatches: true,
        }),
      }),
    );
  });

  it.each([
    ["remote backend", { backend: "ssh" }, "host"],
    ["container backend", { backendMode: "container" }, "host"],
    ["sandboxed host backend", {}, "docker"],
    ["timed out result", { timedOut: true }, "host"],
    ["different workspace", { cwd: "/other/workspace" }, "host"],
    ["missing terminal id", { id: undefined }, "host"],
    ["mismatched output", { stdout: "other" }, "host"],
  ])(
    "does not verify a candidate against %s invocation result",
    async (_label, recordOverrides, sandbox) => {
      process.env.DOOLITTLE_EVAL_CODING_VERIFICATION = "true";
      process.env.DOOLITTLE_WORKSPACE_DIR = "/task/workspace";
      const {
        services,
        publishRuntimeCodingVerification,
        observeExecutionResult,
      } = codingVerificationServices({
        observed: localCodingVerificationTerminalRun(recordOverrides, sandbox),
      });
      const events = createRunProgressEvents(services);

      await events[EventType.ACTION_STARTED]?.[0]?.({
        roomId: "room-1",
        content: { actions: ["SHELL"] },
      } as never);
      observeExecutionResult();
      await events[EventType.ACTION_COMPLETED]?.[0]?.({
        roomId: "room-1",
        content: {
          actions: ["SHELL"],
          actionStatus: "completed",
          actionResult: codingVerificationPayload(),
        },
      } as never);

      expect(
        publishRuntimeCodingVerification.mock.calls[0]?.[0].receipt,
      ).not.toMatchObject({ status: "verified" });
    },
  );

  it("does not accept a matching stale disk-history record without an invocation-local observation", async () => {
    process.env.DOOLITTLE_EVAL_CODING_VERIFICATION = "true";
    process.env.DOOLITTLE_WORKSPACE_DIR = "/task/workspace";
    const staleRecord = localCodingVerificationTerminalRun().record;
    const { services, publishRuntimeCodingVerification } =
      codingVerificationServices({ history: [staleRecord] });
    const events = createRunProgressEvents(services);

    await events[EventType.ACTION_STARTED]?.[0]?.({
      roomId: "room-1",
      content: { actions: ["SHELL"] },
    } as never);
    await events[EventType.ACTION_COMPLETED]?.[0]?.({
      roomId: "room-1",
      content: {
        actions: ["SHELL"],
        actionStatus: "completed",
        actionResult: codingVerificationPayload(),
      },
    } as never);

    expect(publishRuntimeCodingVerification).toHaveBeenCalledWith(
      expect.objectContaining({
        receipt: expect.objectContaining({
          status: "unavailable",
          reason: "identity-unavailable",
        }),
      }),
    );
  });

  it("extracts room ids from payload root or message envelope", () => {
    expect(eventRoomId({ roomId: "root-room" })).toBe("root-room");
    expect(eventRoomId({ message: { roomId: "message-room" } })).toBe(
      "message-room",
    );
    expect(eventRoomId({})).toBeUndefined();
  });

  it("extracts event action label from content fields", () => {
    expect(
      eventActionLabel({
        content: { actions: ["first-action", "other-action"] },
      }),
    ).toBe("first-action");
    expect(
      eventActionLabel({
        content: { text: "text-label" },
      }),
    ).toBe("text-label");
    expect(
      eventActionLabel({
        content: { actionStatus: "status-label" },
      }),
    ).toBe("status-label");
    expect(eventActionLabel({})).toBeUndefined();
  });

  it("extracts agent event label using prioritized fields", () => {
    expect(
      agentEventLabel({
        label: "label",
        preview: "preview",
        text: "text",
        content: { actions: ["action"] },
      }),
    ).toBe("label");
    expect(agentEventLabel({ preview: "preview", text: "text" })).toBe(
      "preview",
    );
    expect(
      agentEventLabel({ text: "text", content: { actions: ["action"] } }),
    ).toBe("text");
    expect(agentEventLabel({ content: { actions: ["action"] } })).toBe(
      "action",
    );
    expect(agentEventLabel({})).toBeUndefined();
  });

  it("extracts SDK action results and action names from runtime event content", () => {
    const actionResult = {
      success: true,
      data: {
        actionName: "SHELL_COMMAND",
        command: "bun test",
        exitCode: 0,
      },
    };

    expect(eventActionResult({ content: { actionResult } })).toBe(actionResult);
    expect(eventActionResult({ content: { result: actionResult } })).toBe(
      actionResult,
    );
    expect(eventActionLabel({ content: { actionResult } })).toBe(
      "SHELL_COMMAND",
    );
  });

  it.each([
    ["off", "action-started", false],
    ["off", "action-completed", false],
    ["new", "action-started", true],
    ["new", "action-completed", false],
    ["all", "action-completed", true],
    ["all", "stream", false],
    ["verbose", "stream", true],
  ] as const)("projects %s %s activity: %s", (mode, event, expected) => {
    expect(shouldProjectNativeToolProgress(mode, event)).toBe(expected);
  });

  it("keeps failed and mutation action results visible even when progress is off", () => {
    expect(
      shouldProjectNativeToolProgress("off", "action-completed", {
        terminalResult: true,
      }),
    ).toBe(true);
  });

  it("declares lifecycle projection as native plugin events", async () => {
    const updateRuntimeThinking = vi.fn();
    const updateRuntimeWaiting = vi.fn();
    const services = {
      runController: {
        updateRuntimeThinking,
        updateRuntimeWaiting,
      },
    } as never;
    const events = createRunProgressEvents(services);

    await events[EventType.RUN_STARTED]?.[0]?.({
      roomId: "room-1",
    } as never);
    await events[EventType.MESSAGE_SENT]?.[0]?.({
      roomId: "room-1",
    } as never);

    expect(updateRuntimeThinking).toHaveBeenCalledWith("room-1");
    expect(updateRuntimeWaiting).toHaveBeenCalledWith("room-1");
  });

  it("reserves chat terminal receipts for post-provider while preserving autonomous RUN_ENDED completion", async () => {
    const finishRuntimeRun = vi.fn();
    const services = {
      runController: {
        getByRoomId: (roomId: string) =>
          roomId === "chat-room"
            ? { runId: "chat-run", source: "desktop" }
            : { runId: "automation-run", source: "automation" },
        finishRuntimeRun,
      },
    } as never;
    const events = createRunProgressEvents(services);

    await events[EventType.RUN_ENDED]?.[0]?.({
      roomId: "chat-room",
      runId: "delegated-child-run",
      status: "completed",
    } as never);
    await events[EventType.RUN_ENDED]?.[0]?.({
      roomId: "automation-room",
      runId: "automation-run",
      status: "completed",
    } as never);

    expect(finishRuntimeRun).toHaveBeenCalledTimes(1);
    expect(finishRuntimeRun).toHaveBeenCalledWith(
      "automation-room",
      "complete",
      undefined,
    );
  });

  it("does not manufacture a terminal receipt when RUN_ENDED has no tracked run", async () => {
    const finishRuntimeRun = vi.fn();
    const services = {
      runController: {
        getByRoomId: () => undefined,
        finishRuntimeRun,
      },
    } as never;
    const events = createRunProgressEvents(services);

    await events[EventType.RUN_ENDED]?.[0]?.({
      roomId: "orphan-room",
      runId: "orphan-run",
      status: "completed",
    } as never);

    expect(finishRuntimeRun).not.toHaveBeenCalled();
  });

  it("projects native action events according to the active run's progress mode", async () => {
    const noteRuntimeActionStarted = vi.fn();
    const noteRuntimeActionCompleted = vi.fn();
    const settings = { model: { provider: "ollama", model: "local" } };
    const services = {
      runController: {
        getByRoomId: () => ({ progressMode: "new" }),
        noteRuntimeActionStarted,
        noteRuntimeActionCompleted,
      },
      settings: { get: () => settings },
    } as never;
    const events = createRunProgressEvents(services);

    await events[EventType.ACTION_STARTED]?.[0]?.({
      roomId: "room-1",
      content: { actions: ["WEB_SEARCH"] },
    } as never);
    await events[EventType.ACTION_COMPLETED]?.[0]?.({
      roomId: "room-1",
      content: { actions: ["WEB_SEARCH"] },
    } as never);

    expect(noteRuntimeActionStarted).toHaveBeenCalledWith(
      "room-1",
      "WEB_SEARCH",
    );
    expect(noteRuntimeActionCompleted).not.toHaveBeenCalled();
  });

  it("projects a failed action completion even with progress disabled", async () => {
    const noteRuntimeActionCompleted = vi.fn();
    const services = {
      runController: {
        getByRoomId: () => ({ progressMode: "off" }),
        noteRuntimeActionCompleted,
      },
      settings: { get: () => ({ model: {} }) },
    } as never;
    const events = createRunProgressEvents(services);

    await events[EventType.ACTION_COMPLETED]?.[0]?.({
      roomId: "room-1",
      content: {
        actionResult: { success: false, data: { actionName: "SHELL" } },
      },
    } as never);

    expect(noteRuntimeActionCompleted).toHaveBeenCalledWith("room-1", "SHELL");
  });

  it("records all verified delegated file changes in the run mutation ledger", async () => {
    const recordRuntimeLocalMutation = vi.fn();
    const services = {
      runController: {
        getByRoomId: () => ({ progressMode: "new" }),
        recordRuntimeLocalMutation,
      },
      settings: { get: () => ({ model: {} }) },
    } as never;
    const events = createRunProgressEvents(services);

    await events[EventType.ACTION_COMPLETED]?.[0]?.({
      roomId: "room-1",
      content: {
        actionResult: {
          success: true,
          data: {
            actionName: "TASKS_SPAWN_AGENT",
            delegatedExecution: {
              workdir: "/workspace/project",
              status: "completed",
              verifiedLocalMutation: true,
              changedFiles: [
                { path: "src/app/page.tsx", bytes: 128 },
                { path: "package.json", bytes: 64 },
              ],
            },
          },
        },
      },
    } as never);

    expect(recordRuntimeLocalMutation).toHaveBeenCalledTimes(2);
    expect(recordRuntimeLocalMutation).toHaveBeenNthCalledWith(
      1,
      "room-1",
      expect.objectContaining({
        resolvedPath: "/workspace/project/src/app/page.tsx",
      }),
    );
    expect(recordRuntimeLocalMutation).toHaveBeenNthCalledWith(
      2,
      "room-1",
      expect.objectContaining({
        resolvedPath: "/workspace/project/package.json",
      }),
    );
  });

  it("owns AgentEventService subscriptions through an Eliza service lifecycle", async () => {
    const eventListeners: Array<(event: never) => void> = [];
    const heartbeatListeners: Array<(event: never) => void> = [];
    const unsubscribeEvents = vi.fn();
    const unsubscribeHeartbeat = vi.fn();
    const agentEvents = {
      subscribe: vi.fn((listener: (event: never) => void) => {
        eventListeners.push(listener);
        return unsubscribeEvents;
      }),
      subscribeHeartbeat: vi.fn((listener: (event: never) => void) => {
        heartbeatListeners.push(listener);
        return unsubscribeHeartbeat;
      }),
    };
    const runtime = {
      getServiceLoadPromise: vi.fn(async () => agentEvents),
      getService: vi.fn(() => agentEvents),
    } as unknown as IAgentRuntime;
    const noteRuntimeStream = vi.fn();
    const noteHeartbeat = vi.fn();
    const markRuntimeBridgeAttached = vi.fn();
    const markAgentEventBridgeAttached = vi.fn();
    const services = {
      runController: {
        getByRoomId: () => ({ progressMode: "verbose" }),
        noteRuntimeStream,
        noteHeartbeat,
        markRuntimeBridgeAttached,
        markAgentEventBridgeAttached,
      },
    } as never;

    const RunProgressService = createRunProgressRuntimeService(services);
    const service = await RunProgressService.start(runtime);
    eventListeners[0]?.({
      roomId: "room-1",
      stream: "tool",
      data: { label: "Read file" },
    } as never);
    heartbeatListeners[0]?.({
      status: "thinking",
      preview: "Working",
      indicatorType: "progress",
    } as never);

    expect(runtime.getServiceLoadPromise).toHaveBeenCalledWith("agent_event");
    expect(noteRuntimeStream).toHaveBeenCalledWith(
      "room-1",
      "tool",
      "Read file",
    );
    expect(noteHeartbeat).toHaveBeenCalledWith(
      "thinking",
      "Working",
      "progress",
    );
    expect(markRuntimeBridgeAttached).toHaveBeenCalledWith(true);
    expect(markAgentEventBridgeAttached).toHaveBeenCalledWith(true);

    await service.stop();

    expect(unsubscribeEvents).toHaveBeenCalledOnce();
    expect(unsubscribeHeartbeat).toHaveBeenCalledOnce();
    expect(markRuntimeBridgeAttached).toHaveBeenLastCalledWith(false);
    expect(markAgentEventBridgeAttached).toHaveBeenLastCalledWith(false);
  });
});
