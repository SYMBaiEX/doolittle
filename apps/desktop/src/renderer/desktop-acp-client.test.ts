import { describe, expect, it, vi } from "vitest";
import {
  buildDesktopAcpEditorContext,
  buildDesktopAcpPromptBlocks,
  DesktopAcpClient,
  describeDesktopAcpUpdate,
  desktopAcpResponseText,
  mergeDesktopAcpUpdates,
} from "./desktop-acp-client";

interface MockAgentRequest {
  path: string;
  method?: string;
  body?: unknown;
}

async function withAgentApi(
  api: (request: MockAgentRequest) => Promise<unknown>,
  run: () => Promise<void>,
): Promise<void> {
  const originalWindow = (globalThis as { window?: unknown }).window;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      doolittle: {
        requestAgent: async (request: {
          path: string;
          method: string;
          body?: string | null;
        }) => {
          const payload = await api({
            path: request.path,
            method: request.method,
            ...(typeof request.body === "string"
              ? { body: JSON.parse(request.body) }
              : {}),
          });
          return {
            status: 200,
            statusText: "OK",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload ?? null),
          };
        },
      },
    },
  });
  try {
    await run();
  } finally {
    if (originalWindow === undefined) {
      Reflect.deleteProperty(globalThis, "window");
    } else {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: originalWindow,
      });
    }
  }
}

describe("buildDesktopAcpEditorContext", () => {
  it("maps Monaco state to bounded ACP editor metadata and resources", () => {
    const context = buildDesktopAcpEditorContext(
      {
        path: "src/index.ts",
        uri: "file:///workspace/src/index.ts",
        language: "typescript",
        content: "const answer = 42;",
        version: 7,
        focused: true,
        cursor: { line: 3, column: 8 },
        selection: {
          startLine: 3,
          startColumn: 2,
          endLine: 3,
          endColumn: 8,
          text: "answer",
        },
        visibleRanges: [
          { startLine: 1, startColumn: 1, endLine: 40, endColumn: 1 },
        ],
      },
      true,
    );

    expect(context).toMatchObject({
      activeFile: "src/index.ts",
      uri: "file:///workspace/src/index.ts",
      dirty: true,
      cursor: { lineNumber: 3, column: 8 },
      selection: {
        startLineNumber: 3,
        startColumn: 2,
        endLineNumber: 3,
        endColumn: 8,
        text: "answer",
      },
      visibleRanges: [
        {
          startLineNumber: 1,
          startColumn: 1,
          endLineNumber: 40,
          endColumn: 1,
        },
      ],
      resources: [
        {
          uri: "file:///workspace/src/index.ts",
          name: "index.ts",
          text: "const answer = 42;",
        },
      ],
    });
  });

  it("bounds unsaved content before it crosses the desktop bridge", () => {
    const context = buildDesktopAcpEditorContext(
      {
        path: "large.txt",
        uri: "file:///workspace/large.txt",
        language: "plaintext",
        content: "x".repeat(40_000),
        version: 1,
        focused: false,
        visibleRanges: [],
      },
      false,
    );

    expect(context.content).toHaveLength(32_000);
    expect(context.resources[0]?.text).toHaveLength(32_000);
  });
});

describe("ACP update presentation", () => {
  it("adapts editor resources to negotiated embedded-context capability", () => {
    const context = buildDesktopAcpEditorContext(
      {
        path: "src/index.ts",
        uri: "file:///workspace/src/index.ts",
        language: "typescript",
        content: "export const answer = 42;",
        version: 1,
        focused: true,
        visibleRanges: [],
      },
      true,
    );

    expect(
      buildDesktopAcpPromptBlocks(" Inspect this ", context, {
        embeddedContext: true,
      }),
    ).toEqual([
      { type: "text", text: "Inspect this" },
      {
        type: "resource",
        resource: {
          uri: "file:///workspace/src/index.ts",
          text: "export const answer = 42;",
          mimeType: "text/plain",
        },
      },
    ]);
    expect(
      buildDesktopAcpPromptBlocks("Inspect this", context, {
        embeddedContext: false,
      }),
    ).toEqual([
      { type: "text", text: "Inspect this" },
      {
        type: "resource_link",
        uri: "file:///workspace/src/index.ts",
        name: "src/index.ts",
        mimeType: "text/plain",
      },
    ]);
  });

  it("deduplicates, sorts, and bounds structured session updates", () => {
    const merged = mergeDesktopAcpUpdates(
      [{ cursor: 2, update: { sessionUpdate: "tool_call" } }],
      [
        { cursor: 1, update: { sessionUpdate: "agent_message_chunk" } },
        {
          cursor: 2,
          update: { sessionUpdate: "tool_call_update", status: "completed" },
        },
        ...Array.from({ length: 105 }, (_, index) => ({
          cursor: index + 3,
          update: { sessionUpdate: "agent_message_chunk" },
        })),
      ],
    );

    expect(merged).toHaveLength(100);
    expect(merged[0]?.cursor).toBe(8);
    expect(merged.at(-1)?.cursor).toBe(107);
    expect(describeDesktopAcpUpdate(merged.at(-1)?.update)).toBe(
      "agent_message_chunk",
    );
  });

  it("joins only agent text chunks into display output", () => {
    expect(
      desktopAcpResponseText([
        {
          cursor: 1,
          update: {
            sessionUpdate: "agent_message_chunk",
            content: { type: "text", text: "Hello " },
          },
        },
        {
          cursor: 2,
          update: { sessionUpdate: "tool_call", title: "Read file" },
        },
        {
          cursor: 3,
          update: {
            sessionUpdate: "agent_message_chunk",
            content: { type: "text", text: "world." },
          },
        },
      ]),
    ).toBe("Hello world.");
    expect(describeDesktopAcpUpdate(null)).toBe("ACP update");
  });
});

describe("DesktopAcpClient", () => {
  it("uses the negotiated session for editor, prompt, filesystem, and terminal lifecycle calls", async () => {
    const api = vi.fn(async (request: MockAgentRequest) => {
      if (request.path === "/acp/initialize") {
        return {
          initialized: {
            agentCapabilities: {
              promptCapabilities: { embeddedContext: true },
            },
          },
        };
      }
      if (request.path === "/acp/session/new") {
        return { session: { sessionId: "acp:test" } };
      }
      if (request.path === "/acp/editor/context") {
        return { context: { activeFile: "src/index.ts" } };
      }
      if (request.path === "/acp/session/prompt") {
        return {
          result: {
            stopReason: "end_turn",
            updates: [
              {
                cursor: 1,
                update: {
                  sessionUpdate: "agent_message_chunk",
                  content: { type: "text", text: "Done." },
                },
              },
            ],
          },
        };
      }
      if (request.path.startsWith("/acp/session/updates")) {
        return {
          snapshot: {
            sessionId: "acp:test",
            cursor: 2,
            updates: [{ cursor: 1, update: { sessionUpdate: "tool_call" } }],
          },
        };
      }
      if (request.path === "/acp/fs/read") return { content: "hello" };
      if (request.path === "/acp/fs/write") {
        return { result: { written: true } };
      }
      if (request.path === "/acp/terminal/create") {
        return { terminal: { terminalId: "term:test" } };
      }
      if (request.path === "/acp/terminal/output") {
        return { terminal: { output: "running" } };
      }
      if (request.path === "/acp/terminal/wait") {
        return { terminal: { output: "done", exitCode: 0 } };
      }
      return {};
    });
    await withAgentApi(api, async () => {
      const client = new DesktopAcpClient();
      await expect(client.capabilities()).resolves.toEqual({
        embeddedContext: true,
      });
      await expect(client.ensureSession("/workspace")).resolves.toBe(
        "acp:test",
      );
      await expect(client.ensureSession(" /workspace ")).resolves.toBe(
        "acp:test",
      );
      await expect(
        client.syncEditorContext("/workspace", {
          activeFile: "src/index.ts",
          path: "src/index.ts",
          uri: "file:///workspace/src/index.ts",
          language: "typescript",
          content: "export {};",
          version: 1,
          dirty: false,
          focused: true,
          visibleRanges: [],
          resources: [],
        }),
      ).resolves.toMatchObject({
        sessionId: "acp:test",
        context: { activeFile: "src/index.ts" },
      });
      await expect(
        client.prompt("/workspace", [{ type: "text", text: "Inspect this" }]),
      ).resolves.toMatchObject({
        sessionId: "acp:test",
        result: { stopReason: "end_turn" },
      });
      await expect(client.updates("acp:test", -12.5)).resolves.toMatchObject({
        cursor: 2,
      });
      await expect(client.readFile("acp:test", "src/index.ts")).resolves.toBe(
        "hello",
      );
      await expect(
        client.writeFile("acp:test", "src/index.ts", "updated"),
      ).resolves.toEqual({ written: true });
      await expect(
        client.createTerminal("acp:test", "git", ["status"]),
      ).resolves.toMatchObject({ terminalId: "term:test" });
      await expect(
        client.terminalOutput("acp:test", "term:test", -4),
      ).resolves.toMatchObject({ output: "running" });
      await expect(
        client.waitForTerminal("acp:test", "term:test"),
      ).resolves.toMatchObject({ output: "done", exitCode: 0 });
      await client.cancel("acp:test");
      await client.cancel(" ");
      await client.killTerminal("acp:test", "term:test");
      await client.releaseTerminal("acp:test", "term:test");

      expect(
        api.mock.calls.filter(
          ([request]) => request.path === "/acp/initialize",
        ),
      ).toHaveLength(1);
      expect(
        api.mock.calls.filter(
          ([request]) => request.path === "/acp/session/new",
        ),
      ).toHaveLength(1);
      expect(api).toHaveBeenCalledWith({
        path: "/acp/session/updates?sessionId=acp%3Atest&cursor=0",
        method: "GET",
      });
      expect(api).toHaveBeenCalledWith(
        expect.objectContaining({
          path: "/acp/terminal/output",
          body: expect.objectContaining({ cursor: 0 }),
        }),
      );
    });
  });

  it("maps a loaded ACP session to its workspace without creating a replacement", async () => {
    const api = vi.fn(async (request: MockAgentRequest) => {
      if (request.path === "/acp/initialize") {
        return { initialized: { agentCapabilities: {} } };
      }
      return {};
    });
    await withAgentApi(api, async () => {
      const client = new DesktopAcpClient();
      await client.loadSession("acp:loaded", " /workspace ");
      await expect(client.ensureSession("/workspace")).resolves.toBe(
        "acp:loaded",
      );

      expect(api).toHaveBeenCalledWith({
        path: "/acp/session/load",
        method: "POST",
        body: {
          sessionId: "acp:loaded",
          cwd: "/workspace",
          _meta: {
            "doolittle/editor-context": true,
            "doolittle/resources": true,
          },
        },
      });
      expect(
        api.mock.calls.some(([request]) => request.path === "/acp/session/new"),
      ).toBe(false);
    });
  });

  it("clears failed initialization and session promises so reconnects can recover", async () => {
    let initializeAttempts = 0;
    let sessionAttempts = 0;
    const api = vi.fn(async (request: MockAgentRequest) => {
      if (request.path === "/acp/initialize") {
        initializeAttempts += 1;
        if (initializeAttempts === 1) throw new Error("runtime starting");
        return { initialized: { agentCapabilities: {} } };
      }
      if (request.path === "/acp/session/new") {
        sessionAttempts += 1;
        if (sessionAttempts === 1) return { session: {} };
        return { session: { sessionId: "acp:recovered" } };
      }
      return {};
    });
    await withAgentApi(api, async () => {
      const client = new DesktopAcpClient();
      await expect(client.capabilities()).rejects.toThrow("runtime starting");
      await expect(client.capabilities()).resolves.toEqual({
        embeddedContext: false,
      });
      await expect(client.ensureSession("/workspace")).rejects.toThrow(
        "did not return a session id",
      );
      await expect(client.ensureSession("/workspace")).resolves.toBe(
        "acp:recovered",
      );
    });
  });

  it("rejects incomplete lifecycle inputs before they cross IPC", async () => {
    const api = vi.fn(async () => ({}));
    await withAgentApi(api, async () => {
      const client = new DesktopAcpClient();
      await expect(client.ensureSession(" ")).rejects.toThrow("workspace path");
      await expect(client.prompt("/workspace", [])).rejects.toThrow("prompt");
      await expect(client.loadSession("", "/workspace")).rejects.toThrow(
        "session id",
      );
      await expect(client.readFile("session", "")).rejects.toThrow("file path");
      await expect(client.createTerminal("session", " ", [])).rejects.toThrow(
        "terminal command",
      );
      await expect(client.killTerminal("session", "")).rejects.toThrow(
        "terminal id",
      );
      expect(api).not.toHaveBeenCalled();
    });
  });
});
