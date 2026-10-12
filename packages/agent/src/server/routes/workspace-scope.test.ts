import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const { requestWorkerHost, readWorkerBotProfile } = vi.hoisted(() => ({
  requestWorkerHost: vi.fn(),
  readWorkerBotProfile: vi.fn(() => ({ id: "bot" })),
}));
vi.mock("@/runtime/bootstrap/worker-host-rpc", () => ({ requestWorkerHost }));
vi.mock("@/runtime/bootstrap/bot-profile", () => ({ readWorkerBotProfile }));

import { resolveWorkspaceDirectory } from "@/services/workspace-directory";
import { apiRouteHandlers } from "./index";
import { withDirectConversationWorkspace } from "./workspace-scope";

const priorDesktop = process.env.DOOLITTLE_DESKTOP_RUNTIME;
const priorControl = process.env.DOOLITTLE_DESKTOP_CONTROL_TOKEN;
const roots: string[] = [];
afterEach(() => {
  if (priorDesktop === undefined) delete process.env.DOOLITTLE_DESKTOP_RUNTIME;
  else process.env.DOOLITTLE_DESKTOP_RUNTIME = priorDesktop;
  if (priorControl === undefined)
    delete process.env.DOOLITTLE_DESKTOP_CONTROL_TOKEN;
  else process.env.DOOLITTLE_DESKTOP_CONTROL_TOKEN = priorControl;
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
  vi.resetAllMocks();
});

describe("direct conversation workspace routes", () => {
  it("scopes Setup summary to private operator inventory without granting a chat", async () => {
    process.env.DOOLITTLE_DESKTOP_RUNTIME = "1";
    process.env.DOOLITTLE_DESKTOP_CONTROL_TOKEN = "private-host-token";
    readWorkerBotProfile.mockReturnValue(null as never);
    const root = realpathSync(
      mkdtempSync(join(tmpdir(), "doolittle-setup-inventory-")),
    );
    roots.push(root);
    const summary = vi.fn(async () => ({
      workspacePath: resolveWorkspaceDirectory("/unapproved"),
    }));
    const context = {
      config: { workspaceDir: root },
      runtime: { agentId: "lead" },
      services: { operator: { setupSummary: summary } },
    } as never;
    const url = new URL("http://localhost/setup/summary");
    const invoke = async (token?: string) => {
      const request = new Request(url, {
        headers: token ? { "x-doolittle-desktop-control-token": token } : {},
      });
      for (const handler of apiRouteHandlers) {
        const response = await handler(context, request, url);
        if (response) return response;
      }
      throw new Error("Setup route was not registered.");
    };
    expect((await invoke()).status).toBe(409);
    expect(summary).not.toHaveBeenCalled();
    const response = await invoke("private-host-token");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      summary: { workspacePath: root },
    });
    expect(requestWorkerHost).not.toHaveBeenCalled();
  });
  it("allows only private lead inventory reads, not effects or named worker access", async () => {
    process.env.DOOLITTLE_DESKTOP_RUNTIME = "1";
    process.env.DOOLITTLE_DESKTOP_CONTROL_TOKEN = "private-host-token";
    readWorkerBotProfile.mockReturnValue(null as never);
    const root = realpathSync(
      mkdtempSync(join(tmpdir(), "doolittle-inventory-")),
    );
    roots.push(root);
    const handler = withDirectConversationWorkspace(
      async () => new Response(resolveWorkspaceDirectory("/unapproved")),
      () => true,
    );
    const context = {
      config: { workspaceDir: root },
      runtime: { agentId: "lead" },
    } as never;
    const url = new URL("http://localhost/workspace/read");
    const invoke = (token: string, method = "GET") =>
      handler(
        context,
        new Request(url, {
          method,
          headers: { "x-doolittle-desktop-control-token": token },
        }),
        url,
      );
    expect((await invoke("wrong"))?.status).toBe(409);
    expect((await invoke("é".repeat(18)))?.status).toBe(409);
    expect(await (await invoke("private-host-token"))?.text()).toBe(root);
    expect((await invoke("private-host-token", "POST"))?.status).toBe(409);
    readWorkerBotProfile.mockReturnValue({ id: "bot" });
    expect((await invoke("private-host-token"))?.status).toBe(409);
    expect(requestWorkerHost).not.toHaveBeenCalled();
  });
  it("rejects missing-origin effects even for the default desktop worker", async () => {
    process.env.DOOLITTLE_DESKTOP_RUNTIME = "1";
    const url = new URL("http://localhost/repo/mutate");
    const handler = withDirectConversationWorkspace(
      async () => new Response("mutated"),
      () => true,
    );
    const result = await handler(
      {} as never,
      new Request(url, { method: "POST" }),
      url,
    );
    expect(result?.status).toBe(409);
    expect(requestWorkerHost).not.toHaveBeenCalled();
  });
  it("requires a trusted origin and resolves the root per request", async () => {
    process.env.DOOLITTLE_DESKTOP_RUNTIME = "1";
    const first = realpathSync(
      mkdtempSync(join(tmpdir(), "doolittle-direct-a-")),
    );
    const second = realpathSync(
      mkdtempSync(join(tmpdir(), "doolittle-direct-b-")),
    );
    roots.push(first, second);
    requestWorkerHost.mockImplementation(async (_operation, payload) => ({
      sessionId: payload.sessionId,
      botId: "bot",
      workspacePath: payload.sessionId === "first" ? first : second,
    }));
    const handler = withDirectConversationWorkspace(
      async () => new Response(resolveWorkspaceDirectory("/fallback")),
      (url) => url.pathname === "/workspace/read",
    );
    const url = new URL("http://localhost/workspace/read");
    const invoke = (origin?: string) =>
      handler(
        {} as never,
        new Request(url, {
          headers: origin ? { "x-doolittle-origin-conversation": origin } : {},
        }),
        url,
      );
    expect((await invoke())?.status).toBe(409);
    expect(await (await invoke("first"))?.text()).toBe(first);
    expect(await (await invoke("second"))?.text()).toBe(second);
    expect(requestWorkerHost).toHaveBeenCalledTimes(2);
  });
});
