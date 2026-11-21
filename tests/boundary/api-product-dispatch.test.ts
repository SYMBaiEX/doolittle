import { randomUUID } from "node:crypto";
import { registerHttpPluginRoutes } from "@elizaos/host/protocol";
import { afterEach, expect, it, vi } from "vitest";
import type { AppContext } from "../../packages/agent/src/runtime/bootstrap/index";
import { createApiServer } from "../../packages/agent/src/server";
import { dispatchRouteHandlers } from "../../packages/agent/src/server/router";
import { apiRouteHandlers } from "../../packages/agent/src/server/routes/index";
import { createDoolittleRuntimeRoutes } from "../../packages/plugins/doolittle-plugin/routes";

afterEach(() => {
  vi.unstubAllEnvs();
});

it("keeps startup probes, product routes, plugin priority, and webhook authority separate", async () => {
  vi.stubEnv("DOOLITTLE_DESKTOP_RUNTIME", "1");
  vi.stubEnv("DOOLITTLE_KNOWLEDGE_BROKER", "");
  vi.stubEnv("DOOLITTLE_BOT_RUNTIME", "lead");
  vi.stubEnv("ELIZA_REQUIRE_LOCAL_AUTH", "1");
  vi.stubEnv("ELIZA_API_TOKEN", "fixture-api-token");
  vi.stubEnv("ELIZA_API_BIND", "127.0.0.1");
  const context = {
    config: {
      host: "127.0.0.1",
      port: 0,
      agentName: "Fixture",
      mode: "api",
      whatsappVerifyToken: "fixture-whatsapp-token",
    },
    services: {
      sessions: { listProjects: () => [] },
      logger: { error: vi.fn() },
    },
    runtime: { agentId: randomUUID() },
  } as unknown as AppContext;
  const interceptWebhook = vi.fn(async () => ({
    status: 418,
    body: "Unexpected plugin dispatch",
  }));
  registerHttpPluginRoutes(context.runtime, {
    name: "fixture-routes",
    description: "Fixture plugin route precedence",
    routes: [
      ...createDoolittleRuntimeRoutes(context),
      {
        type: "GET",
        path: "/memory/summary",
        rawPath: true,
        routeHandler: async () => ({ status: 200, body: "SDK route" }),
      },
      {
        type: "GET",
        path: "/webhooks/whatsapp",
        rawPath: true,
        routeHandler: interceptWebhook,
      },
    ],
  });
  const listener = await createApiServer(context);
  const granted = { authorization: "Bearer fixture-api-token" };
  const request = (path: string, options?: RequestInit) =>
    fetch(`${listener.address.url}${path}`, options);
  try {
    const health = await request("/health", { headers: granted });
    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({
      status: "ok",
      processId: process.pid,
    });
    const identity = await request("/runtime/bot-identity", {
      headers: granted,
    });
    expect(identity.status).toBe(200);
    expect(await identity.json()).toMatchObject({
      agentId: context.runtime.agentId,
      botId: context.runtime.agentId,
      isDefault: true,
      name: context.config.agentName,
      runtimeInstanceId: expect.any(String),
    });

    expect((await request("/projects")).status).toBe(401);
    expect(
      await (await request("/projects", { headers: granted })).json(),
    ).toEqual({ projects: [] });
    expect((await request("/activity", { headers: granted })).status).toBe(409);
    expect(
      await (await request("/not-a-route", { headers: granted })).json(),
    ).toEqual({ error: "Not found" });
    const plugin = await request("/memory/summary", {
      headers: {
        ...granted,
        // A lazy product fallback must not intercept a matching SDK route.
        "x-doolittle-origin-conversation": "",
      },
    });
    expect(plugin.status).toBe(409);

    const verifiedWebhook = await request(
      "/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=fixture-whatsapp-token&hub.challenge=verified",
    );
    expect(verifiedWebhook.status).toBe(200);
    expect(await verifiedWebhook.text()).toBe("verified");
    expect(interceptWebhook).not.toHaveBeenCalled();
    expect(
      (await request("/webhooks/whatsapp?hub.mode=subscribe")).status,
    ).toBe(403);
  } finally {
    await listener.close();
  }
});

it("does not execute a product handler if the request is cancelled while its route loads", async () => {
  const listBenchmarks = vi.fn();
  const context = {
    services: {
      trajectoryEvaluation: { listBenchmarkManifests: listBenchmarks },
    },
  } as unknown as AppContext;
  const controller = new AbortController();
  const url = new URL("http://localhost/trajectories/benchmarks");
  const request = new Request(url, { signal: controller.signal });
  const response = dispatchRouteHandlers(
    context,
    request,
    url,
    apiRouteHandlers,
  );
  const aborted = new Error("Fixture disconnected");
  controller.abort(aborted);
  await expect(response).rejects.toBe(aborted);
  expect(listBenchmarks).not.toHaveBeenCalled();
});
