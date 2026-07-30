import { ChannelType, type Memory, type UUID } from "@elizaos/core";
import { describe, expect, it } from "vitest";
import type { AgentExecutionContext } from "@/runtime/chat";
import { executeProviderMessageTurn } from "./chat-turn/provider-handler";
import { createProviderStreamState } from "./chat-turn/provider-streaming";

function createContext(overrides?: {
  onHandleMessage?: () => Promise<unknown>;
  captureNotice?: (notice: string) => void;
  trajectoryLogger?: unknown;
  sdkEmitsMessageSent?: boolean;
}) {
  const emittedEvents: string[] = [];
  const notices: string[] = [];
  const trajectoryLogger = overrides?.trajectoryLogger;

  const context = {
    runtime: {
      agentId: "agent-1",
      getService: (service: string) =>
        service === "trajectories" ? trajectoryLogger : null,
      getServicesByType: (service: string) =>
        service === "trajectories" && trajectoryLogger
          ? [trajectoryLogger]
          : [],
      emitEvent: async (eventType: string) => {
        emittedEvents.push(eventType);
      },
      logger: {
        warn: () => undefined,
      },
      messageService: {
        handleMessage: async (
          _runtime: unknown,
          _memory: unknown,
          onContent: (content: unknown) => Promise<unknown>,
        ) => {
          await onContent({ text: "provider response" } as never);
          if (overrides?.sdkEmitsMessageSent) {
            emittedEvents.push("MESSAGE_SENT");
          }
          if (overrides?.onHandleMessage) {
            return overrides.onHandleMessage();
          }
          return {
            responseMessages: [
              {
                id: "resp-1",
                content: {
                  text: "response message",
                },
              },
            ],
          };
        },
      },
    },
  } as unknown as AgentExecutionContext;

  return {
    context,
    emittedEvents,
    notices,
    onNotice: overrides?.captureNotice
      ? async (notice: { message: string }) => {
          overrides.captureNotice?.(notice.message);
          notices.push(notice.message);
        }
      : undefined,
  };
}

function createTurnSettings() {
  return {
    model: {
      provider: "provider-name",
      model: "m-1",
      baseUrl: "https://provider.local",
      temperature: 0.2,
      maxTokens: 512,
    },
  };
}

describe("chat turn provider handler", () => {
  it("returns the terminal SDK response without re-emitting SDK message events", async () => {
    const { context, emittedEvents } = createContext({
      sdkEmitsMessageSent: true,
    });
    const streamState = createProviderStreamState({
      resolveStreamingUpdate: (current: string, incoming: string) => {
        return {
          kind: "append",
          emittedText: incoming,
          nextText: current + incoming,
        };
      },
      extractCompatTextContent: (content) =>
        typeof content === "object" && content !== null && "text" in content
          ? ((content as { text?: string }).text ?? "")
          : "",
    });

    const result = await executeProviderMessageTurn({
      context,
      memory: {
        id: "memory-1" as UUID,
        roomId: "room-1" as UUID,
        entityId: "entity-1" as UUID,
        content: {
          text: "provider response",
          source: "cli",
          channelType: ChannelType.DM,
        },
        metadata: { source: "cli" },
      } as Memory,
      streamState,
      messagePolicy: {
        useMultiStep: true,
        maxIterations: 3,
      },
      abortSignal: undefined,
      settingsDuring: createTurnSettings(),
      onNotice: undefined,
      connectionSource: "cli",
      roomId: "room-1",
      buildProviderFailureMessage: () => "fatal",
      buildNativePlanningFailureMessage: () => "recoverable",
      isRecoverableNativePlanningError: () => false,
    });

    expect(result.handledMessage).toBe(true);
    expect(result.response).toBe("response message");
    expect(result.runFailureMessage).toBeUndefined();
    expect(emittedEvents).toEqual(["MESSAGE_SENT"]);
    expect(streamState.getResponse()).toBe("response message");
  });

  it("starts a standalone SDK trajectory and leaves model-call logging to runtime.useModel", async () => {
    const started: unknown[] = [];
    const ended: unknown[] = [];
    const llmCalls: Array<Record<string, unknown>> = [];
    const trajectoryLogger = {
      isEnabled: () => true,
      startTrajectory: (agentId: string, options: Record<string, unknown>) => {
        started.push({ agentId, options });
        return "trajectory-1";
      },
      startStep: (trajectoryId: string) => {
        expect(trajectoryId).toBe("trajectory-1");
        return "step-1";
      },
      flushWriteQueue: (trajectoryId: string) => {
        expect(trajectoryId).toBe("trajectory-1");
      },
      endTrajectory: (trajectoryId: string, status: string) => {
        ended.push({ trajectoryId, status });
      },
      logLlmCall: (params: Record<string, unknown>) => {
        llmCalls.push(params);
      },
    };
    const { context } = createContext({ trajectoryLogger });
    const streamState = createProviderStreamState({
      resolveStreamingUpdate: (current: string, incoming: string) => ({
        kind: "append",
        emittedText: incoming,
        nextText: current + incoming,
      }),
      extractCompatTextContent: (content) =>
        typeof content === "object" && content !== null && "text" in content
          ? ((content as { text?: string }).text ?? "")
          : "",
    });
    const memory = {
      id: "memory-sdk" as UUID,
      roomId: "room-sdk" as UUID,
      entityId: "entity-sdk" as UUID,
      content: {
        text: "bridge this turn",
        source: "cli",
        channelType: ChannelType.DM,
      },
      metadata: {
        source: "cli",
        doolittle: {
          userId: "alice",
        },
      },
    } as Memory;

    const result = await executeProviderMessageTurn({
      context,
      memory,
      sessionId: "session-sdk",
      runId: "run-sdk",
      streamState,
      messagePolicy: {
        useMultiStep: true,
        maxIterations: 3,
      },
      abortSignal: undefined,
      settingsDuring: createTurnSettings(),
      onNotice: undefined,
      connectionSource: "cli",
      roomId: "room-sdk",
      buildProviderFailureMessage: () => "fatal",
      buildNativePlanningFailureMessage: () => "recoverable",
      isRecoverableNativePlanningError: () => false,
    });

    expect(result.response).toBe("response message");
    expect(started).toHaveLength(1);
    expect(ended).toEqual([
      { trajectoryId: "trajectory-1", status: "completed" },
    ]);
    expect(
      (memory.metadata as { trajectoryStepId?: string }).trajectoryStepId,
    ).toBe("step-1");
    expect(llmCalls).toEqual([]);
  });

  it("surfaces recoverable SDK planning failures without a second executor", async () => {
    const { context, notices } = createContext({
      onHandleMessage: async () => {
        throw new Error("local planning failed");
      },
    });
    const streamState = createProviderStreamState({
      resolveStreamingUpdate: () => ({
        kind: "append",
        emittedText: "",
        nextText: "",
      }),
      extractCompatTextContent: () => "",
    });

    const result = await executeProviderMessageTurn({
      context,
      memory: {
        id: "memory-2" as UUID,
        roomId: "room-2" as UUID,
        entityId: "entity-2" as UUID,
        content: {
          text: "provider response",
          source: "cli",
          channelType: ChannelType.DM,
        },
        metadata: { source: "cli" },
      } as Memory,
      streamState,
      messagePolicy: {
        useMultiStep: false,
        maxIterations: 1,
      },
      abortSignal: undefined,
      settingsDuring: createTurnSettings(),
      onNotice: undefined,
      connectionSource: "cli",
      roomId: "room-2",
      buildProviderFailureMessage: () => "fatal",
      buildNativePlanningFailureMessage: () => "recoverable",
      isRecoverableNativePlanningError: () => true,
    });

    expect(result.handledMessage).toBe(false);
    expect(result.response).toBe("recoverable");
    expect(result.runFailureMessage).toBe("recoverable");
    expect(notices).toEqual([]);
    expect(streamState.getResponse()).toBe("recoverable");
  });

  it("emits status notices and returns provider failures for non-recoverable errors", async () => {
    const { context, notices } = createContext({
      onHandleMessage: async () => {
        throw new Error("timeout");
      },
      captureNotice: (notice) => {
        expect(notice).toBe("provider unavailable");
      },
    });
    const streamState = createProviderStreamState({
      resolveStreamingUpdate: () => ({
        kind: "append",
        emittedText: "",
        nextText: "",
      }),
      extractCompatTextContent: () => "",
    });

    const result = await executeProviderMessageTurn({
      context,
      memory: {
        id: "memory-3" as UUID,
        roomId: "room-3" as UUID,
        entityId: "entity-3" as UUID,
        content: {
          text: "provider response",
          source: "cli",
          channelType: ChannelType.DM,
        },
        metadata: { source: "cli" },
      } as Memory,
      streamState,
      messagePolicy: {
        useMultiStep: true,
        maxIterations: 4,
      },
      abortSignal: undefined,
      settingsDuring: createTurnSettings(),
      onNotice: async (notice: { message: string }) => {
        notices.push(notice.message);
      },
      connectionSource: "cli",
      roomId: "room-3",
      buildProviderFailureMessage: () => "provider unavailable",
      buildNativePlanningFailureMessage: () => "recoverable",
      isRecoverableNativePlanningError: () => false,
    });

    expect(result.handledMessage).toBe(false);
    expect(result.response).toBe("provider unavailable");
    expect(result.runFailureMessage).toBe("provider unavailable");
    expect(notices).toEqual(["provider unavailable"]);
    expect(streamState.getResponse()).toBe("provider unavailable");
  });

  it("propagates cancellation instead of rewriting it as a provider failure", async () => {
    const controller = new AbortController();
    const { context, notices } = createContext({
      onHandleMessage: async () => {
        controller.abort();
        throw new Error("provider aborted");
      },
      captureNotice: (notice) => notices.push(notice),
    });
    const streamState = createProviderStreamState({
      resolveStreamingUpdate: () => ({
        kind: "append",
        emittedText: "",
        nextText: "",
      }),
      extractCompatTextContent: () => "",
    });

    await expect(
      executeProviderMessageTurn({
        context,
        memory: {
          id: "memory-cancel" as UUID,
          roomId: "room-cancel" as UUID,
          entityId: "entity-cancel" as UUID,
          content: {
            text: "stop this turn",
            source: "desktop",
            channelType: ChannelType.DM,
          },
          metadata: { source: "desktop" },
        } as Memory,
        streamState,
        messagePolicy: {
          useMultiStep: true,
          maxIterations: 4,
        },
        abortSignal: controller.signal,
        settingsDuring: createTurnSettings(),
        onNotice: async (notice) => {
          notices.push(notice.message);
        },
        connectionSource: "desktop",
        roomId: "room-cancel",
        buildProviderFailureMessage: () => "provider unavailable",
        buildNativePlanningFailureMessage: () => "recoverable",
        isRecoverableNativePlanningError: () => true,
      }),
    ).rejects.toThrow("provider aborted");
    expect(notices).toEqual([]);
  });
});
