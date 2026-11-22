import { afterEach, expect, it, vi } from "vitest";
import type { AppContext } from "../../packages/agent/src/runtime/bootstrap/index";

afterEach(() => {
  vi.unstubAllEnvs();
});

it("answers desktop readiness probes before loading product and terminal handlers", async () => {
  vi.stubEnv("ELIZA_REQUIRE_LOCAL_AUTH", "1");
  vi.stubEnv("ELIZA_API_TOKEN", "fixture-api-token");
  const loadProductRoutes = vi.fn();
  const loadTerminalRoutes = vi.fn();
  vi.doMock("../../packages/agent/src/server/routes/index", () => {
    loadProductRoutes();
    return { apiRouteHandlers: [() => Response.json({ projects: [] })] };
  });
  vi.doMock("../../packages/agent/src/server/routes/operations", () => {
    loadTerminalRoutes();
    return { handleOperationsRoutes: () => null };
  });
  vi.doMock("../../packages/agent/src/server/plugin-routes", () => ({
    dispatchRuntimePluginRoute: ({ url }: { url: URL }) =>
      url.pathname === "/health" ? Response.json({ status: "ok" }) : null,
  }));

  const { createApiServer } = await import("../../packages/agent/src/server");
  const context = {
    config: { host: "127.0.0.1", port: 0, agentName: "Fixture" },
    runtime: { agentId: "fixture-agent" },
    services: { logger: { error: vi.fn() } },
  } as unknown as AppContext;
  const listener = await createApiServer(context);
  const request = (path: string, token = "fixture-api-token") =>
    fetch(`${listener.address.url}${path}`, {
      headers: { authorization: `Bearer ${token}` },
    });
  try {
    expect((await request("/health", "invalid")).status).toBe(401);
    expect(await (await request("/health")).json()).toEqual({ status: "ok" });
    expect(await (await request("/runtime/bot-identity")).json()).toMatchObject(
      { agentId: "fixture-agent" },
    );
    expect(loadProductRoutes).not.toHaveBeenCalled();
    expect(loadTerminalRoutes).not.toHaveBeenCalled();

    expect(await (await request("/projects")).json()).toEqual({ projects: [] });
    expect(loadProductRoutes).toHaveBeenCalledOnce();
    expect(loadTerminalRoutes).not.toHaveBeenCalled();
  } finally {
    await listener.close();
  }
});
