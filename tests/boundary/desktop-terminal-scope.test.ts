import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DOOLITTLE_SHELL_SERVICE } from "@doolittle/contracts";
import type { IAgentRuntime, Memory } from "@elizaos/core";
import { afterEach, expect, it, vi } from "vitest";
import { createSdkTerminalAction } from "../../packages/agent/src/actions/sdk-terminal-action";
import type { AppContext } from "../../packages/agent/src/runtime/bootstrap";
import { leaseTerminalActionScope } from "../../packages/agent/src/runtime/terminal-action-scope";
import {
  currentConversationWorkspace,
  runWithConversationWorkspace,
} from "../../packages/agent/src/runtime/workspace-scope";
import { handleOperationsRoutes } from "../../packages/agent/src/server/routes/operations";
import { withDirectConversationWorkspace } from "../../packages/agent/src/server/routes/workspace-scope";
import type { AppServices } from "../../packages/agent/src/services";

const { resolveScope } = vi.hoisted(() => ({ resolveScope: vi.fn() }));
vi.mock("../../packages/agent/src/runtime/workspace-scope", async (load) => ({
  ...(await load<object>()),
  resolveConversationWorkspace: resolveScope,
}));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it("runs the real SDK terminal action in its verified desktop workspace without exposing origin authority", async () => {
  vi.stubEnv("DOOLITTLE_DESKTOP_RUNTIME", "1");
  vi.stubEnv("ELIZA_TERMINAL_RUN_TOKEN", "");
  const root = mkdtempSync(join(tmpdir(), "doolittle-terminal-scope-"));
  const scope = { sessionId: randomUUID(), botId: "lead", workspacePath: root };
  resolveScope.mockResolvedValue(scope);
  const record = {
    id: "",
    command: "pwd",
    exitCode: 0,
    stdout: root,
    stderr: "",
    cwd: root,
    durationMs: 1,
    backend: "local",
  };
  const run = vi.fn(async (_command, _timeout, signal, options) => {
    expect(currentConversationWorkspace()).toEqual(scope);
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal.aborted).toBe(false);
    record.id = options.runId;
    return record;
  });
  const runtime = {
    agentId: randomUUID(),
    getService: (name: string) =>
      name === DOOLITTLE_SHELL_SERVICE ? { run } : null,
    getSetting: () => undefined,
    redactSecrets: (value: string) => value,
  } as unknown as IAgentRuntime;
  const services = {
    terminal: {
      recent: () => [record],
      preflightProductionBuild: () => undefined,
    },
  } as unknown as AppServices;
  const handler = withDirectConversationWorkspace(
    handleOperationsRoutes,
    () => true,
  );
  const context = { runtime, services } as AppContext;
  let captured: Request | undefined;
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    captured = new Request(url, init);
    expect(captured.headers.has("x-doolittle-origin-conversation")).toBe(false);
    return handler(context, captured.clone(), new URL(url));
  });
  try {
    const action = createSdkTerminalAction(services);
    const result = await runWithConversationWorkspace(scope, () =>
      action.handler(
        runtime,
        { id: randomUUID(), roomId: scope.sessionId } as Memory,
        undefined,
        { parameters: { command: "pwd" } },
      ),
    );
    expect(result?.success, result?.text).toBe(true);
    expect(result?.data).toEqual(
      expect.objectContaining({
        command: "pwd",
        executedIn: root,
        exitCode: 0,
      }),
    );
    expect(run).toHaveBeenCalledOnce();
    if (!captured) throw new Error("SDK request was not captured");
    const replay = await handler(
      context,
      captured.clone(),
      new URL(captured.url),
    );
    expect(replay?.status).toBe(409);
    expect(run).toHaveBeenCalledOnce();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it("rejects unleased, cancelled and competing identical commands without borrowing a workspace", async () => {
  vi.stubEnv("DOOLITTLE_DESKTOP_RUNTIME", "1");
  vi.stubEnv("ELIZA_TERMINAL_RUN_TOKEN", "");
  const handler = withDirectConversationWorkspace(
    handleOperationsRoutes,
    () => true,
  );
  const request = (owned = false) =>
    new Request("http://127.0.0.1/api/terminal/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        command: "pwd",
        captureOutput: true,
        ...(owned
          ? {
              clientId: "runtime-terminal-action",
              terminalToken: process.env.ELIZA_TERMINAL_RUN_TOKEN,
            }
          : {}),
      }),
    });
  expect(
    (await handler({} as AppContext, request(), new URL(request().url)))
      ?.status,
  ).toBe(409);
  const scope = {
    sessionId: randomUUID(),
    botId: "lead",
    workspacePath: tmpdir(),
  };
  await runWithConversationWorkspace(scope, async () => {
    const controller = new AbortController();
    const release = leaseTerminalActionScope("pwd", controller.signal);
    try {
      expect(() => leaseTerminalActionScope("pwd")).toThrow("already pending");
      controller.abort();
      const denied = request(true);
      denied.headers.set(
        "x-eliza-terminal-token",
        process.env.ELIZA_TERMINAL_RUN_TOKEN ?? "",
      );
      expect(
        (await handler({} as AppContext, denied, new URL(denied.url)))?.status,
      ).toBe(409);
    } finally {
      release();
    }
  });
  expect(resolveScope).not.toHaveBeenCalled();
});

it("revalidates project authority before dispatching a leased SDK command", async () => {
  vi.stubEnv("DOOLITTLE_DESKTOP_RUNTIME", "1");
  vi.stubEnv("ELIZA_TERMINAL_RUN_TOKEN", "");
  const scope = {
    sessionId: randomUUID(),
    botId: "lead",
    workspacePath: tmpdir(),
  };
  resolveScope.mockResolvedValue({
    ...scope,
    workspacePath: join(tmpdir(), "changed"),
  });
  const dispatch = vi.fn();
  const handler = withDirectConversationWorkspace(dispatch, () => true);
  await runWithConversationWorkspace(scope, async () => {
    const release = leaseTerminalActionScope("pwd");
    try {
      const token = process.env.ELIZA_TERMINAL_RUN_TOKEN ?? "";
      const request = new Request("http://127.0.0.1/api/terminal/run", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-eliza-terminal-token": token,
        },
        body: JSON.stringify({
          command: "pwd",
          captureOutput: true,
          clientId: "runtime-terminal-action",
          terminalToken: token,
        }),
      });
      expect(
        (await handler({} as AppContext, request, new URL(request.url)))
          ?.status,
      ).toBe(409);
      expect(dispatch).not.toHaveBeenCalled();
      expect(resolveScope).toHaveBeenCalledOnce();
    } finally {
      release();
    }
  });
});
