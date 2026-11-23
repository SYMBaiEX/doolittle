import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { IAgentRuntime } from "@elizaos/core";
import { expect, it, vi } from "vitest";
import { resolveNativeAcpStateDir } from "../../packages/agent/src/runtime/bootstrap/env/plugin-settings/ambient";

const requestHost = vi.hoisted(() => vi.fn());
vi.mock("../../packages/agent/src/runtime/bootstrap/worker-host-rpc", () => ({
  requestWorkerHost: requestHost,
}));

const FIXTURE_ADAPTER = `
import { createInterface } from "node:readline";
const send = (fields) => console.log(JSON.stringify({ jsonrpc: "2.0", ...fields }));
const sessionId = "test-native-session";
const pending = new Map();
let nextId = 0;
const query = (method, params) => new Promise((resolve) => {
  const id = "tool-" + nextId++;
  pending.set(id, resolve);
  send({ id, method, params: { sessionId, ...params } });
});
createInterface({ input: process.stdin }).on("line", async (line) => {
  const message = JSON.parse(line);
  const { id, method } = message;
  if (pending.has(id)) {
    pending.get(id)(message);
    pending.delete(id);
    return;
  }
  if (id === undefined) return;
  if (method === "session/prompt") {
    const permission = await query("session/request_permission", {
      toolCall: { kind: "edit", title: "Edit file" },
      options: [
        { kind: "allow_once", optionId: "allow" },
        { kind: "reject_once", optionId: "deny" },
      ],
    });
    const interior = await query("fs/write_text_file", {
      path: "note.txt", content: "updated by ACP",
    });
    const exterior = await query("fs/write_text_file", {
      path: "../outside.txt", content: "escaped",
    });
    const terminal = await query("terminal/create", {
      command: process.execPath, args: ["--version"],
    });
    send({ method: "session/update", params: {
      sessionId, update: { sessionUpdate: "agent_message_chunk", content: {
        type: "text", text: JSON.stringify({
          permission: permission.result.outcome.optionId,
          editAccepted: !interior.error,
          escapeAccepted: !exterior.error,
          terminalAccepted: !terminal.error,
        }),
      } },
    } });
  }
  const result = method === "session/new" ? { sessionId }
    : method === "session/prompt" ? { stopReason: "end_turn" } : {};
  send({ id, result });
});
`;

it("keeps ACP storage within the current profile before SDK startup", () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "doolittle-acp-path-")));
  const profile = join(root, "profile");
  const ownState = join(profile, "plugin-acp");
  const foreignState = join(root, "foreign");
  try {
    mkdirSync(profile);
    mkdirSync(foreignState);
    expect(resolveNativeAcpStateDir(profile, ownState)).toBe(ownState);
    for (const override of ["", foreignState]) {
      expect(() => resolveNativeAcpStateDir(profile, override)).toThrow(
        "must stay within the Doolittle profile",
      );
    }
    symlinkSync(foreignState, ownState, "dir");
    expect(() => resolveNativeAcpStateDir(profile, undefined)).toThrow(
      "requires ordinary profile directories",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it("only maintains its own state and cannot launch a retired ACPX session", async () => {
  const root = realpathSync(
    mkdtempSync(join(tmpdir(), "doolittle-acp-state-")),
  );
  const home = join(root, "home");
  const temp = join(root, "tmp");
  const state = join(root, "client-acp");
  const scratch = join(state, "workspaces");
  const foreignLock = join(home, ".acpx", "queues", "other-client.lock");
  const foreignStream = join(home, ".acpx", "sessions", "other.stream.ndjson");
  const foreignWorkspace = join(temp, "eliza-acp", `task-${randomUUID()}`);
  const ownedWorkspace = join(scratch, `task-${randomUUID()}`);
  const old = new Date(Date.now() - 48 * 60 * 60 * 1000);
  for (const folder of [
    dirname(foreignLock),
    dirname(foreignStream),
    foreignWorkspace,
    ownedWorkspace,
  ])
    mkdirSync(folder, { recursive: true });
  for (const file of [foreignLock, foreignStream])
    writeFileSync(file, "external");
  for (const path of [
    foreignLock,
    foreignStream,
    foreignWorkspace,
    ownedWorkspace,
  ])
    utimesSync(path, old, old);

  const legacyMarker = join(root, "legacy-ran");
  const legacyCommand = join(root, "old-launcher");
  writeFileSync(legacyCommand, `#!/bin/sh\ntouch "${legacyMarker}"\n`, {
    mode: 0o700,
  });

  vi.stubEnv("HOME", home);
  vi.stubEnv("TMPDIR", temp);
  vi.stubEnv("TMP", temp);
  vi.stubEnv("TEMP", temp);
  vi.stubEnv("USERPROFILE", home);
  vi.stubEnv("ELIZA_ACP_TRANSPORT", "cli");
  try {
    vi.resetModules();
    const { DesktopAdmittedAcpService } = await import(
      "../../packages/agent/src/runtime/native/desktop-admitted-acp"
    );
    const { InMemorySessionStore } = await import(
      "@elizaos/plugin-agent-orchestrator"
    );
    const store = new InMemorySessionStore();
    await store.create({
      id: "historical-session",
      agentType: "codex",
      workdir: home,
      status: "ready",
      acpxSessionId: "historical-acpx-id",
      approvalPreset: "standard",
      createdAt: new Date(),
      lastActivityAt: new Date(),
      metadata: { transportMode: "cli" },
    });

    const service = new DesktopAdmittedAcpService(
      testRuntime({
        ELIZA_ACP_STATE_DIR: state,
        ELIZA_ACP_TRANSPORT: "native",
        ELIZA_ACP_WORKSPACE_ROOT: scratch,
        ELIZA_ACP_CLI: legacyCommand,
      }),
      { store },
    );
    try {
      await service.start();
      expect(existsSync(ownedWorkspace)).toBe(false);
      expect(existsSync(foreignWorkspace)).toBe(true);
      expect(readFileSync(foreignLock, "utf8")).toBe("external");
      expect(readFileSync(foreignStream, "utf8")).toBe("external");
      expect(await service.getSession("historical-session")).toMatchObject({
        metadata: { transportMode: "cli" },
      });
      await expect(
        service.reattachSession("historical-session"),
      ).rejects.toThrow("Legacy ACP sessions cannot run commands");
      await expect(service.cancelSession("historical-session")).rejects.toThrow(
        "Legacy ACP sessions cannot run commands",
      );
      await expect(service.closeSession("historical-session")).rejects.toThrow(
        "Legacy ACP sessions cannot run commands",
      );
      expect(existsSync(legacyMarker)).toBe(false);
    } finally {
      await service.stop();
    }
  } finally {
    vi.unstubAllEnvs();
    rmSync(root, { recursive: true, force: true });
  }
});

it("admits only the approved desktop workspace and leaves ACP tool policy with ElizaOS", async () => {
  const root = realpathSync(
    mkdtempSync(join(tmpdir(), "doolittle-acp-grants-")),
  );
  const state = join(root, "native-acp");
  const workspace = join(root, "workspace");
  const note = join(workspace, "note.txt");
  mkdirSync(workspace);
  writeFileSync(note, "unchanged");
  execFileSync("git", ["init", "-q"], { cwd: workspace });
  execFileSync("git", ["add", "note.txt"], { cwd: workspace });
  const adapter = join(root, "acp-adapter.mjs");
  writeFileSync(adapter, FIXTURE_ADAPTER);
  const scope = {
    sessionId: "test-conversation",
    botId: "test-bot",
    workspacePath: workspace,
  };
  requestHost.mockImplementation(async (operation: string) => {
    if (operation === "workspace.resolve") return scope;
    if (operation === "execution.claim")
      return { accepted: true, leaseId: randomUUID() };
    if (operation === "execution.release") return {};
    throw new Error(`Unexpected test RPC: ${operation}`);
  });
  vi.stubEnv("DOOLITTLE_DESKTOP_RUNTIME", "1");
  try {
    const { runWithExecutionLease } = await import(
      "../../packages/agent/src/runtime/execution-admission"
    );
    const { DesktopAdmittedAcpService } = await import(
      "../../packages/agent/src/runtime/native/desktop-admitted-acp"
    );
    const { InMemorySessionStore } = await import(
      "@elizaos/plugin-agent-orchestrator"
    );
    const service = new DesktopAdmittedAcpService(
      testRuntime({
        ELIZA_ACP_STATE_DIR: state,
        ELIZA_ACP_TRANSPORT: "native",
        ELIZA_ACP_WORKSPACE_ROOT: join(state, "workspaces"),
        ELIZA_ACP_DEFAULT_APPROVAL: "standard",
        ELIZA_ACP_NO_TERMINAL: "true",
        ELIZA_ELIZAOS_ACP_COMMAND: `"${process.execPath}" "${adapter}"`,
      }),
      { store: new InMemorySessionStore() },
    );
    const parent = {
      runId: "approved-run",
      sessionId: scope.sessionId,
      release: async () => {},
      yieldFor: <T>(work: () => Promise<T>) => work(),
    };
    const spawn = {
      agentType: "elizaos",
      workdir: workspace,
      metadata: { doolittleParentRunId: parent.runId },
      timeoutMs: 4_000,
    } as const;

    try {
      await service.start();
      await expect(service.spawnSession(spawn)).rejects.toThrow(
        "active, matching desktop run",
      );
      await runWithExecutionLease(parent, async () => {
        await expect(
          service.spawnSession({ ...spawn, workdir: root }),
        ).rejects.toThrow("workspace no longer matches");
        expect(await service.listSessions()).toEqual([]);
        const readOnly = await service.spawnSession(spawn);
        expect(await service.getSession(readOnly.sessionId)).toMatchObject({
          approvalPreset: "standard",
          metadata: { transportMode: "native" },
        });
        expect(
          existsSync(
            join(state, "native", "git-indexes", readOnly.sessionId, "index"),
          ),
        ).toBe(true);
        const denied = await service.sendPrompt(
          readOnly.sessionId,
          "Try the edit",
        );
        expect(JSON.parse(denied.finalText)).toEqual({
          permission: "deny",
          editAccepted: false,
          escapeAccepted: false,
          terminalAccepted: false,
        });
        expect(readFileSync(note, "utf8")).toBe("unchanged");
        await service.closeSession(readOnly.sessionId);
        expect(
          existsSync(join(state, "native", "git-indexes", readOnly.sessionId)),
        ).toBe(false);

        const editable = await service.spawnSession({
          ...spawn,
          approvalPreset: "permissive",
        });
        const allowed = await service.sendPrompt(
          editable.sessionId,
          "Try the edit",
        );
        expect(JSON.parse(allowed.finalText)).toEqual({
          permission: "allow",
          editAccepted: true,
          escapeAccepted: false,
          terminalAccepted: false,
        });
        expect(readFileSync(note, "utf8")).toBe("updated by ACP");
        expect(existsSync(join(root, "outside.txt"))).toBe(false);
        await service.closeSession(editable.sessionId);
      });
    } finally {
      await service.stop();
    }
  } finally {
    vi.unstubAllEnvs();
    rmSync(root, { recursive: true, force: true });
  }
});

function testRuntime(settings: Record<string, string>): IAgentRuntime {
  return {
    getSetting: (key: string) => settings[key] ?? null,
    getService: () => null,
    logger: { debug() {}, info() {}, warn() {}, error() {} },
    reportError: vi.fn(),
  } as unknown as IAgentRuntime;
}
