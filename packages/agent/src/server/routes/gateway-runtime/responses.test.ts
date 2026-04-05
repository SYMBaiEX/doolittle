import { describe, expect, it } from "bun:test";
import type { AppContext } from "@/runtime/bootstrap";
import {
  buildGatewayDaemonResponse,
  buildGatewayHealthResponse,
  buildGatewayJournalResponse,
  buildGatewayRuntimeResponse,
} from "./responses";

function buildGatewayConfig() {
  const platformNames = [
    "api",
    "cli",
    "telegram",
    "discord",
    "slack",
    "whatsapp",
    "signal",
    "matrix",
    "email",
    "sms",
    "mattermost",
    "homeassistant",
    "dingtalk",
  ] as const;

  return {
    allowAllUsers: true,
    sessionTimeoutMinutes: 120,
    mirrorResponsesToHistory: true,
    platforms: Object.fromEntries(
      platformNames.map((platform) => [
        platform,
        {
          enabled: platform === "api" || platform === "cli",
          allowedUserIds: [],
          pairingMode:
            platform === "api" || platform === "cli" ? "allow" : "pair",
          allowAllUsers:
            platform === "api" || platform === "cli" ? true : undefined,
        },
      ]),
    ),
  };
}

function createContext() {
  const calls = {
    health: 0,
    history: [] as Array<{ limit: number }>,
    runtimeStatus: 0,
    trace: [] as Array<{ limit: number }>,
    inbox: [] as Array<{ limit: number }>,
    outbox: [] as Array<{ limit: number }>,
    attachments: [] as Array<{ limit: number }>,
    supervision: [] as Array<number>,
  };

  const context = {
    config: {
      agentName: "Doolittle Test",
      mode: "api",
      host: "127.0.0.1",
      port: 0,
      workspaceDir: "/tmp/workspace",
      dataDir: "/tmp/data",
      skillsDir: "/tmp/skills",
      gatewayDataDir: "/tmp/gateway",
      pairingDefaultMode: "pair",
      allowAllUsers: true,
      telegramBotToken: "",
      discordBotToken: "",
    },
    runtime: {},
    gateway: {
      health: async () => {
        calls.health += 1;
        return { ready: true };
      },
      history: async (limit: number) => {
        calls.history.push({ limit });
        return {
          state: {
            totals: {
              pluginMediatedAdapters: 1,
              officialPluginAdapters: 1,
              vendoredPluginAdapters: 0,
            },
          },
          traces: [{ id: `trace-${limit}` }],
          inbox: [{ id: `inbox-${limit}` }],
          outbox: [{ id: `outbox-${limit}` }],
          attachments: [{ id: `attachment-${limit}` }],
          deliveries: [{ id: `delivery-${limit}` }],
        };
      },
      runtimeStatus: () => {
        calls.runtimeStatus += 1;
        return {
          daemon: { running: true },
          messagingBridge: [{ platform: "telegram", live: true }],
          transportInventory: [{ platform: "api", gatewayEnabled: true }],
          transportControl: { configured: 2 },
        };
      },
      trace: (limit: number) => {
        calls.trace.push({ limit });
        return [{ id: `trace:${limit}` }];
      },
      inbox: (limit: number) => {
        calls.inbox.push({ limit });
        return [{ id: `inbox:${limit}` }];
      },
      outbox: (limit: number) => {
        calls.outbox.push({ limit });
        return [{ id: `outbox:${limit}` }];
      },
      attachments: (limit: number) => {
        calls.attachments.push({ limit });
        return [{ id: `attachment:${limit}` }];
      },
      supervision: (limit: number) => {
        calls.supervision.push(limit);
        return [{ id: `supervision:${limit}` }];
      },
    },
    services: {
      gatewayConfig: buildGatewayConfig(),
      gatewaySessions: {
        list: () => [{ id: "session-1" }],
      },
      nativeOwnership: {
        controlPlane: () => ({
          transportControl: {
            messagingBridge: [{ platform: "telegram", live: true }],
            transportInventory: [{ platform: "telegram", enabled: true }],
            totals: { configured: 1 },
          },
          pluginManager: { available: true },
          identity: { source: "runtime" },
        }),
      },
    },
  } as unknown as AppContext;

  return { context, calls };
}

describe("gateway runtime response helpers", () => {
  it("builds the health response with ownership and history data", async () => {
    const { context, calls } = createContext();
    const body = await buildGatewayHealthResponse(context);

    expect(calls.health).toBe(1);
    expect(calls.history).toEqual([{ limit: 25 }]);
    expect(body.health).toMatchObject({ ready: true });
    expect(
      (body.ownership.pluginManager as Record<string, unknown>).available,
    ).toBe(true);
    expect((body.ownership.identity as Record<string, unknown>).source).toBe(
      "runtime",
    );
    expect(
      (body.sessions as unknown as Array<Record<string, unknown>>)[0]?.id,
    ).toBe("session-1");
    expect(
      (body.traces as unknown as Array<Record<string, unknown>>)[0]?.id,
    ).toBe("trace-25");
  });

  it("builds the runtime and daemon views from the same runtime status", () => {
    const { context, calls } = createContext();
    const runtime = buildGatewayRuntimeResponse(context);
    const daemon = buildGatewayDaemonResponse(context);

    expect(calls.runtimeStatus).toBe(2);
    expect(
      (runtime.runtime.daemon as unknown as Record<string, unknown>).running,
    ).toBe(true);
    expect(
      (runtime.transportControl as Record<string, unknown>).configured,
    ).toBe(2);
    expect((daemon.daemon as unknown as Record<string, unknown>).running).toBe(
      true,
    );
    expect(
      (daemon.runtime.transportControl as Record<string, unknown>).configured,
    ).toBe(2);
  });

  it("builds the journal view from URL filters", async () => {
    const { context, calls } = createContext();
    const body = await buildGatewayJournalResponse(
      context,
      new URL("http://localhost/gateway/journal?limit=7"),
    );

    expect(calls.trace).toEqual([{ limit: 7 }]);
    expect(calls.inbox).toEqual([{ limit: 7 }]);
    expect(calls.outbox).toEqual([{ limit: 7 }]);
    expect(calls.attachments).toEqual([{ limit: 7 }]);
    expect(calls.supervision).toEqual([7]);
    expect(
      (body.traces as unknown as Array<Record<string, unknown>>)[0]?.id,
    ).toBe("trace:7");
    expect(
      (body.inbox as unknown as Array<Record<string, unknown>>)[0]?.id,
    ).toBe("inbox:7");
    expect(
      (body.outbox as unknown as Array<Record<string, unknown>>)[0]?.id,
    ).toBe("outbox:7");
    expect(
      (body.attachments as unknown as Array<Record<string, unknown>>)[0]?.id,
    ).toBe("attachment:7");
    expect(
      (body.supervision as unknown as Array<Record<string, unknown>>)[0]?.id,
    ).toBe("supervision:7");
  });
});
