import { describe, expect, it } from "bun:test";
import type { AppContext } from "@/runtime/bootstrap";
import { handleAcpRoutes } from "./acp";

function createContext(): AppContext {
  return {
    services: {
      acp: {
        status: () => ({ ready: true }),
        registry: () => ({ packages: 2 }),
        packageMetadata: () => ({ name: "doolittle-acp" }),
        editorSummary: () => ({ connected: true }),
        sessionSummary: (limit: number) => [{ id: `session:${limit}` }],
        publishRegistry: () => ({ published: true }),
        exportBundle: (label: string) => ({ label, kind: "bundle" }),
        importBundle: (input: string) => ({ input, imported: true }),
        probe: async () => ({ ok: true }),
        searchTools: (query: string) => [{ name: `search:${query}` }],
        tools: () => [{ name: "tool-1" }],
        describeTool: (name: string) => ({ name, detail: true }),
        invoke: async (input: string) => ({ input, mode: "invoke" }),
        invokeTool: async (tool: string, input: Record<string, unknown>) => ({
          tool,
          input,
          mode: "tool",
        }),
      },
    },
  } as unknown as AppContext;
}

describe("handleAcpRoutes", () => {
  it("returns ACP summary endpoints", async () => {
    const context = createContext();
    const status = await handleAcpRoutes(
      context,
      new Request("http://localhost/acp/status"),
      new URL("http://localhost/acp/status"),
    );
    const sessions = await handleAcpRoutes(
      context,
      new Request("http://localhost/acp/sessions?limit=3"),
      new URL("http://localhost/acp/sessions?limit=3"),
    );
    const tools = await handleAcpRoutes(
      context,
      new Request("http://localhost/acp/tools?query=browser"),
      new URL("http://localhost/acp/tools?query=browser"),
    );

    await expect(status?.json()).resolves.toEqual({
      acp: { ready: true },
    });
    await expect(sessions?.json()).resolves.toEqual({
      sessions: [{ id: "session:3" }],
    });
    await expect(tools?.json()).resolves.toEqual({
      tools: [{ name: "search:browser" }],
    });
  });

  it("validates required ACP inputs", async () => {
    const missingImport = await handleAcpRoutes(
      createContext(),
      new Request("http://localhost/acp/import", {
        method: "POST",
        body: JSON.stringify({}),
        headers: { "content-type": "application/json" },
      }),
      new URL("http://localhost/acp/import"),
    );
    const missingTool = await handleAcpRoutes(
      createContext(),
      new Request("http://localhost/acp/tool"),
      new URL("http://localhost/acp/tool"),
    );

    expect(missingImport?.status).toBe(400);
    await expect(missingImport?.json()).resolves.toEqual({
      error: "path or payload is required",
    });
    expect(missingTool?.status).toBe(400);
    await expect(missingTool?.json()).resolves.toEqual({
      error: "name is required",
    });
  });

  it("invokes ACP mutations and tool calls", async () => {
    const context = createContext();
    const publish = await handleAcpRoutes(
      context,
      new Request("http://localhost/acp/publish", { method: "POST" }),
      new URL("http://localhost/acp/publish"),
    );
    const invoke = await handleAcpRoutes(
      context,
      new Request("http://localhost/acp/invoke", {
        method: "POST",
        body: JSON.stringify({ input: "hello" }),
        headers: { "content-type": "application/json" },
      }),
      new URL("http://localhost/acp/invoke"),
    );
    const call = await handleAcpRoutes(
      context,
      new Request("http://localhost/acp/call", {
        method: "POST",
        body: JSON.stringify({ tool: "tool-1", input: { url: "x" } }),
        headers: { "content-type": "application/json" },
      }),
      new URL("http://localhost/acp/call"),
    );

    await expect(publish?.json()).resolves.toEqual({
      published: { published: true },
    });
    await expect(invoke?.json()).resolves.toEqual({
      result: { input: "hello", mode: "invoke" },
    });
    await expect(call?.json()).resolves.toEqual({
      result: { tool: "tool-1", input: { url: "x" }, mode: "tool" },
    });
  });

  it("returns null for unrelated routes", async () => {
    const response = await handleAcpRoutes(
      createContext(),
      new Request("http://localhost/not-acp"),
      new URL("http://localhost/not-acp"),
    );

    expect(response).toBeNull();
  });
});
