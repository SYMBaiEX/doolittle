import { describe, expect, it } from "vitest";
import type { AppContext } from "@/runtime/bootstrap";
import { handleAcpRoutes } from "./acp";

function createContext(): AppContext {
  return {
    services: {
      acp: {
        initializeProtocol: async () => ({ protocolVersion: 1 }),
        newProtocolSession: async () => ({ sessionId: "acp:1" }),
        loadProtocolSession: async () => undefined,
        promptProtocolSession: async () => ({ stopReason: "end_turn" }),
        cancelProtocolSession: async () => undefined,
        protocolUpdates: (sessionId: string, cursor = 0) => ({
          sessionId,
          cursor,
          updates: [],
        }),
        updateEditorContext: (
          sessionId: string,
          context: Record<string, unknown>,
        ) => ({ sessionId, ...context }),
        readTextFile: async () => "content",
        writeTextFile: async () => ({ written: true }),
        createTerminal: async () => ({ terminalId: "terminal-1" }),
        terminalOutput: async () => ({ output: "hello", truncated: false }),
        waitForTerminalExit: async () => ({ exitCode: 0 }),
        killTerminal: async () => undefined,
        releaseTerminal: async () => undefined,
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

  it("serves the official ACP lifecycle and editor context bridge", async () => {
    const context = createContext();
    const initialize = await handleAcpRoutes(
      context,
      jsonRequest("/acp/initialize", {}),
      new URL("http://localhost/acp/initialize"),
    );
    const created = await handleAcpRoutes(
      context,
      jsonRequest("/acp/session/new", {}),
      new URL("http://localhost/acp/session/new"),
    );
    const editor = await handleAcpRoutes(
      context,
      jsonRequest("/acp/editor/context", {
        sessionId: "acp:1",
        path: "src/index.ts",
        focused: true,
        cursor: { lineNumber: 2, column: 4 },
      }),
      new URL("http://localhost/acp/editor/context"),
    );
    const updates = await handleAcpRoutes(
      context,
      new Request(
        "http://localhost/acp/session/updates?sessionId=acp%3A1&cursor=2",
      ),
      new URL(
        "http://localhost/acp/session/updates?sessionId=acp%3A1&cursor=2",
      ),
    );

    await expect(initialize?.json()).resolves.toEqual({
      initialized: { protocolVersion: 1 },
    });
    await expect(created?.json()).resolves.toEqual({
      session: { sessionId: "acp:1" },
    });
    await expect(editor?.json()).resolves.toMatchObject({
      context: {
        sessionId: "acp:1",
        path: "src/index.ts",
        focused: true,
      },
    });
    await expect(updates?.json()).resolves.toEqual({
      snapshot: { sessionId: "acp:1", cursor: 2, updates: [] },
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

function jsonRequest(path: string, body: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}
