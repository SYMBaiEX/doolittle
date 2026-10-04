import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BackendManager, BackendManagerOptions } from "./backend";
import { handleBotApiRequest } from "./bot-api";
import { BotProcessRegistry } from "./bot-process-registry";

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function fixture(
  options: ConstructorParameters<typeof BotProcessRegistry>[4] = {},
) {
  const directory = mkdtempSync(resolve(tmpdir(), "doolittle-bot-registry-"));
  directories.push(directory);
  const captured: BackendManagerOptions[] = [];
  const backend = {
    getState: () => ({
      phase: "ready",
      url: "http://127.0.0.1:9",
      agentId: "9f21e797-127f-0eba-b547-92f9b113fb1e",
      name: "Doolittle",
    }),
    getWorkspaceDirectory: () => directory,
    start: async () => ({ phase: "ready" }),
    stop: async () => undefined,
  } as unknown as BackendManager;
  const registry = new BotProcessRegistry(
    { executable: "nub", args: [], repoRoot: directory },
    directory,
    backend,
    directory,
    {
      ...options,
      createBackend: (_target, _dataDir, _workspace, _fetch, workerOptions) => {
        captured.push(workerOptions);
        return backend;
      },
    },
  );
  return { registry, captured, directory };
}

function jwt(accountId: string): string {
  const payload = Buffer.from(
    JSON.stringify({
      "https://api.openai.com/auth": { chatgpt_account_id: accountId },
    }),
  ).toString("base64url");
  return `header.${payload}.signature`;
}

describe("named bot native host grants", () => {
  it("refreshes only the selected Codex account on every host call", async () => {
    const tokenResolver = vi.fn(async () => jwt("chatgpt-account-1"));
    const { registry, captured } = fixture({ tokenResolver });
    const bot = registry.create({
      name: "Code",
      persona: "Code carefully.",
      model: { provider: "codex", model: "gpt-5.5" },
      permissions: { connectionIds: ["openai-codex:account-one"] },
    });
    await registry.activate(bot.id);
    expect(captured[0]?.isolatedEnvironment?.OPENAI_API_KEY).toBeUndefined();
    expect(captured[0]?.isolatedEnvironment?.DOOLITTLE_BOT_PROFILE).toContain(
      bot.id,
    );
    const handler = captured[0]?.workerHostHandler;
    expect(handler).toBeDefined();
    expect(
      await handler?.(
        { operation: "codex.auth", payload: null },
        new AbortController().signal,
      ),
    ).toEqual({
      accessToken: jwt("chatgpt-account-1"),
      accountId: "chatgpt-account-1",
    });
    expect(tokenResolver).toHaveBeenCalledWith("openai-codex", "account-one");
    expect(tokenResolver).toHaveBeenCalledTimes(2);
    await expect(
      handler?.(
        { operation: "claude.invoke", payload: {} },
        new AbortController().signal,
      ),
    ).rejects.toThrow(/not approved/i);
  });

  it("fails closed if a Codex token lacks an account id", async () => {
    const { registry } = fixture({ tokenResolver: async () => "bad-token" });
    const bot = registry.create({
      name: "Code",
      persona: "Code carefully.",
      model: { provider: "codex", model: "gpt-5.5" },
      permissions: { connectionIds: ["openai-codex:account-one"] },
    });
    await expect(registry.activate(bot.id)).rejects.toThrow(
      /Codex account is unavailable/i,
    );
  });

  it("binds Claude CLI calls to a real synthetic CLI account and configured model", async () => {
    const invokeClaudeCli = vi.fn(async () => "approved reply");
    const { registry, captured } = fixture({
      invokeClaudeCli,
      subscriptionStatus: () => [
        {
          provider: "anthropic-subscription",
          accountId: "claude-code-cli",
          label: "Claude Code CLI",
          configured: true,
          valid: true,
          expiresAt: null,
          source: "claude-code-cli",
        },
      ],
    });
    const bot = registry.create({
      name: "Writer",
      persona: "Write clearly.",
      model: { provider: "claude-code", model: "claude-sonnet-4.6" },
      permissions: {
        connectionIds: ["anthropic-subscription:claude-code-cli"],
      },
    });
    await registry.activate(bot.id);
    const handler = captured[0]?.workerHostHandler;
    await expect(
      handler?.(
        {
          operation: "claude.invoke",
          payload: { prompt: "Hello", model: "opus" },
        },
        new AbortController().signal,
      ),
    ).rejects.toThrow(/Invalid Claude request/i);
    expect(
      await handler?.(
        {
          operation: "claude.invoke",
          payload: { prompt: "Hello", model: "sonnet" },
        },
        new AbortController().signal,
      ),
    ).toBe("approved reply");
    expect(invokeClaudeCli).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: "Hello", model: "sonnet" }),
    );
  });
});

describe("global run ownership", () => {
  it("derives active counts from runtime receipts, not attached observers", async () => {
    let status = "thinking";
    const runtimeFetch = vi.fn(async () =>
      Response.json({
        runs: [{ runId: "run-1", status }],
      }),
    ) as unknown as typeof fetch;
    const { registry } = fixture({ runtimeFetch });
    registry.beginRun("default", "observer-only");
    await registry.refreshActiveRuns();
    expect(registry.list().bots[0]).toMatchObject({
      activeRunCount: 1,
      state: "busy",
    });
    registry.endRun("default", "run-1");
    await registry.refreshActiveRuns();
    expect(registry.list().bots[0]?.activeRunCount).toBe(1);
    status = "complete";
    await registry.refreshActiveRuns();
    expect(registry.list().bots[0]).toMatchObject({
      activeRunCount: 0,
      state: "ready",
    });
  });

  it("does not return a falsely idle catalog when receipt reconciliation fails", async () => {
    const { registry } = fixture({
      runtimeFetch: vi.fn(async () => {
        throw new Error("runtime disconnected");
      }) as unknown as typeof fetch,
    });
    const response = await handleBotApiRequest(registry, {
      requestId: "request-1",
      path: "/bots",
      method: "GET",
      headers: {},
    });
    expect(response?.status).toBe(503);
    expect(JSON.parse(response?.body ?? "null").code).toBe(
      "bot_status_unavailable",
    );
  });

  it("rejects a duplicate run id under a different bot even with separate workers", () => {
    const { registry } = fixture();
    const one = registry.create({
      name: "One",
      persona: "First.",
      model: { provider: "offline", model: "offline" },
    });
    const two = registry.create({
      name: "Two",
      persona: "Second.",
      model: { provider: "offline", model: "offline" },
    });
    registry.bindConversation(one.id, "session-1", "project-1");
    registry.bindConversation(two.id, "session-2", "project-2");
    registry.bindRun(one.id, "session-1", "run-1");
    expect(() => registry.bindRun(two.id, "session-2", "run-1")).toThrow(
      /different bot|different.*conversation/i,
    );
    expect(registry.conversations.getRun("run-1")).toMatchObject({
      botId: one.id,
      sessionId: "session-1",
      projectId: "project-1",
    });
  });

  it("adopts a legacy lead run only from its canonical receipt and session summary", async () => {
    const runtimeFetch = vi.fn(async (url: string | URL | Request) =>
      String(url).includes("/sessions/summary")
        ? Response.json({
            summary: {
              sessionId: "legacy-session",
              projectId: "project-1",
              messageCount: 2,
            },
          })
        : Response.json({
            run: { runId: "legacy-run", sessionId: "legacy-session" },
          }),
    ) as unknown as typeof fetch;
    const { registry } = fixture({ runtimeFetch });
    await registry.assertRunOwner("default", "legacy-run");
    expect(registry.conversations.getRun("legacy-run")).toMatchObject({
      botId: "9f21e797-127f-0eba-b547-92f9b113fb1e",
      sessionId: "legacy-session",
      projectId: "project-1",
    });
    expect(runtimeFetch).toHaveBeenCalledTimes(2);
    await registry.assertRunOwner("default", "legacy-run");
    expect(runtimeFetch).toHaveBeenCalledTimes(2);
  });

  it("refuses a legacy run when the receipt does not match the requested id", async () => {
    const runtimeFetch = vi.fn(async () =>
      Response.json({
        run: { runId: "other-run", sessionId: "legacy-session" },
      }),
    ) as unknown as typeof fetch;
    const { registry } = fixture({ runtimeFetch });
    await expect(
      registry.assertRunOwner("default", "legacy-run"),
    ).rejects.toThrow(/receipt is invalid/i);
    expect(registry.conversations.getRun("legacy-run")).toBeNull();
  });
});
