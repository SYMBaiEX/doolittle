import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  CreateTerminalResponse,
  RequestPermissionResponse,
} from "@doolittle/acp";
import { describe, expect, it } from "vitest";
import type { EnvConfig, SessionSummary, StoredMessage } from "@/types";
import type { RunUpdateEvent } from "../run-controller-service";
import { AcpService } from "./service";
import type { AcpProtocolHost } from "./types";

describe("official ACP protocol runtime", () => {
  it("negotiates, streams updates, carries editor resources, and gates writes", async () => {
    const fixture = createFixture();
    let prompt = "";
    const files = new Map<string, string>([
      [join(fixture.root, "src", "index.ts"), "export const before = true;"],
    ]);
    const writes: Array<{ path: string; content: string }> = [];
    const host = createHost(fixture.root, {
      files,
      writes,
      executeTurn: async (input) => {
        prompt = input.message;
        await input.onRunUpdate(
          runEvent("action-started", {
            activeAction: "workspace.write",
            observedActionCount: 1,
          }),
        );
        files.set(
          join(fixture.root, "src", "index.ts"),
          "export const after = true;",
        );
        await input.onRunUpdate(
          runEvent("local-mutation", {
            activeAction: "workspace.write",
            observedActionCount: 1,
            localMutations: [
              {
                action: "workspace.write",
                requestedPath: "src/index.ts",
                resolvedPath: join(fixture.root, "src", "index.ts"),
                success: true,
                recordedAt: new Date().toISOString(),
              },
            ],
          }),
        );
        await input.onText("Done");
        return "Done";
      },
    });
    fixture.service.bindProtocolHost(host);

    try {
      const initialized = await fixture.service.initializeProtocol();
      expect(initialized.protocolVersion).toBe(1);
      expect(initialized.agentCapabilities?.loadSession).toBe(true);
      expect(initialized.agentCapabilities?._meta).toBeUndefined();
      expect(initialized._meta?.["doolittle/stable-acp"]).toBe("v1");

      const session = await fixture.service.newProtocolSession();
      const editor = fixture.service.updateEditorContext(session.sessionId, {
        path: "src/index.ts",
        uri: `file://${join(fixture.root, "src", "index.ts")}`,
        language: "typescript",
        content: "x".repeat(40_000),
        version: 7,
        dirty: true,
        focused: true,
        cursor: { lineNumber: 12, column: 4 },
        selection: {
          startLineNumber: 12,
          startColumn: 4,
          endLineNumber: 12,
          endColumn: 9,
          text: "after",
        },
        visibleRanges: [
          {
            startLineNumber: 1,
            startColumn: 1,
            endLineNumber: 40,
            endColumn: 1,
          },
        ],
        resources: [{ uri: "file:///repo/README.md", text: "resource text" }],
      });
      expect(editor.content).toHaveLength(32_000);
      expect(editor.cursor).toEqual({ lineNumber: 12, column: 4 });
      expect(fixture.service.latestEditorContext(fixture.root)).toMatchObject({
        sessionId: session.sessionId,
        context: { path: "src/index.ts", language: "typescript" },
      });
      expect(
        fixture.service.latestEditorContext("/tmp/unrelated-workspace"),
      ).toBeUndefined();

      const result = await fixture.service.promptProtocolSession({
        sessionId: session.sessionId,
        prompt: [{ type: "text", text: "Make the edit" }],
        _meta: { resources: [{ uri: "file:///repo/package.json" }] },
      });
      expect(result.stopReason).toBe("end_turn");
      expect(prompt).toContain("[ACP editor context]");
      expect(prompt).toContain("file:///repo/package.json");
      expect(
        result.updates.some(
          (entry) => entry.update.sessionUpdate === "tool_call",
        ),
      ).toBe(true);
      const diffUpdate = result.updates.find(
        (entry) =>
          entry.update.sessionUpdate === "tool_call_update" &&
          entry.update.content?.some((content) => content.type === "diff"),
      );
      expect(diffUpdate?.update).toMatchObject({
        sessionUpdate: "tool_call_update",
        locations: [{ path: join(fixture.root, "src", "index.ts") }],
      });

      const write = await fixture.service.writeTextFile({
        sessionId: session.sessionId,
        path: join(fixture.root, "src", "index.ts"),
        content: "approved",
      });
      expect(write.written).toBe(true);
      expect(writes).toEqual([
        {
          path: join(fixture.root, "src", "index.ts"),
          content: "approved",
        },
      ]);
    } finally {
      fixture.dispose();
    }
  });

  it("loads persisted session messages and cancels an active prompt", async () => {
    const existingSession = "room:existing";
    const fixture = createFixture(
      [
        {
          sessionId: existingSession,
          title: "Existing",
          messageCount: 1,
          participants: ["assistant"],
          preview: ["prior"],
        },
      ],
      [
        {
          id: "message-1",
          sessionId: existingSession,
          roomId: existingSession,
          entityId: "agent",
          role: "assistant",
          text: "prior answer",
          createdAt: new Date().toISOString(),
        },
      ],
    );
    fixture.service.bindProtocolHost(
      createHost(fixture.root, {
        executeTurn: (input) =>
          new Promise((resolve) => {
            input.signal.addEventListener("abort", () => resolve("cancelled"), {
              once: true,
            });
          }),
      }),
    );

    try {
      await fixture.service.initializeProtocol();
      await fixture.service.loadProtocolSession({
        sessionId: existingSession,
        cwd: fixture.root,
        mcpServers: [],
        _meta: { "doolittle/editor-context": true },
      });
      expect(
        fixture.service
          .protocolUpdates(existingSession)
          .updates.some(
            (entry) =>
              entry.update.sessionUpdate === "agent_message_chunk" &&
              entry.update.content.type === "text" &&
              entry.update.content.text === "prior answer",
          ),
      ).toBe(true);

      const pending = fixture.service.promptProtocolSession({
        sessionId: existingSession,
        prompt: [{ type: "text", text: "wait" }],
      });
      await Promise.resolve();
      await fixture.service.cancelProtocolSession(existingSession);
      await expect(pending).resolves.toMatchObject({ stopReason: "cancelled" });
    } finally {
      fixture.dispose();
    }
  });

  it("rejects session roots outside the configured workspace", async () => {
    const fixture = createFixture();
    fixture.service.bindProtocolHost(createHost(fixture.root));
    try {
      await fixture.service.initializeProtocol();
      await expect(
        fixture.service.newProtocolSession({
          cwd: join(fixture.root, "..", "traversal"),
        }),
      ).rejects.toThrow();
    } finally {
      fixture.dispose();
    }
  });

  it("honors negotiated client capabilities and denied write/terminal permissions", async () => {
    const denied = createFixture();
    const writes: Array<{ path: string; content: string }> = [];
    let terminalCreates = 0;
    denied.service.bindProtocolHost(
      createHost(denied.root, {
        writes,
        permission: {
          outcome: { outcome: "selected", optionId: "reject_once" },
        },
        createTerminal: async () => {
          terminalCreates += 1;
          return { terminalId: "must-not-run" };
        },
      }),
    );
    try {
      const session = await denied.service.newProtocolSession();
      await expect(
        denied.service.readTextFile({
          sessionId: session.sessionId,
          path: join(denied.root, "README.md"),
        }),
      ).resolves.toBe("");
      await expect(
        denied.service.writeTextFile({
          sessionId: session.sessionId,
          path: join(denied.root, "README.md"),
          content: "denied",
        }),
      ).resolves.toMatchObject({ written: false });
      await expect(
        denied.service.createTerminal({
          sessionId: session.sessionId,
          command: "pwd",
        }),
      ).resolves.not.toHaveProperty("terminalId");
      expect(writes).toEqual([]);
      expect(terminalCreates).toBe(0);
    } finally {
      denied.dispose();
    }

    const incapable = createFixture();
    incapable.service.bindProtocolHost(createHost(incapable.root));
    try {
      await incapable.service.initializeProtocol({
        protocolVersion: 1,
        clientCapabilities: {
          fs: { readTextFile: false, writeTextFile: false },
          terminal: false,
        },
      });
      const session = await incapable.service.newProtocolSession();
      await expect(
        incapable.service.readTextFile({
          sessionId: session.sessionId,
          path: join(incapable.root, "README.md"),
        }),
      ).rejects.toThrow();
    } finally {
      incapable.dispose();
    }
  });
});

function createFixture(
  sessions: SessionSummary[] = [],
  messages: StoredMessage[] = [],
) {
  const root = mkdtempSync(join(tmpdir(), "doolittle-acp-protocol-"));
  const config = {
    agentName: "Doolittle",
    dataDir: root,
    workspaceDir: root,
    acpTimeoutMs: 5_000,
  } as EnvConfig;
  const service = new AcpService(
    config,
    () => ({
      totalSessions: sessions.length,
      recentSessionIds: sessions.map((entry) => entry.sessionId),
    }),
    () => sessions,
    (sessionId) =>
      messages.filter((message) => message.sessionId === sessionId),
  );
  return {
    root,
    service,
    dispose: () => rmSync(root, { recursive: true, force: true }),
  };
}

function createHost(
  root: string,
  overrides: {
    files?: Map<string, string>;
    writes?: Array<{ path: string; content: string }>;
    executeTurn?: AcpProtocolHost["executeTurn"];
    permission?: RequestPermissionResponse;
    createTerminal?: AcpProtocolHost["createTerminal"];
  } = {},
): AcpProtocolHost {
  const terminal: CreateTerminalResponse = { terminalId: "terminal-1" };
  const permission: RequestPermissionResponse = {
    outcome: { outcome: "selected", optionId: "allow_once" },
  };
  return {
    assertWorkspacePath(path) {
      if (path !== root && !path.startsWith(`${root}/`)) {
        throw new Error("Path must stay inside the configured workspace.");
      }
    },
    readWorkspace(path) {
      return overrides.files?.get(path) ?? "";
    },
    async writeWorkspace(path, content) {
      overrides.writes?.push({ path, content });
      overrides.files?.set(path, content);
      return path;
    },
    async requestPermission() {
      return overrides.permission ?? permission;
    },
    createTerminal:
      overrides.createTerminal ??
      (async () => {
        return terminal;
      }),
    terminalOutput() {
      return { output: "", truncated: false };
    },
    async waitForTerminalExit() {
      return { exitCode: 0 };
    },
    async killTerminal() {},
    async releaseTerminal() {},
    executeTurn:
      overrides.executeTurn ??
      (async (input) => {
        await input.onText("ok");
        return "ok";
      }),
  };
}

function runEvent(
  type: RunUpdateEvent["type"],
  overrides: Partial<RunUpdateEvent["run"]>,
): RunUpdateEvent {
  return {
    type,
    sessionId: "acp:test",
    run: {
      runId: "run-1",
      sessionId: "acp:test",
      roomId: "acp:test",
      source: "api",
      message: "test",
      runDepth: "standard",
      configuredMaxIterations: 4,
      observedActionCount: 0,
      progressMode: "all",
      status: "acting",
      localMutations: [],
      pendingApprovals: 0,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...overrides,
    },
  };
}
