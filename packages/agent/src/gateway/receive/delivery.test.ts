import { describe, expect, it, vi } from "vitest";
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
      recordInbox: vi.fn(
        () => ({ recordId: "inbox-1" }) as unknown as GatewayInboxRecord,
      ),
      recordOutbox: vi.fn(
        () => ({ recordId: "outbox-1" }) as unknown as GatewayOutboxRecord,
      ),
      pushTrace: vi.fn(() => undefined),
      observeAdapter: vi.fn(async () => undefined),
      editDelivery: vi.fn(async () => ({ id: "delivery-1" }) as never),
      snapshotState: vi.fn(async () => undefined),
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

    const delivery = await deliverGatewayReceiveResponse(deps);

    expect(delivery).toEqual({ status: "sent", deliveryId: "delivery-1" });
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

  it("records one durable rejected outbox outcome when adapter send fails", async () => {
    const recordOutbox = vi.fn(
      () => ({ recordId: "outbox-rejected" }) as GatewayOutboxRecord,
    );
    const send = vi.fn(async () => {
      throw new Error("Authorization: Bearer super-secret-token");
    });
    const deps = {
      context: {
        config: {} as AppContext["config"],
        runtime: {} as never,
        services: { media: {} } as never,
      } as unknown as AppContext,
      message: {
        platform: "api",
        userId: "user-1",
        roomId: "room-1",
        text: "hello",
        metadata: { accountId: "work" },
      } as never,
      adapter: { name: "mock-adapter", send } as never,
      recordInbox: vi.fn(),
      recordOutbox,
      pushTrace: vi.fn(),
      observeAdapter: vi.fn(async () => undefined),
      editDelivery: vi.fn(),
      snapshotState: vi.fn(),
      session: { sessionKey: "session-1", platform: "api" } as never,
      response: "full computed response",
      traceId: "trace-rejected",
    } satisfies GatewayReceiveDependencies & {
      session: { sessionKey: string; platform: string };
      response: string;
      traceId: string;
    };

    const outcome = await deliverGatewayReceiveResponse(deps);

    expect(outcome).toMatchObject({
      status: "rejected",
      outboxRecordId: "outbox-rejected",
    });
    expect(outcome.failureNote).toContain("[redacted]");
    expect(outcome.failureNote).not.toContain("super-secret-token");
    expect(recordOutbox).toHaveBeenCalledTimes(1);
    expect(recordOutbox).toHaveBeenCalledWith(
      "api",
      "trace-rejected",
      "session-1",
      undefined,
      expect.objectContaining({
        text: "full computed response",
        metadata: { accountId: "work" },
      }),
      "rejected",
      [expect.stringContaining("[redacted]")],
      undefined,
    );
  });

  it("records one rejected outbox outcome when final progressive edit fails", async () => {
    const recordOutbox = vi.fn(
      () => ({ recordId: "outbox-edit-rejected" }) as GatewayOutboxRecord,
    );
    const send = vi.fn();
    const editDelivery = vi.fn(async () => {
      throw new Error("progressive edit unavailable");
    });
    const deps = {
      context: {
        config: {} as AppContext["config"],
        runtime: {} as never,
        services: { media: {} } as never,
      } as unknown as AppContext,
      message: {
        platform: "api",
        userId: "user-1",
        roomId: "room-1",
        text: "hello",
      } as never,
      adapter: { name: "mock-adapter", send } as never,
      recordInbox: vi.fn(),
      recordOutbox,
      pushTrace: vi.fn(),
      observeAdapter: vi.fn(async () => undefined),
      editDelivery,
      snapshotState: vi.fn(),
      session: { sessionKey: "session-1", platform: "api" } as never,
      response: "final progressive response",
      traceId: "trace-edit-rejected",
      progressiveDelivery: { id: "delivery-progressive" },
    } satisfies GatewayReceiveDependencies & {
      session: { sessionKey: string; platform: string };
      response: string;
      traceId: string;
      progressiveDelivery: { id: string };
    };

    const outcome = await deliverGatewayReceiveResponse(deps);

    expect(outcome).toMatchObject({
      status: "rejected",
      deliveryId: "delivery-progressive",
      outboxRecordId: "outbox-edit-rejected",
    });
    expect(editDelivery).toHaveBeenCalledTimes(1);
    expect(send).not.toHaveBeenCalled();
    expect(recordOutbox).toHaveBeenCalledTimes(1);
    expect(recordOutbox).toHaveBeenCalledWith(
      "api",
      "trace-edit-rejected",
      "session-1",
      undefined,
      expect.objectContaining({ text: "final progressive response" }),
      "rejected",
      ["progressive edit unavailable"],
      "delivery-progressive",
    );
  });

  it("falls back to the product delivery service when no adapter is available", async () => {
    const deliver = vi.fn(() => ({ id: "fallback-delivery" }));
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
      recordInbox: vi.fn(
        () => ({ recordId: "inbox-2" }) as unknown as GatewayInboxRecord,
      ),
      recordOutbox: vi.fn(
        () => ({ recordId: "outbox-2" }) as unknown as GatewayOutboxRecord,
      ),
      pushTrace: vi.fn(() => undefined),
      observeAdapter: vi.fn(async () => undefined),
      editDelivery: vi.fn(async () => ({ id: "delivery-2" }) as never),
      snapshotState: vi.fn(async () => undefined),
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

    const delivery = await deliverGatewayReceiveResponse(deps);

    expect(delivery).toEqual({
      status: "fallback",
      deliveryId: "fallback-delivery",
    });
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
