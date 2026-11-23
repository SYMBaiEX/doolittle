import { randomUUID } from "node:crypto";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
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
import { buildProjectVerificationContext } from "../../packages/agent/src/runtime/prompt-cache";
import { rememberProjectVerification } from "../../packages/agent/src/runtime/prompt-cache/project-verification";
import { leaseTerminalActionScope } from "../../packages/agent/src/runtime/terminal-action-scope";
import { runWithTurnRuntimeScope } from "../../packages/agent/src/runtime/turn-runtime-scope";
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
    budget: "default with verbose output",
    configuredMs: undefined,
    sdkLimit: undefined,
    expectedMs: 120_000,
    verbose: true,
  },
  {
    budget: "configured with a recognized verification command",
    configuredMs: 90_000,
    sdkLimit: undefined,
    expectedMs: 90_000,
    learn: true,
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
  const root = realpathSync(
    mkdtempSync(join(tmpdir(), "doolittle-terminal-scope-")),
  );
  const scope = {
    sessionId: randomUUID(),
    botId: "lead",
    workspacePath: root,
    projectId: "the-project",
  };
  const command = budget.learn ? "npm test" : "pwd";
  resolveScope.mockResolvedValue(scope);
  const stdout = budget.verbose
    ? `${"✓ test passed\n".repeat(12_000)}${root}`
    : root;
  const stderr = budget.verbose ? "build diagnostic\n".repeat(4_000) : "";
  const record = {
    id: "",
    command,
    exitCode: 0,
    stdout,
    stderr,
    cwd: root,
    timeoutMs: expectedMs,
    durationMs: 1,
    backend: "local",
    backendMode: "local",
    completedAt: new Date().toISOString(),
  };
  const run = vi.fn(async (requestedCommand, timeoutMs, signal, options) => {
    expect(currentConversationWorkspace()).toEqual(scope);
    expect(requestedCommand).toBe(command);
    expect(timeoutMs).toBe(expectedMs);
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal.aborted).toBe(false);
    record.id = options.runId;
    return record;
  });
  const cache = new Map<string, unknown>();
  const runtime = {
    agentId: randomUUID(),
    getService: (name: string) =>
      name === DOOLITTLE_SHELL_SERVICE ? { run } : null,
    getSetting: () => undefined,
    getCache: async (key: string) => cache.get(key),
    setCache: async (key: string, value: unknown) => {
      cache.set(key, value);
      return true;
    },
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
    const message = {
      id: randomUUID(),
      roomId: scope.sessionId,
      sessionId: scope.sessionId,
      entityId: randomUUID(),
      content: { source: "desktop" },
    } as Memory;
    const runTurn = <T>(session: typeof scope, work: () => Promise<T>) =>
      runWithConversationWorkspace(session, () =>
        runWithTurnRuntimeScope(
          runtime,
          { settings: new Map(), settledActionResults: [] },
          work,
        ),
      );
    const result = await runTurn(scope, () =>
      action.handler(runtime, message, undefined, { parameters: { command } }),
    );
    expect(result?.success, result?.text).toBe(true);
    expect(result?.data).toEqual(
      expect.objectContaining({
        actionName: action.name,
        command,
        executedIn: root,
        exitCode: 0,
        maxDurationMs: expectedMs,
        stdout,
        stderr,
        truncated: false,
      }),
    );
    if (!result) throw new Error("SDK terminal result was not returned");
    expect(extractCommandResultFromActionResult(result)).toMatchObject({
      command,
      executedIn: root,
      exitCode: 0,
      success: true,
    });
    const futureScope = { ...scope, sessionId: randomUUID() };
    const remembered = await runTurn(futureScope, () =>
      buildProjectVerificationContext(services, runtime, {
        ...message,
        sessionId: futureScope.sessionId,
      }),
    );
    if (budget.learn) {
      expect(remembered).toContain(
        "A previous local run of `npm test` exited successfully",
      );
      expect([...cache.values()]).toEqual([
        { check: "npm test", completedAt: Date.parse(record.completedAt) },
      ]);
      const futureMessage = { ...message, sessionId: futureScope.sessionId };
      for (const otherScope of [
        { ...futureScope, projectId: "another-project" },
        { ...futureScope, botId: "another-bot" },
        { ...futureScope, workspacePath: "/another-workspace" },
      ]) {
        await expect(
          runTurn(otherScope, () =>
            buildProjectVerificationContext(services, runtime, futureMessage),
          ),
        ).resolves.toBeUndefined();
      }
      await expect(
        runTurn(futureScope, () =>
          buildProjectVerificationContext(services, runtime, {
            ...futureMessage,
            entityId: randomUUID(),
          }),
        ),
      ).resolves.toBeUndefined();
    } else {
      expect(remembered).toBeUndefined();
      expect(cache.size).toBe(0);
    }
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

it("retains only current canonical verification receipts in a local CLI workspace", async () => {
  vi.stubEnv("DOOLITTLE_DESKTOP_RUNTIME", "");
  const directory = realpathSync(
    mkdtempSync(join(tmpdir(), "doolittle-cli-verification-")),
  );
  const cache = new Map<string, unknown>();
  const runtime = {
    agentId: randomUUID(),
    getSetting: () => undefined,
    getCache: async (key: string) => cache.get(key),
    setCache: async (key: string, value: unknown) => {
      cache.set(key, value);
      return true;
    },
  } as unknown as IAgentRuntime;
  const services = {
    sessions: { projectIdForSession: () => undefined },
    workspace: { root: () => directory },
  } as unknown as AppServices;
  const message = {
    id: randomUUID(),
    roomId: randomUUID(),
    sessionId: "cli-session",
    entityId: randomUUID(),
    content: { source: "cli" },
  } as Memory;
  const receipt = {
    command: "nub run test",
    backend: "local",
    backendMode: "local",
    cwd: directory,
    exitCode: 0,
    completedAt: new Date().toISOString(),
  } as const;
  try {
    await runWithTurnRuntimeScope(
      runtime,
      { settings: new Map(), settledActionResults: [] },
      async () => {
        for (const invalidReceipt of [
          { ...receipt, command: "nub run test && echo secret" },
          { ...receipt, backendMode: "container" as const },
          { ...receipt, exitCode: 1 },
          { ...receipt, timedOut: true },
          { ...receipt, cwd: "/" },
          { ...receipt, completedAt: "2020-01-01T00:00:00Z" },
        ]) {
          await rememberProjectVerification(
            services,
            runtime,
            message,
            invalidReceipt,
          );
        }
        expect(cache.size).toBe(0);
        await rememberProjectVerification(services, runtime, message, receipt);
        await expect(
          buildProjectVerificationContext(services, runtime, message),
        ).resolves.toContain("`nub run test`");
        const [key] = cache.keys();
        if (!key) throw new Error("The verification cache was not written.");
        cache.set(key, {
          check: "nub run test && echo secret",
          completedAt: Date.now(),
        });
        await expect(
          buildProjectVerificationContext(services, runtime, message),
        ).resolves.toBeUndefined();
        cache.set(key, {
          check: "nub run test",
          completedAt: Date.parse("2020-01-01"),
        });
        await expect(
          buildProjectVerificationContext(services, runtime, message),
        ).resolves.toBeUndefined();
      },
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
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
