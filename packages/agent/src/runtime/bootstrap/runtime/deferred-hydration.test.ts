import type { Plugin } from "@elizaos/core";
import { describe, expect, it, vi } from "vitest";
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

  it("retries a transient scheduler failure without re-registering plugins", async () => {
    const services = createServices();
    const plugin = { name: "deferred-plugin" } as Plugin;
    const registerPlugin = vi.fn(async () => {});
    const startScheduler = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("scheduler failed once"))
      .mockResolvedValue(undefined);
    const hydrate = createDeferredHydrator({
      services: services as never,
      loadDeferredPlugins: async () => [plugin],
      registerPlugin,
      ensureGateway: () => {
        services.startupState.markReady("gateway", "gateway ready");
      },
      startScheduler,
      warmSupportServices: () => {},
    });

    await expect(hydrate("api")).rejects.toThrow("scheduler failed once");
    await expect(hydrate("api-retry")).resolves.toBeUndefined();

    expect(registerPlugin).toHaveBeenCalledTimes(1);
    expect(startScheduler).toHaveBeenCalledTimes(2);
    expect(services.startupState.getSnapshot().phases.cron.status).toBe(
      "ready",
    );
  });

  it("retries only failed optional plugins and retains degraded detail", async () => {
    const services = createServices();
    const healthy = { name: "healthy-plugin" } as Plugin;
    const transient = { name: "transient-plugin" } as Plugin;
    const attempts = new Map<string, number>();
    const registerPlugin = vi.fn(async (plugin: Plugin) => {
      const label = plugin.name ?? "unknown";
      const attempt = (attempts.get(label) ?? 0) + 1;
      attempts.set(label, attempt);
      if (label === "transient-plugin" && attempt === 1) {
        throw new Error("temporary registry failure");
      }
    });
    const hydrate = createDeferredHydrator({
      services: services as never,
      loadDeferredPlugins: async () => [healthy, transient],
      registerPlugin,
      ensureGateway: () => {
        services.startupState.markReady("gateway", "gateway ready");
      },
      startScheduler: async () => {},
      warmSupportServices: () => {},
    });

    await hydrate("api");
    expect(services.startupState.getSnapshot().phases.runtime.detail).toContain(
      "transient-plugin: temporary registry failure (attempt 1/3)",
    );
    await hydrate("api-retry");

    expect(attempts.get("healthy-plugin")).toBe(1);
    expect(attempts.get("transient-plugin")).toBe(2);
    expect(services.startupState.getSnapshot().phases.runtime.detail).toBe(
      "runtime ready",
    );
  });

  it("bounds persistent optional-plugin retries and records the final failure", async () => {
    const services = createServices();
    const plugin = { name: "broken-plugin" } as Plugin;
    const registerPlugin = vi.fn(async () => {
      throw new Error("still unavailable");
    });
    const hydrate = createDeferredHydrator({
      services: services as never,
      loadDeferredPlugins: async () => [plugin],
      registerPlugin,
      ensureGateway: () => {
        services.startupState.markReady("gateway", "gateway ready");
      },
      startScheduler: async () => {},
      warmSupportServices: () => {},
    });

    await hydrate("attempt-1");
    await hydrate("attempt-2");
    await hydrate("attempt-3");
    await hydrate("ignored-attempt-4");

    expect(registerPlugin).toHaveBeenCalledTimes(3);
    expect(services.startupState.getSnapshot().phases.runtime.detail).toContain(
      "broken-plugin: still unavailable (attempt 3/3)",
    );
  });
});
