import { describe, expect, it } from "bun:test";
import { ChannelType, type Memory, type UUID } from "@elizaos/core";
import type { AgentExecutionContext } from "@/runtime/chat";
import { executeProviderMessageTurn } from "./chat-turn/provider-handler";
import { createProviderStreamState } from "./chat-turn/provider-streaming";

function createContext(overrides?: {
  onHandleMessage?: () => Promise<unknown>;
  captureNotice?: (notice: string) => void;
}) {
  const emittedEvents: string[] = [];
  const notices: string[] = [];

  const context = {
    runtime: {
      agentId: "agent-1",
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
  it("executes provider message handling, emits response messages, and returns streamed response", async () => {
    const { context, emittedEvents } = createContext();
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
      derivedTurnPolicy: {
        useMultiStep: true,
        maxIterations: 3,
      },
      abortSignal: undefined,
      settingsDuring: createTurnSettings(),
      loadDirectLocalIntent: async () => undefined,
      onNotice: undefined,
      connectionSource: "cli",
      roomId: "room-1",
      buildProviderFailureMessage: () => "fatal",
      buildNativePlanningFailureMessage: () => "recoverable",
      isRecoverableNativePlanningError: () => false,
    });

    expect(result.handledMessage).toBe(true);
    expect(result.response).toBe("provider response");
    expect(result.runFailureMessage).toBeUndefined();
    expect(emittedEvents).toEqual(["MESSAGE_SENT"]);
    expect(streamState.getResponse()).toBe("provider response");
  });

  it("preserves direct-local fallback behavior for recoverable provider errors", async () => {
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
      derivedTurnPolicy: {
        useMultiStep: false,
        maxIterations: 1,
      },
      abortSignal: undefined,
      settingsDuring: createTurnSettings(),
      loadDirectLocalIntent: async () => ({
        directLocalIntent: { kind: "patch" },
      }),
      onNotice: undefined,
      connectionSource: "cli",
      roomId: "room-2",
      buildProviderFailureMessage: () => "fatal",
      buildNativePlanningFailureMessage: () => "recoverable",
      isRecoverableNativePlanningError: () => true,
    });

    expect(result.handledMessage).toBe(false);
    expect(result.response).toBe("");
    expect(result.runFailureMessage).toBe("local planning failed");
    expect(notices).toEqual([]);
    expect(streamState.getResponse()).toBe("");
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
      derivedTurnPolicy: {
        useMultiStep: true,
        maxIterations: 4,
      },
      abortSignal: undefined,
      settingsDuring: createTurnSettings(),
      loadDirectLocalIntent: async () => undefined,
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
});
