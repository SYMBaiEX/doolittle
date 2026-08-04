import { EventType, type IAgentRuntime } from "@elizaos/core";
import { describe, expect, it, vi } from "vitest";

import {
  agentEventLabel,
  createRunProgressEvents,
  createRunProgressRuntimeService,
  eventActionLabel,
  eventActionResult,
  eventRoomId,
  shouldProjectNativeToolProgress,
} from "./run-progress";

describe("run progress helpers", () => {
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
      runId: "chat-run",
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
