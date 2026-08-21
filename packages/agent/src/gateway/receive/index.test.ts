import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GatewayReceiveDependencies } from "./types";

const {
  deliverGatewayReceiveResponse,
  executeGatewayReceiveTurn,
  setupGatewayReceive,
} = vi.hoisted(() => ({
  deliverGatewayReceiveResponse: vi.fn(),
  executeGatewayReceiveTurn: vi.fn(),
  setupGatewayReceive: vi.fn(),
}));

vi.mock("./delivery", () => ({ deliverGatewayReceiveResponse }));
vi.mock("./execution", () => ({ executeGatewayReceiveTurn }));
vi.mock("./setup", () => ({ setupGatewayReceive }));

import { processGatewayReceive } from "./index";

describe("processGatewayReceive outcome", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("hydrates optional plugins before gateway setup begins", async () => {
    const order: string[] = [];
    const ensureDeferredHydration = vi.fn(async () => {
      order.push("hydrate");
    });
    setupGatewayReceive.mockImplementation(async () => {
      order.push("setup");
      return {
        response: {
          ok: false,
          response: "not authorized",
          traceId: "trace-rejected",
        },
      };
    });
    const deps = {
      context: {
        config: {},
        runtime: {},
        services: {},
        ensureDeferredHydration,
      },
      message: {
        platform: "api",
        userId: "user-1",
        roomId: "room-1",
        text: "request",
      },
    } as unknown as GatewayReceiveDependencies;

    await processGatewayReceive(deps);

    expect(ensureDeferredHydration).toHaveBeenCalledWith("gateway-receive");
    expect(order).toEqual(["hydrate", "setup"]);
  });

  it("keeps agent completion hooks and snapshots truthful after delivery rejection", async () => {
    const emit = vi.fn(async () => undefined);
    const snapshotState = vi.fn(async () => undefined);
    setupGatewayReceive.mockResolvedValue({
      session: {
        sessionKey: "session-1",
        roomId: "room-1",
        userId: "user-1",
        platform: "api",
      },
    });
    executeGatewayReceiveTurn.mockResolvedValue({
      response: "computed successfully",
      runSessionId: "run-1",
      progressiveDelivery: undefined,
      progressiveFailure: undefined,
    });
    deliverGatewayReceiveResponse.mockResolvedValue({
      status: "rejected",
      failureNote: "adapter unavailable",
      outboxRecordId: "outbox-rejected",
    });
    const deps = {
      context: {
        config: {},
        runtime: {},
        services: { hooks: { emit } },
      },
      message: {
        platform: "api",
        userId: "user-1",
        roomId: "room-1",
        text: "request",
      },
      recordInbox: vi.fn(),
      recordOutbox: vi.fn(),
      pushTrace: vi.fn(),
      observeAdapter: vi.fn(),
      editDelivery: vi.fn(),
      snapshotState,
    } as unknown as GatewayReceiveDependencies;

    const result = await processGatewayReceive(deps);

    expect(result).toMatchObject({
      ok: false,
      response: "computed successfully",
      sessionId: "session-1",
      runSessionId: "run-1",
      agentCompleted: true,
      deliveryStatus: "rejected",
      deliveryFailure: "adapter unavailable",
      outboxRecordId: "outbox-rejected",
    });
    expect(emit).toHaveBeenCalledWith("agent:end", {
      platform: "api",
      userId: "user-1",
      sessionId: "session-1",
      response: "computed successfully",
    });
    expect(snapshotState).toHaveBeenCalledWith("receive", 20);
  });

  it("marks a missing initialized session as transient", async () => {
    setupGatewayReceive.mockResolvedValue({
      traceId: "trace-session-failure",
      metadataKeys: [],
    });
    const deps = {
      context: {
        config: {},
        runtime: {},
        services: { hooks: { emit: vi.fn() } },
      },
      message: {
        platform: "api",
        userId: "user-1",
        roomId: "room-1",
        text: "request",
      },
    } as unknown as GatewayReceiveDependencies;

    await expect(processGatewayReceive(deps)).resolves.toMatchObject({
      ok: false,
      response: "Unable to initialize gateway receive session.",
      idempotencyDisposition: "transient",
    });
    expect(executeGatewayReceiveTurn).not.toHaveBeenCalled();
    expect(deliverGatewayReceiveResponse).not.toHaveBeenCalled();
  });

  it("logs redacted hook and snapshot failures without changing delivery truth", async () => {
    const warn = vi.fn();
    setupGatewayReceive.mockResolvedValue({
      session: {
        sessionKey: "session-1",
        roomId: "room-1",
        userId: "user-1",
        platform: "api",
      },
    });
    executeGatewayReceiveTurn.mockResolvedValue({
      response: "computed successfully",
      runSessionId: "run-1",
      progressiveDelivery: undefined,
      progressiveFailure: undefined,
    });
    deliverGatewayReceiveResponse.mockResolvedValue({
      status: "sent",
      deliveryId: "delivery-1",
    });
    const deps = {
      context: {
        runtime: { logger: { warn } },
        services: {
          hooks: {
            emit: vi.fn(async () => {
              throw new Error("Authorization: Bearer secret-hook-token");
            }),
          },
        },
      },
      message: {
        platform: "api",
        userId: "user-1",
        roomId: "room-1",
        text: "request",
      },
      snapshotState: vi.fn(async () => {
        throw new Error("api_key=secret-snapshot-key");
      }),
    } as unknown as GatewayReceiveDependencies;

    await expect(processGatewayReceive(deps)).resolves.toMatchObject({
      ok: true,
      agentCompleted: true,
      deliveryStatus: "sent",
    });
    expect(warn).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(warn.mock.calls)).not.toContain("secret-hook-token");
    expect(JSON.stringify(warn.mock.calls)).not.toContain(
      "secret-snapshot-key",
    );
    expect(warn.mock.calls.map(([fields]) => fields.phase)).toEqual([
      "agent:end",
      "snapshot",
    ]);
  });
});
