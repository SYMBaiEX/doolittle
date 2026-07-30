import type { IAgentRuntime, Route } from "@elizaos/core";
import { describe, expect, it } from "vitest";
import { dispatchRuntimePluginRoute } from "./plugin-routes";

function runtimeWith(routes: Route[]): IAgentRuntime {
  return { routes } as unknown as IAgentRuntime;
}

describe("dispatchRuntimePluginRoute", () => {
  it("uses Eliza route matching and passes structured request context", async () => {
    const runtime = runtimeWith([
      {
        type: "POST",
        path: "/plugin/items/:itemId",
        routeHandler: async (context) => ({
          status: 201,
          body: {
            body: context.body,
            itemId: context.params.itemId,
            query: context.query,
            inProcess: context.inProcess,
          },
        }),
      },
    ]);
    const request = new Request(
      "http://localhost/plugin/items/item%201?tag=a&tag=b",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ value: 7 }),
      },
    );
    const response = await dispatchRuntimePluginRoute({
      runtime,
      request,
      url: new URL(request.url),
      isAuthorized: () => true,
    });

    expect(response?.status).toBe(201);
    await expect(response?.json()).resolves.toEqual({
      body: { value: 7 },
      itemId: "item 1",
      query: { tag: ["a", "b"] },
      inProcess: false,
    });
  });

  it("preserves Eliza private-route authorization", async () => {
    const runtime = runtimeWith([
      {
        type: "GET",
        path: "/private",
        routeHandler: async () => ({ status: 200, body: { ok: true } }),
      },
    ]);
    const request = new Request("http://localhost/private");
    const response = await dispatchRuntimePluginRoute({
      runtime,
      request,
      url: new URL(request.url),
      isAuthorized: () => false,
    });

    expect(response?.status).toBe(401);
    await expect(response?.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("returns null when the runtime has no matching plugin route", async () => {
    const request = new Request("http://localhost/missing", {
      method: "POST",
      body: JSON.stringify({ preserved: true }),
      headers: { "content-type": "application/json" },
    });
    await expect(
      dispatchRuntimePluginRoute({
        runtime: runtimeWith([]),
        request,
        url: new URL(request.url),
        isAuthorized: () => true,
      }),
    ).resolves.toBeNull();
    await expect(request.json()).resolves.toEqual({ preserved: true });
  });
});
