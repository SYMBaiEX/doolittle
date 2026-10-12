import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BackendManager } from "../../apps/desktop/src/main/backend";
import { handleBotApiRequest } from "../../apps/desktop/src/main/bot-api";
import { BotProcessRegistry } from "../../apps/desktop/src/main/bot-process-registry";
import {
  BotProjectAccessStore,
  permissionsFingerprint,
  projectAccessScope,
} from "../../apps/desktop/src/main/bot-project-access";

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function fixture() {
  const dir = realpathSync(
    mkdtempSync(resolve(tmpdir(), "doolittle-boundary-project-")),
  );
  directories.push(dir);
  const root = resolve(dir, "project");
  mkdirSync(root);
  const backend = {
    getState: () => ({
      phase: "ready",
      url: "http://127.0.0.1:9",
      agentId: "00000000-0000-4000-8000-000000000003",
    }),
    getWorkspaceDirectory: () => dir,
    start: async () => ({ phase: "ready" }),
    stop: async () => undefined,
  } as unknown as BackendManager;
  let name = "Selected project";
  let primaryPath = root;
  const runtimeFetch = vi.fn(async () =>
    Response.json({ project: { id: "project-1", name, primaryPath } }),
  ) as unknown as typeof fetch;
  const makeRegistry = () =>
    new BotProcessRegistry(
      { executable: "nub", args: [], repoRoot: dir },
      dir,
      backend,
      dir,
      { createBackend: () => backend, runtimeFetch },
    );
  const registry = makeRegistry();
  const bot = registry.create({
    name: "Reader",
    persona: "Read this project.",
    model: { provider: "offline", model: "offline" },
  });
  const post = (
    owner: BotProcessRegistry,
    botId: string,
    sessionId: string,
    consent = true,
    confirm?: () => Promise<boolean>,
  ) =>
    handleBotApiRequest(
      owner,
      {
        requestId: sessionId,
        method: "POST",
        path: `/bots/${botId}/conversations`,
        headers: {},
        body: JSON.stringify({ sessionId, projectId: "project-1", consent }),
      },
      confirm,
    );
  return {
    dir,
    root,
    registry,
    bot,
    makeRegistry,
    post,
    setName: (value: string) => {
      name = value;
    },
    setPath: (value: string) => {
      primaryPath = value;
    },
  };
}

describe("native project approval", () => {
  it("does not publish a chat or changed permissions when approval persistence fails", async () => {
    const f = fixture();
    const path = resolve(f.dir, "bots", "project-access.json");
    mkdirSync(path);
    expect(
      (
        await f.post(
          f.registry,
          f.bot.id,
          "write-failed",
          true,
          async () => true,
        )
      )?.status,
    ).toBe(409);
    expect(f.registry.resolveSavedConversationOwner("write-failed")).toBeNull();
    expect(
      (await f.post(f.makeRegistry(), f.bot.id, "write-failed"))?.status,
    ).toBe(403);
    rmSync(path, { recursive: true });
    expect(
      (await f.post(f.registry, f.bot.id, "approved", true, async () => true))
        ?.status,
    ).toBe(201);
    const saved = readFileSync(path, "utf8");
    rmSync(path);
    mkdirSync(path);
    await expect(
      f.registry.update(f.bot.id, { permissions: { allowMutation: true } }),
    ).rejects.toThrow(/private file/iu);
    expect(f.registry.get(f.bot.id).permissions.allowMutation).toBe(false);
    expect(f.makeRegistry().get(f.bot.id).permissions.allowMutation).toBe(
      false,
    );
    rmSync(path, { recursive: true });
    writeFileSync(path, saved, { mode: 0o600 });
    const restarted = f.makeRegistry();
    await restarted.update(f.bot.id, { permissions: { allowMutation: true } });
    expect(
      new BotProjectAccessStore(f.dir).has(
        projectAccessScope(f.bot, { id: "project-1", workspacePath: f.root }),
      ),
    ).toBe(false);
  });
  it("reuses exact approval across new chats and reconstructed registries", async () => {
    const f = fixture();
    const confirm = vi.fn(async () => true);
    expect(
      (await f.post(f.registry, f.bot.id, "first", true, confirm))?.status,
    ).toBe(201);
    expect(
      (await f.post(f.registry, f.bot.id, "second", true, confirm))?.status,
    ).toBe(201);
    const rebuilt = f.makeRegistry();
    expect(
      (await f.post(rebuilt, f.bot.id, "third", true, confirm))?.status,
    ).toBe(201);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(
      rebuilt.resolveConversationWorkspace(f.bot.id, "third").workspacePath,
    ).toBe(f.root);
  });

  it("does not turn historical conversation rows or another bot's grant into consent", async () => {
    const f = fixture();
    f.registry.conversations.bind(f.bot.id, "history", "project-1", f.root);
    expect((await f.post(f.registry, f.bot.id, "fresh"))?.status).toBe(403);
    expect(f.registry.resolveSavedConversationOwner("fresh")).toBeNull();
    expect(
      (await f.post(f.registry, f.bot.id, "approved", true, async () => true))
        ?.status,
    ).toBe(201);
    const other = f.registry.create({
      name: "Other",
      persona: "Separate bot.",
      model: { provider: "offline", model: "offline" },
    });
    expect((await f.post(f.registry, other.id, "other"))?.status).toBe(403);
    expect(f.registry.resolveSavedConversationOwner("other")).toBeNull();
  });

  it("requires explicit consent and rejects cancelled or stale dialogs without binding", async () => {
    const f = fixture();
    expect(
      (await f.post(f.registry, f.bot.id, "no-consent", false))?.status,
    ).toBe(400);
    expect(
      (await f.post(f.registry, f.bot.id, "cancel", true, async () => false))
        ?.status,
    ).toBe(403);
    expect(
      (
        await f.post(f.registry, f.bot.id, "stale", true, async () => {
          f.setName("Renamed");
          return true;
        })
      )?.status,
    ).toBe(409);
    for (const id of ["no-consent", "cancel", "stale"])
      expect(f.registry.resolveSavedConversationOwner(id)).toBeNull();
  });

  it("invalidates reuse when the project root or bot permissions change", async () => {
    const f = fixture();
    expect(
      (await f.post(f.registry, f.bot.id, "initial", true, async () => true))
        ?.status,
    ).toBe(201);
    const replacement = resolve(f.dir, "replacement");
    mkdirSync(replacement);
    f.setPath(replacement);
    expect((await f.post(f.registry, f.bot.id, "changed-root"))?.status).toBe(
      403,
    );
    f.setPath(f.root);
    await f.registry.update(f.bot.id, { permissions: { allowMutation: true } });
    expect(
      (await f.post(f.registry, f.bot.id, "changed-permissions"))?.status,
    ).toBe(403);
  });

  it("fails closed when the same root path is replaced with a new directory", async () => {
    const f = fixture();
    expect(
      (await f.post(f.registry, f.bot.id, "initial", true, async () => true))
        ?.status,
    ).toBe(201);
    renameSync(f.root, resolve(f.dir, "old-project"));
    mkdirSync(f.root);
    expect(
      (await f.post(f.makeRegistry(), f.bot.id, "replacement"))?.status,
    ).toBe(403);
  });

  it("persists mode 0600 and treats corrupted or symlinked store data as untrusted", async () => {
    const f = fixture();
    const scope = projectAccessScope(f.registry.get(f.bot.id), {
      id: "project-1",
      workspacePath: f.root,
    });
    const store = new BotProjectAccessStore(f.dir);
    store.rememberConfirmed(scope);
    const path = resolve(f.dir, "bots", "project-access.json");
    const saved = readFileSync(path, "utf8");
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(new BotProjectAccessStore(f.dir).has(scope)).toBe(true);
    expect(
      new BotProjectAccessStore(f.dir).has({
        ...scope,
        projectId: "other-project",
      }),
    ).toBe(false);
    const permissions = {
      ...f.registry.get(f.bot.id).permissions,
      toolIds: ["one", "two"],
    };
    expect(permissionsFingerprint(permissions)).toBe(
      permissionsFingerprint({
        ...permissions,
        toolIds: ["two", "one", "one"],
      }),
    );
    writeFileSync(path, "{broken");
    expect(new BotProjectAccessStore(f.dir).has(scope)).toBe(false);
    rmSync(path);
    const external = resolve(f.dir, "external.json");
    writeFileSync(external, saved);
    symlinkSync(external, path);
    expect(new BotProjectAccessStore(f.dir).has(scope)).toBe(false);
  });

  it("forgets durable approval after bot permission update or archive", async () => {
    const f = fixture();
    const original = projectAccessScope(f.registry.get(f.bot.id), {
      id: "project-1",
      workspacePath: f.root,
    });
    f.registry.projectAccess.rememberConfirmed(original);
    await f.registry.update(f.bot.id, { permissions: { allowMutation: true } });
    expect(new BotProjectAccessStore(f.dir).has(original)).toBe(false);
    const changed = projectAccessScope(f.registry.get(f.bot.id), {
      id: "project-1",
      workspacePath: f.root,
    });
    f.registry.projectAccess.rememberConfirmed(changed);
    await f.registry.archive(f.bot.id);
    expect(new BotProjectAccessStore(f.dir).has(changed)).toBe(false);
  });
});
