import { DOOLITTLE_MCP_SERVICE } from "@doolittle/contracts";
import type { IAgentRuntime, Service, ServiceClass } from "@elizaos/core";
import { describe, expect, it, vi } from "vitest";
import type { AppServices } from "@/services";
import { createMcpRuntimeService } from "./mcp-service";

describe("createMcpRuntimeService", () => {
  it("exposes discovery, cache, and invocation through one Eliza service", async () => {
    const mcp = {
      status: vi.fn(() => ({ ready: true })),
      probe: vi.fn(async () => ({ ok: true })),
      discoverTools: vi.fn(async () => ({ ok: true, tools: ["search"] })),
      invoke: vi.fn(async (input: string) => ({ ok: true, input })),
      invokeTool: vi.fn(
        async (name: string, input: Record<string, unknown>) => ({
          ok: true,
          name,
          input,
        }),
      ),
      getCachedTools: vi.fn(() => [{ name: "search" }]),
      searchCachedTools: vi.fn((query: string) => [{ name: query }]),
      describeCachedTools: vi.fn((limit: number) => `${limit} tools`),
      describeTool: vi.fn((name: string) => `tool:${name}`),
    };
    const Service = createMcpRuntimeService({
      mcp,
    } as unknown as AppServices) as ServiceClass;
    const service = (await Service.start({} as IAgentRuntime)) as Service & {
      status(): unknown;
      probe(): Promise<unknown>;
      discoverTools(): Promise<unknown>;
      invoke(input: string): Promise<unknown>;
      invokeTool(
        name: string,
        input: Record<string, unknown>,
      ): Promise<unknown>;
      getCachedTools(): unknown[];
      searchCachedTools(query: string): unknown[];
      describeCachedTools(limit?: number): string;
      describeTool(name: string): string;
    };

    expect(Service.serviceType).toBe(DOOLITTLE_MCP_SERVICE);
    expect(service.status()).toEqual({ ready: true });
    await expect(service.probe()).resolves.toEqual({ ok: true });
    await expect(service.discoverTools()).resolves.toEqual({
      ok: true,
      tools: ["search"],
    });
    await expect(service.invoke("ping")).resolves.toEqual({
      ok: true,
      input: "ping",
    });
    await expect(
      service.invokeTool("search", { query: "Eliza" }),
    ).resolves.toMatchObject({ ok: true, name: "search" });
    expect(service.getCachedTools()).toEqual([{ name: "search" }]);
    expect(service.searchCachedTools("search")).toEqual([{ name: "search" }]);
    expect(service.describeCachedTools(4)).toBe("4 tools");
    expect(service.describeTool("search")).toBe("tool:search");
  });
});
