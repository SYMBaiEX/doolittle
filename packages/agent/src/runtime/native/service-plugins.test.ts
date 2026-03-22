import { describe, expect, it } from "bun:test";
import type { AppServices } from "@/services";
import {
  createNativeCronServicePlugin,
  createNativeMcpServicePlugin,
  createNativePersonalityServicePlugin,
  createNativeShellServicePlugin,
  createNativeTrajectoryLoggerServicePlugin,
} from "./service-plugins";

function createMockServices(): AppServices {
  return {
    terminal: {
      run: async (command: string) => ({ command }),
      getHistory: (limit = 20) => [{ limit }],
      status: async () => ({ backend: "local" }),
    },
    mcp: {
      status: () => ({ ok: true }),
      probe: async () => ({ ok: true }),
      discoverTools: async () => [{ name: "tool" }],
      invoke: async (input: string) => ({ input }),
      invokeTool: async (name: string, input: Record<string, unknown>) => ({
        name,
        input,
      }),
      getCachedTools: () => [{ name: "cached" }],
      searchCachedTools: (query: string) => [{ query }],
      describeCachedTools: (limit = 20) => `limit=${limit}`,
      describeTool: (name: string) => `tool=${name}`,
    },
    cron: {
      list: () => [{ id: "cron-1" }],
      get: (id: string) => ({ id }),
      create: (input: unknown) => input,
      update: (_id: string, patch: unknown) => patch,
      runs: (limit = 20) => [{ limit }],
    },
    personalities: {
      list: () => [{ id: "default" }],
      get: (id: string) => ({ id }),
      setActive: (id: string) => ({ id, active: true }),
      activeId: () => "default",
      summary: () => ({ total: 1, activeId: "default", names: ["Default"] }),
    },
    trajectories: {
      exportLatest: () => ({ label: "latest" }),
      listBundles: () => [{ label: "bundle" }],
      compareLatest: () => ({ compared: true }),
    },
  } as unknown as AppServices;
}

describe("native service plugins", () => {
  it("exposes direct native service plugins for thin wrapper domains", async () => {
    const services = createMockServices();
    const plugins = [
      createNativeShellServicePlugin(services),
      createNativeMcpServicePlugin(services),
      createNativeCronServicePlugin(services),
      createNativePersonalityServicePlugin(services),
      createNativeTrajectoryLoggerServicePlugin(services),
    ];

    expect(plugins.map((entry) => entry.name)).toEqual([
      "shell",
      "mcp",
      "cron",
      "personality",
      "trajectory-logger",
    ]);

    const shellService = (await plugins[0].services?.[0]?.start?.(
      undefined as never,
    )) as unknown as { run: (command: string) => Promise<unknown> };
    expect(await shellService.run("echo hi")).toEqual({ command: "echo hi" });

    const mcpService = (await plugins[1].services?.[0]?.start?.(
      undefined as never,
    )) as unknown as {
      invokeTool: (
        name: string,
        input: Record<string, unknown>,
      ) => Promise<unknown>;
    };
    expect(await mcpService.invokeTool("cached", { ok: true })).toEqual({
      name: "cached",
      input: { ok: true },
    });

    const cronService = (await plugins[2].services?.[0]?.start?.(
      undefined as never,
    )) as unknown as { list: () => unknown[] };
    expect(cronService.list()).toEqual([{ id: "cron-1" }]);
  });
});
