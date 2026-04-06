import { describe, expect, it } from "bun:test";
import type { AppContext } from "@/runtime/bootstrap";
import { handleTransportRoutes } from "@/server/routes/transport";

function createContext(options?: { withGateway?: boolean }) {
  const gateway =
    options?.withGateway === false
      ? undefined
      : {
          state: async () => ({
            totals: { enabled: 1 },
            platforms: [{ platform: "telegram", enabled: true }],
          }),
          transportOverview: async () => ({
            mismatches: [{ platform: "telegram" }],
          }),
          transport: async (platform: string) => ({
            platform,
            summary: `detail:${platform}`,
            readiness: { ready: true },
            platformState: { nativePluginId: "messaging.telegram" },
            recentTraces: [],
            recentInbox: [],
            recentOutbox: [],
            recentAttachments: [],
          }),
          runtimeStatus: () => ({
            transportInventory: [
              { platform: "telegram", gatewayEnabled: true },
            ],
            transportControl: { gatewayEnabled: 1 },
            messagingBridge: [{ platform: "telegram", live: true }],
          }),
        };

  return {
    config: {
      telegramBotToken: "token",
      discordBotToken: "",
      providers: {},
    },
    runtime: {},
    gateway,
    services: {
      gatewayConfig: {
        platforms: {
          api: { enabled: true },
          cli: { enabled: true },
          telegram: { enabled: true },
          discord: { enabled: false },
          slack: { enabled: false },
          whatsapp: { enabled: false },
          signal: { enabled: false },
          matrix: { enabled: false },
          email: { enabled: false },
          sms: { enabled: false },
          mattermost: { enabled: false },
          homeassistant: { enabled: false },
          dingtalk: { enabled: false },
        },
        transports: [],
      },
      nativeRegistry: {
        browser: "plugin",
      },
      nativeOwnership: {
        controlPlane: () => ({
          transportControl: {
            messagingBridge: [{ platform: "telegram", live: true }],
            transportInventory: [{ platform: "telegram", enabled: true }],
            totals: { configured: 1 },
          },
          serviceResolution: { browser: "plugin" },
          pluginManager: { available: true },
          identity: { source: "runtime" },
        }),
        snapshot: async () => ({
          ownership: "snapshot",
        }),
      },
      web: {
        status: async () => ({ ready: false }),
      },
      mcp: {
        status: () => ({ ready: false }),
        getCachedTools: () => [],
      },
    },
  } as unknown as AppContext;
}

describe("handleTransportRoutes", () => {
  it("rejects platform requests when no gateway is attached", async () => {
    const response = await handleTransportRoutes(
      createContext({ withGateway: false }),
      new Request("http://localhost/platforms"),
      new URL("http://localhost/platforms"),
    );

    expect(response?.status).toBe(503);
  });

  it("returns runtime services and ownership views", async () => {
    const servicesResponse = await handleTransportRoutes(
      createContext(),
      new Request("http://localhost/runtime/services"),
      new URL("http://localhost/runtime/services"),
    );
    const ownershipResponse = await handleTransportRoutes(
      createContext(),
      new Request("http://localhost/runtime/ownership"),
      new URL("http://localhost/runtime/ownership"),
    );

    const servicesBody = (await servicesResponse?.json()) as {
      resolution: Record<string, string>;
      registry: Record<string, string>;
    };

    expect(servicesBody.resolution).toEqual({ browser: "plugin" });
    expect(servicesBody.registry).toEqual({ browser: "plugin" });
    await expect(ownershipResponse?.json()).resolves.toEqual({
      ownership: "snapshot",
    });
  });

  it("returns transport inventory and mismatch summaries", async () => {
    const inventoryResponse = await handleTransportRoutes(
      createContext(),
      new Request("http://localhost/transport/inventory"),
      new URL("http://localhost/transport/inventory"),
    );
    const mismatchResponse = await handleTransportRoutes(
      createContext(),
      new Request("http://localhost/transport/mismatches"),
      new URL("http://localhost/transport/mismatches"),
    );

    const inventoryBody = (await inventoryResponse?.json()) as {
      totals: {
        configured: number;
      };
    };

    expect(inventoryBody.totals.configured).toBeGreaterThan(0);
    await expect(mismatchResponse?.json()).resolves.toEqual({
      mismatches: [{ platform: "telegram" }],
    });
  });

  it("returns transport drilldown and validates platforms", async () => {
    const detailResponse = await handleTransportRoutes(
      createContext(),
      new Request("http://localhost/transport/telegram"),
      new URL("http://localhost/transport/telegram"),
    );
    const invalidResponse = await handleTransportRoutes(
      createContext(),
      new Request("http://localhost/transport/nope"),
      new URL("http://localhost/transport/nope"),
    );

    const detailBody = (await detailResponse?.json()) as {
      platform: string;
      gateway: {
        summary: string;
      };
    };

    expect(detailBody.platform).toBe("telegram");
    expect(detailBody.gateway.summary).toBe("detail:telegram");
    expect(invalidResponse?.status).toBe(404);
  });

  it("returns null for unrelated routes", async () => {
    const response = await handleTransportRoutes(
      createContext(),
      new Request("http://localhost/not-transport"),
      new URL("http://localhost/not-transport"),
    );

    expect(response).toBeNull();
  });
});
