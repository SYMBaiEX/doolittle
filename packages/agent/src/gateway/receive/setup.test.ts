import { describe, expect, it, mock } from "bun:test";
import { loadGatewayConfig } from "@/config/gateway";
import type { AppContext } from "@/runtime/bootstrap";
import type { GatewayInboxRecord } from "../read/history-view";
import { setupGatewayReceive } from "./setup";
import type { GatewayReceiveDependencies } from "./types";

function createContext(): GatewayReceiveDependencies {
  const config = {
    agentName: "test-agent",
    mode: "cli",
    host: "127.0.0.1",
    port: 0,
    dataDir: "/tmp/doolittle-data",
    gatewayDataDir: "/tmp/doolittle-gateway",
    homeAssistantUrl: "https://homeassistant.local",
    homeAssistantToken: "token",
    allowAllUsers: true,
    pairingDefaultMode: "allow",
  } as unknown as AppContext["config"];
  const gatewayConfig = loadGatewayConfig(config);
  gatewayConfig.platforms.api.enabled = true;

  return {
    context: {
      config,
      services: {
        gatewayConfig,
        pairing: {
          isAllowed: () => false,
          create: () => ({ code: "PAIR-1" }),
        } as never,
        gatewaySessions: {
          resolve: () => ({
            sessionKey: "session-1",
            activeAgentSessionId: "run-1",
            platform: "api",
            metadata: { from: "test" },
          }),
        } as never,
        hooks: {
          emit: mock(async () => undefined),
        } as never,
      },
      runtime: {} as never,
    } as unknown as AppContext,
    message: {
      platform: "api",
      userId: "user-1",
      roomId: "room-1",
      text: "hello",
      metadata: { source: "gateway" },
    } as never,
    adapter: {
      canReceive: () => true,
    } as never,
    recordInbox: mock(
      () => ({ recordId: "inbox-1" }) as unknown as GatewayInboxRecord,
    ),
    recordOutbox: mock(() => ({ recordId: "outbox-1" }) as never),
    pushTrace: mock(() => undefined),
    observeAdapter: mock(async () => undefined),
    editDelivery: mock(async () => ({ id: "delivery-1" }) as never),
    snapshotState: mock(async () => undefined),
  } satisfies GatewayReceiveDependencies;
}

describe("setupGatewayReceive", () => {
  it("rejects transport that cannot receive", async () => {
    const deps = createContext();
    deps.adapter = {
      canReceive: () => false,
    } as never;

    const result = await setupGatewayReceive({
      ...deps,
      traceId: "trace-1",
      at: () => "2026-04-01T00:00:00.000Z",
      metadataKeys: ["source"],
    });

    expect(result.response).toMatchObject({
      ok: false,
      traceId: "trace-1",
    });
    expect(deps.recordInbox).toHaveBeenCalledWith(
      deps.message,
      "trace-1",
      undefined,
      "rejected",
      ["api transport is not ready for inbound traffic."],
    );
    expect(deps.pushTrace).toHaveBeenCalled();
    expect(deps.observeAdapter).toHaveBeenCalledTimes(2);
  });

  it("authorizes the inbound message, resolves a session, and records acceptance", async () => {
    const deps = createContext();

    const result = await setupGatewayReceive({
      ...deps,
      traceId: "trace-2",
      at: () => "2026-04-01T00:00:00.000Z",
      metadataKeys: ["source"],
    });

    expect(result.sessionKey).toBe("session-1");
    expect(result.session?.sessionKey).toBe("session-1");
    expect(result.response).toBeUndefined();
    expect(deps.recordInbox).toHaveBeenCalledWith(
      deps.message,
      "trace-2",
      "session-1",
      "accepted",
    );
    expect(deps.pushTrace).toHaveBeenCalledTimes(4);
    expect(deps.observeAdapter).toHaveBeenCalledTimes(3);
    expect(deps.context.services.hooks.emit).toHaveBeenCalledWith(
      "session:start",
      {
        platform: "api",
        userId: "user-1",
        sessionId: "session-1",
      },
    );
  });
});
