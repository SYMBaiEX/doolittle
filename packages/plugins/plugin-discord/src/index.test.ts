import { describe, expect, it } from "bun:test";
import type { IAgentRuntime, Plugin } from "@elizaos/core";
import createDiscordPlugin from "./index";

type GatewayStatus = {
  pid: number;
  running: boolean;
  updatedAt: string;
};

type GatewayTrace = {
  traceId: string;
  at: string;
  kind: string;
  platform: string;
  detail: string;
};

type GatewayServiceStub = {
  startGateway: () => Promise<void>;
  runner: {
    runtimeStatus: () => GatewayStatus;
    trace: (limit: number, filters?: { platform?: string }) => GatewayTrace[];
  };
};

type DiscordServiceShape = {
  start(): Promise<void>;
  stop(): Promise<void>;
  status(): Promise<{
    enabled: boolean;
    tokenConfigured: boolean;
    gateway: GatewayStatus | null;
  }>;
  history(limit?: number): GatewayTrace[];
};

type DiscordServiceClass = {
  serviceType: string;
  start(runtime: IAgentRuntime): Promise<DiscordServiceShape>;
};

describe("discord plugin", () => {
  it("starts the gateway transport and reports status/history", async () => {
    const startCalls: string[] = [];
    const gatewayService: GatewayServiceStub = {
      startGateway: async () => {
        startCalls.push("started");
      },
      runner: {
        runtimeStatus: () => ({
          pid: 4242,
          running: true,
          updatedAt: "2026-04-13T12:00:00.000Z",
        }),
        trace: (limit, filters) =>
          limit === 5 && filters?.platform === "discord"
            ? [
                {
                  traceId: "trace-1",
                  at: "2026-04-13T12:01:00.000Z",
                  kind: "deliver",
                  platform: "discord",
                  detail: "Sent response",
                },
              ]
            : [],
      },
    };

    const runtime = {
      getService<T>(name: string) {
        return (name === "doolittle_gateway"
          ? gatewayService
          : null) as T | null;
      },
    } as unknown as IAgentRuntime;

    const plugin = createDiscordPlugin({
      enabled: true,
      tokenConfigured: true,
    }) as Plugin & { services: unknown[] };
    const ServiceClass = plugin.services[0] as unknown as DiscordServiceClass;
    const service = await ServiceClass.start(runtime);

    await service.start();

    expect(plugin.name).toBe("discord");
    expect(ServiceClass.serviceType).toBe("discord_transport");
    expect(startCalls).toEqual(["started"]);
    await expect(service.status()).resolves.toEqual({
      enabled: true,
      tokenConfigured: true,
      gateway: {
        pid: 4242,
        running: true,
        updatedAt: "2026-04-13T12:00:00.000Z",
      },
    });
    expect(service.history(5)).toEqual([
      {
        traceId: "trace-1",
        at: "2026-04-13T12:01:00.000Z",
        kind: "deliver",
        platform: "discord",
        detail: "Sent response",
      },
    ]);
    await expect(service.stop()).resolves.toBeUndefined();
  });

  it("degrades cleanly when the gateway service is unavailable", async () => {
    const runtime = {
      getService<T>() {
        return null as T | null;
      },
    } as unknown as IAgentRuntime;

    const plugin = createDiscordPlugin({
      enabled: false,
      tokenConfigured: false,
    }) as Plugin & { services: unknown[] };
    const ServiceClass = plugin.services[0] as unknown as DiscordServiceClass;
    const service = await ServiceClass.start(runtime);

    await expect(service.status()).resolves.toEqual({
      enabled: false,
      tokenConfigured: false,
      gateway: null,
    });
    expect(service.history()).toEqual([]);
  });
});
