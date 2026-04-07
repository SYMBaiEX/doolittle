import { describe, expect, it, mock } from "bun:test";
import type { AppContext } from "@/runtime/bootstrap";
import type {
  GatewayInboxRecord,
  GatewayOutboxRecord,
} from "../read/history-view";
import { deliverGatewayReceiveResponse } from "./delivery";
import type { GatewayReceiveDependencies } from "./types";

describe("deliverGatewayReceiveResponse", () => {
  it("uses the live adapter when available and records delivery traces", async () => {
    const deps = {
      context: {
        config: {} as AppContext["config"],
        runtime: {} as never,
        services: {
          media: {
            speak: async () => ({
              artifactPath: "/tmp/speech.svg",
              artifactKind: "svg" as const,
            }),
          },
          delivery: {
            deliver: () => ({ id: "fallback-delivery" }),
          },
        } as never,
      } as unknown as AppContext,
      message: {
        platform: "api",
        userId: "user-1",
        roomId: "room-1",
        text: "hello",
        metadata: { source: "gateway" },
      } as never,
      adapter: {
        name: "mock-adapter",
        send: async () => ({ id: "delivery-1", metadata: {} }) as never,
      } as never,
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
      session: {
        sessionKey: "session-1",
        platform: "api",
        threadId: "thread-1",
      } as never,
      response: "final response",
      traceId: "trace-1",
    } satisfies GatewayReceiveDependencies & {
      session: { sessionKey: string; platform: string; threadId?: string };
      response: string;
      traceId: string;
      progressiveDelivery?: { id: string };
    };

    const deliveryId = await deliverGatewayReceiveResponse(deps);

    expect(deliveryId).toBe("delivery-1");
    expect(deps.pushTrace).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "respond",
        sessionId: "session-1",
      }),
    );
    expect(deps.recordOutbox).toHaveBeenCalled();
    expect(deps.pushTrace).toHaveBeenCalled();
    expect(deps.observeAdapter).toHaveBeenCalled();
  });

  it("falls back to the product delivery service when no adapter is available", async () => {
    const deliver = mock(() => ({ id: "fallback-delivery" }));
    const deps = {
      context: {
        config: {} as AppContext["config"],
        runtime: {} as never,
        services: {
          media: {},
          delivery: {
            deliver,
          },
        } as never,
      } as unknown as AppContext,
      message: {
        platform: "api",
        userId: "user-1",
        roomId: "room-1",
        text: "hello",
      } as never,
      adapter: undefined,
      recordInbox: mock(
        () => ({ recordId: "inbox-2" }) as unknown as GatewayInboxRecord,
      ),
      recordOutbox: mock(
        () => ({ recordId: "outbox-2" }) as unknown as GatewayOutboxRecord,
      ),
      pushTrace: mock(() => undefined),
      observeAdapter: mock(async () => undefined),
      editDelivery: mock(async () => ({ id: "delivery-2" }) as never),
      snapshotState: mock(async () => undefined),
      session: {
        sessionKey: "session-2",
        platform: "api",
      } as never,
      response: "fallback response",
      traceId: "trace-2",
    } satisfies GatewayReceiveDependencies & {
      session: { sessionKey: string; platform: string };
      response: string;
      traceId: string;
      progressiveDelivery?: { id: string };
    };

    const deliveryId = await deliverGatewayReceiveResponse(deps);

    expect(deliveryId).toBe("fallback-delivery");
    expect(deliver).toHaveBeenCalled();
    expect(deps.pushTrace).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "respond",
        sessionId: "session-2",
      }),
    );
    expect(deps.recordOutbox).toHaveBeenCalledWith(
      "api",
      "trace-2",
      "session-2",
      expect.objectContaining({ id: "fallback-delivery" }),
      expect.objectContaining({ text: "fallback response" }),
      "fallback",
    );
  });
});
