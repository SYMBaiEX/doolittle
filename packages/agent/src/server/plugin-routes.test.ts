import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { IAgentRuntime, Route } from "@elizaos/core";
import { afterEach, describe, expect, it, vi } from "vitest";

const { requestWorkerHost } = vi.hoisted(() => ({
  requestWorkerHost: vi.fn(),
}));
vi.mock("@/runtime/bootstrap/worker-host-rpc", () => ({ requestWorkerHost }));

import { resolveWorkspaceDirectory } from "@/services/workspace-directory";
import { dispatchRuntimePluginRoute } from "./plugin-routes";

function runtimeWith(routes: Route[]): IAgentRuntime {
  return { routes } as unknown as IAgentRuntime;
}
const priorDesktop = process.env.DOOLITTLE_DESKTOP_RUNTIME;
const directories: string[] = [];
afterEach(() => {
  if (priorDesktop === undefined) delete process.env.DOOLITTLE_DESKTOP_RUNTIME;
  else process.env.DOOLITTLE_DESKTOP_RUNTIME = priorDesktop;
  for (const root of directories.splice(0))
    rmSync(root, { recursive: true, force: true });
  vi.resetAllMocks();
});

describe("dispatchRuntimePluginRoute", () => {
  it("scopes actual plugin matches, rejects unknown origins, and preserves API fallthrough", async () => {
    process.env.DOOLITTLE_DESKTOP_RUNTIME = "1";
    const roots = ["first", "second"].map((label) =>
      realpathSync(mkdtempSync(join(tmpdir(), `doolittle-plugin-${label}-`))),
    );
    directories.push(...roots);
    requestWorkerHost.mockImplementation(async (_operation, payload) => {
      const index = ["first", "second"].indexOf(payload.sessionId);
      if (index < 0) throw new Error("Unknown origin");
      return {
        sessionId: payload.sessionId,
        botId: "bot",
        workspacePath: roots[index],
      };
    });
    const handler = vi.fn(async () => ({
      status: 200,
      body: { root: resolveWorkspaceDirectory("/bootstrap") },
    }));
    const runtime = runtimeWith([
      { type: "POST", path: "/plugin/work", routeHandler: handler },
    ]);
    const invoke = (path: string, origin?: string) => {
      const request = new Request(`http://localhost${path}`, {
        method: "POST",
        headers: origin ? { "x-doolittle-origin-conversation": origin } : {},
      });
      return dispatchRuntimePluginRoute({
        runtime,
        request,
        url: new URL(request.url),
        isAuthorized: () => true,
      });
    };
    expect((await invoke("/plugin/work"))?.status).toBe(409);
    expect((await invoke("/plugin/work", "forged"))?.status).toBe(409);
    expect(handler).not.toHaveBeenCalled();
    for (const [index, origin] of ["first", "second"].entries())
      expect(await (await invoke("/plugin/work", origin))?.json()).toEqual({
        root: roots[index],
      });
    expect(await invoke("/runtime/models")).toBeNull();
  });
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
    expect(response?.headers.get("access-control-allow-origin")).toBeNull();
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
