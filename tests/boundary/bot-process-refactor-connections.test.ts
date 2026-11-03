import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import type {
  BackendManager,
  BackendManagerOptions,
} from "../../apps/desktop/src/main/backend";
import {
  BotActivationCancelledError,
  BotProcessRegistry,
  type BotProcessRegistryOptions,
} from "../../apps/desktop/src/main/bot-process-registry";

const directories: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  for (const path of directories.splice(0))
    rmSync(path, { recursive: true, force: true });
});

function fixture(options: BotProcessRegistryOptions = {}) {
  const dir = mkdtempSync(resolve(tmpdir(), "doolittle-bot-connections-"));
  directories.push(dir);
  const backend = {
    getState: () => ({ phase: "ready", url: "http://127.0.0.1:9" }),
    getWorkspaceDirectory: () => dir,
    start: async () => ({ phase: "ready" }),
    stop: async () => undefined,
  } as unknown as BackendManager;
  let workerOptions: BackendManagerOptions | undefined;
  const createBackend = vi.fn(
    (_target, _data, _workspace, _fetch, next: BackendManagerOptions) => {
      workerOptions = next;
      return backend;
    },
  );
  const registry = new BotProcessRegistry(
    {
      executable: "nub",
      args: [],
      repoRoot: dir,
      environment: {
        ELECTRON_RUN_AS_NODE: "1",
        OPENAI_API_KEY: "unscoped-launch-key",
      },
    },
    dir,
    backend,
    dir,
    { ...options, createBackend },
  );
  return { dir, registry, createBackend, workerOptions: () => workerOptions };
}

it.each([
  ["openai", "openai-api", "OPENAI_API_KEY", "ANTHROPIC_API_KEY"],
  ["anthropic", "anthropic-api", "ANTHROPIC_API_KEY", "OPENAI_API_KEY"],
])(
  "activates %s with only the selected worker credential",
  async (provider, accountProvider, key, otherKey) => {
    vi.stubEnv("OPENAI_API_KEY", "unscoped-host-openai");
    vi.stubEnv("ANTHROPIC_API_KEY", "unscoped-host-anthropic");
    vi.stubEnv("NODE_OPTIONS", "--inspect");
    const tokenResolver = vi.fn(async () => "selected-connection-token");
    const f = fixture({ tokenResolver });
    const bot = f.registry.create({
      name: "Scoped worker",
      persona: "Use only the approved account.",
      model: { provider, model: "fixture-model" },
      permissions: { connectionIds: [`${accountProvider}:selected`] },
    });

    await f.registry.activate(bot.id);
    expect(tokenResolver).toHaveBeenCalledWith(accountProvider, "selected");
    const environment = f.workerOptions()?.isolatedEnvironment;
    expect(environment?.[key]).toBe("selected-connection-token");
    expect(environment?.[otherKey]).toBeUndefined();
    expect(environment?.NODE_OPTIONS).toBeUndefined();
    expect(environment?.HOME).toBe(resolve(f.dir, "bots", bot.id));
    expect(environment?.ELIZA_STATE_DIR).toBe(environment?.HOME);
    expect(environment?.ELECTRON_RUN_AS_NODE).toBe("1");
    expect(environment?.DOOLITTLE_BOT_PROFILE).not.toContain(
      "selected-connection-token",
    );
  },
);

it.each([
  { connectionIds: [] },
  { connectionIds: ["anthropic-api:other"] },
  { connectionIds: ["openai-api:first", "openai-api:second"] },
  { connectionIds: ["invalid-account-reference"] },
])(
  "does not create a worker for an ambiguous or invalid account grant %j",
  async ({ connectionIds }) => {
    const tokenResolver = vi.fn(async () => "unused-token");
    const f = fixture({ tokenResolver });
    const bot = f.registry.create({
      name: "Denied worker",
      persona: "Stay stopped without an approved account.",
      model: { provider: "openai", model: "fixture-model" },
      permissions: { connectionIds },
    });
    await expect(f.registry.activate(bot.id)).rejects.toThrow();
    expect(f.createBackend).not.toHaveBeenCalled();
    expect(tokenResolver).not.toHaveBeenCalled();
  },
);

function codexToken(accountId: string): string {
  const payload = Buffer.from(
    JSON.stringify({
      "https://api.openai.com/auth": { chatgpt_account_id: accountId },
    }),
  ).toString("base64url");
  return `fixture.${payload}.signature`;
}

it("keeps native Codex credentials in the host and refreshes only the selected account", async () => {
  const tokenResolver = vi.fn(async () => codexToken("original"));
  const f = fixture({ tokenResolver });
  const bot = f.registry.create({
    name: "Codex worker",
    persona: "Use the host-owned subscription.",
    model: { provider: "codex", model: "fixture-model" },
    permissions: { connectionIds: ["openai-codex:selected"] },
  });
  await f.registry.activate(bot.id);
  const options = f.workerOptions();
  expect(options?.isolatedEnvironment?.OPENAI_API_KEY).toBeUndefined();
  expect(options?.isolatedEnvironment?.ANTHROPIC_API_KEY).toBeUndefined();
  tokenResolver.mockResolvedValue(codexToken("refreshed"));
  const response = await options?.workerHostHandler?.(
    { operation: "codex.auth", payload: null },
    new AbortController().signal,
  );
  expect(response).toMatchObject({ accountId: "refreshed" });
  expect(tokenResolver.mock.calls).toEqual([
    ["openai-codex", "selected"],
    ["openai-codex", "selected"],
  ]);
});

it("rechecks Claude subscription availability before each host invocation", async () => {
  let available = true;
  const invokeClaudeCli = vi.fn();
  const tokenResolver = vi.fn();
  const f = fixture({
    invokeClaudeCli,
    tokenResolver,
    subscriptionStatus: () => [
      {
        provider: "anthropic-subscription",
        accountId: "selected",
        label: "Fixture account",
        configured: true,
        valid: true,
        expiresAt: null,
        source: "claude-code-cli",
        available,
      },
    ],
  });
  const bot = f.registry.create({
    name: "Claude worker",
    persona: "Use the approved CLI account.",
    model: { provider: "claude-code", model: "fixture-model" },
    permissions: { connectionIds: ["anthropic-subscription:selected"] },
  });
  await f.registry.activate(bot.id);
  available = false;
  await expect(
    f
      .workerOptions()
      ?.workerHostHandler?.(
        { operation: "claude.invoke", payload: {} },
        new AbortController().signal,
      ),
  ).rejects.toThrow(/selected Claude Code CLI account is unavailable/);
  expect(invokeClaudeCli).not.toHaveBeenCalled();
  expect(tokenResolver).not.toHaveBeenCalled();
});

it("does not publish a worker when its credential resolves after Stop", async () => {
  let resolveToken: (token: string) => void = () => undefined;
  const token = new Promise<string>((resolvePromise) => {
    resolveToken = resolvePromise;
  });
  const f = fixture({ tokenResolver: () => token });
  const bot = f.registry.create({
    name: "Delayed worker",
    persona: "Respect cancellation while resolving credentials.",
    model: { provider: "openai", model: "fixture-model" },
    permissions: { connectionIds: ["openai-api:selected"] },
  });
  const starting = f.registry.activate(bot.id);
  await f.registry.stop(bot.id);
  resolveToken("late-token");
  await expect(starting).rejects.toBeInstanceOf(BotActivationCancelledError);
  expect(f.createBackend).not.toHaveBeenCalled();
});
