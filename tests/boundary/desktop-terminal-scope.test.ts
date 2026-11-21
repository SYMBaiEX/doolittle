import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DOOLITTLE_SHELL_SERVICE } from "@doolittle/contracts";
import type { IAgentRuntime, Memory } from "@elizaos/core";
import { afterEach, expect, it, vi } from "vitest";
import {
  validateDesktopCommandRequest,
  validateTerminalStreamRequest,
} from "../../apps/desktop/src/main/ipc/ipc-validation";
import { createCodingAction } from "../../packages/agent/src/actions/coding-action";
import { createSdkTerminalAction } from "../../packages/agent/src/actions/sdk-terminal-action";
import { extractCommandResultFromActionResult } from "../../packages/agent/src/runtime/action-result-metadata";
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

const budgets = [
  {
    budget: "configured",
    configuredMs: 90_000,
    sdkLimit: undefined,
    expectedMs: 90_000,
  },
  {
    budget: "default",
    configuredMs: undefined,
    sdkLimit: undefined,
    expectedMs: 120_000,
  },
  {
    budget: "saved 30 second",
    configuredMs: 30_000,
    sdkLimit: undefined,
    expectedMs: 30_000,
  },
  {
    budget: "SDK-capped",
    configuredMs: 90_000,
    sdkLimit: "45000",
    expectedMs: 45_000,
  },
];

it.each(budgets)("honors the $budget SDK budget", async (budget) => {
  const { configuredMs, sdkLimit, expectedMs } = budget;
  vi.stubEnv("DOOLITTLE_DESKTOP_RUNTIME", "1");
  vi.stubEnv("ELIZA_TERMINAL_RUN_TOKEN", "");
  vi.stubEnv("ELIZA_TERMINAL_MAX_DURATION_MS", sdkLimit);
  const root = mkdtempSync(join(tmpdir(), "doolittle-terminal-scope-"));
  const scope = {
    sessionId: randomUUID(),
    botId: "lead",
    workspacePath: root,
  };
  resolveScope.mockResolvedValue(scope);
  const record = {
    id: "",
    command: "pwd",
    exitCode: 0,
    stdout: root,
    stderr: "",
    cwd: root,
    timeoutMs: expectedMs,
    durationMs: 1,
    backend: "local",
  };
  const run = vi.fn(async (_command, timeoutMs, signal, options) => {
    expect(currentConversationWorkspace()).toEqual(scope);
    expect(timeoutMs).toBe(expectedMs);
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
    settings: {
      get: () => ({ execution: { commandTimeoutMs: configuredMs } }),
    },
    terminal: {
      assertExecutionAvailable: () => undefined,
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
    expect(createCodingAction().subActions).toContain(action.name);
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
        actionName: action.name,
        command: "pwd",
        executedIn: root,
        exitCode: 0,
        maxDurationMs: expectedMs,
      }),
    );
    if (!result) throw new Error("SDK terminal result was not returned");
    expect(extractCommandResultFromActionResult(result)).toMatchObject({
      command: "pwd",
      executedIn: root,
      exitCode: 0,
      success: true,
    });
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

it("preserves timeout omission and explicit budgets across desktop IPC", () => {
  expect(validateDesktopCommandRequest({ command: "pwd" })).toEqual({
    command: "pwd",
  });
  const stream = { requestId: "terminal-request", command: "pwd" };
  expect(validateTerminalStreamRequest(stream)).toEqual(stream);
  expect(
    validateTerminalStreamRequest({ ...stream, timeoutMs: 90_000 }),
  ).toEqual({
    ...stream,
    timeoutMs: 90_000,
  });
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
