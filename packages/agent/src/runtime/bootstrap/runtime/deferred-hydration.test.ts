import { describe, expect, it } from "bun:test";
import type { Plugin } from "@elizaos/core";
import { StartupStateService } from "@/services/startup-state-service";
import { createDeferredHydrator } from "./deferred-hydration";

function createServices() {
  return {
    startupState: new StartupStateService(),
  } as {
    startupState: StartupStateService;
  };
}

describe("createDeferredHydrator", () => {
  it("registers deferred plugins only once and warms deferred services", async () => {
    const services = createServices();
    const registered: Plugin[] = [];
    let gatewayCount = 0;
    let schedulerCount = 0;
    let supportWarmCount = 0;
    const plugin = { name: "deferred-plugin" } as Plugin;

    const hydrate = createDeferredHydrator({
      services: services as never,
      loadDeferredPlugins: async () => [plugin],
      registerPlugin: async (nextPlugin) => {
        registered.push(nextPlugin);
      },
      ensureGateway: () => {
        gatewayCount += 1;
        services.startupState.markReady("gateway", "gateway ready");
      },
      startScheduler: async () => {
        schedulerCount += 1;
      },
      warmSupportServices: () => {
        supportWarmCount += 1;
      },
    });

    await hydrate("api");
    await hydrate("cli");

    expect(registered).toEqual([plugin]);
    expect(gatewayCount).toBe(1);
    expect(schedulerCount).toBe(1);
    expect(supportWarmCount).toBe(1);
    expect(services.startupState.getSnapshot().phases.runtime.status).toBe(
      "ready",
    );
    expect(services.startupState.getSnapshot().phases.cron.status).toBe(
      "ready",
    );
  });

  it("marks cron as errored when scheduler startup fails", async () => {
    const services = createServices();
    const hydrate = createDeferredHydrator({
      services: services as never,
      loadDeferredPlugins: async () => [],
      registerPlugin: async () => {},
      ensureGateway: () => {
        services.startupState.markReady("gateway", "gateway ready");
      },
      startScheduler: async () => {
        throw new Error("scheduler failed");
      },
      warmSupportServices: () => {},
    });

    await expect(hydrate("worker")).rejects.toThrow("scheduler failed");
    expect(services.startupState.getSnapshot().phases.cron.status).toBe(
      "error",
    );
  });
});
