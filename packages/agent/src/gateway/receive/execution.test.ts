import { describe, expect, it, mock } from "bun:test";
import type {
  GatewayInboxRecord,
  GatewayOutboxRecord,
} from "../read/history-view";
import { executeGatewayReceiveTurn } from "./execution";
import type { GatewayReceiveDependencies } from "./types";

describe("executeGatewayReceiveTurn", () => {
  it("streams progress through the extracted queue and preserves the tracked session id", async () => {
    const queueProgressFlush = mock(async () => undefined);
    const deps = {
      context: {
        config: {} as never,
        runtime: {} as never,
        services: {} as never,
      },
      message: {
        platform: "api",
        userId: "user-1",
        roomId: "room-1",
        text: "hello",
      } as never,
      session: {
        sessionKey: "session-1",
        activeAgentSessionId: "run-1",
        platform: "api",
        threadId: "thread-1",
      } as never,
      adapter: undefined,
      recordInbox: mock(
        () => ({ recordId: "inbox-1" }) as unknown as GatewayInboxRecord,
      ),
      recordOutbox: mock(
        () => ({ recordId: "outbox-1" }) as unknown as GatewayOutboxRecord,
      ),
      pushTrace: mock(() => undefined),
      observeAdapter: mock(async () => undefined),
      editDelivery: mock(async () => ({ id: "delivery-1" }) as never),
      snapshotState: mock(async () => undefined),
      createProgressiveQueue: () => ({
        queueProgressFlush,
        getProgressiveDelivery: () =>
          ({
            id: "progressive-1",
            target: {
              platform: "api",
              channelId: "room-1",
              userId: "user-1",
              mode: "origin",
            },
            text: "partial",
            createdAt: "2026-04-01T00:00:00.000Z",
          }) as never,
      }),
      executeTurn: mock(async (_input, _context, hooks) => {
        await hooks.onProgress?.({
          delta: "Hello",
          response: "Hello world",
          phase: "model",
        });
        await hooks.onRunEvent?.({
          run: { progressMode: "verbose" },
        } as never);
        return { response: "final response", sessionId: "run-1" };
      }),
    } satisfies GatewayReceiveDependencies & {
      session: {
        sessionKey: string;
        activeAgentSessionId?: string;
        platform: string;
        threadId?: string;
      };
      createProgressiveQueue: () => {
        queueProgressFlush: typeof queueProgressFlush;
        getProgressiveDelivery: () => { id: string } | undefined;
      };
      executeTurn: typeof import("@/runtime/turn-stream").executeAgentTurnWithProgress;
    };

    const result = await executeGatewayReceiveTurn(deps);

    expect(result.response).toBe("final response");
    expect(result.runSessionId).toBe("run-1");
    expect(result.progressiveDelivery).toEqual({ id: "progressive-1" });
    expect(queueProgressFlush).toHaveBeenCalled();
  });
});
