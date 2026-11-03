import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SandboxManagerConfig } from "@elizaos/agent/services/sandbox-manager";
import { afterEach, expect, it, vi } from "vitest";
import { LocalSandboxService } from "../../packages/plugins/doolittle-plugin/local-sandbox/service";
import {
  SANDBOX_OWNER_LOCK_SUFFIX,
  type SandboxManagerLike,
} from "../../packages/plugins/doolittle-plugin/local-sandbox/types";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "doolittle-sandbox-ownership-"));
  roots.push(root);
  const rootDir = join(root, "sandboxes");
  return { rootDir, lockPath: `${rootDir}${SANDBOX_OWNER_LOCK_SUFFIX}` };
}

type StopFailure = "throw" | "error-event" | "container-remains";
function fakeManager(failure?: StopFailure) {
  const events: ReturnType<SandboxManagerLike["getEventLog"]> = [];
  const status: ReturnType<SandboxManagerLike["getStatus"]> = {
    state: "uninitialized",
    mode: "standard",
    containerId: null,
    browserContainerId: null,
  };
  return {
    getContainerWorkspacePath: vi.fn((path: string) => path),
    getEventLog: vi.fn(() => events),
    getStatus: vi.fn(() => ({ ...status })),
    start: vi.fn(async () => {
      status.state = "ready";
      status.containerId = "fake-container";
    }),
    stop: vi.fn(async () => {
      if (failure === "throw") throw new Error("Cleanup transport failed");
      status.state = "stopped";
      status.containerId =
        failure === "container-remains" ? "fake-container" : null;
      if (failure === "error-event")
        events.push({ timestamp: 1, type: "error", detail: "Cleanup failed" });
    }),
  } satisfies SandboxManagerLike;
}

function serviceOptions(
  rootDir: string,
  managerFactory: (config: SandboxManagerConfig) => SandboxManagerLike,
) {
  return {
    rootDir,
    containerPrefix: "test-sandbox",
    processId: 41001,
    nonceFactory: () => "owner-nonce",
    isProcessAlive: (pid: number) => pid === 41001,
    managerFactory,
  };
}

it("rejects a second live owner before cleanup touches its workspace", async () => {
  const { rootDir, lockPath } = fixture();
  const firstFactory = vi.fn(() => fakeManager());
  const service = await LocalSandboxService.start(
    undefined,
    serviceOptions(rootDir, firstFactory),
  );
  const protectedFile = join(rootDir, "keep.txt");
  writeFileSync(protectedFile, "owned work");
  const secondFactory = vi.fn(() => fakeManager());
  await expect(
    LocalSandboxService.start(undefined, {
      ...serviceOptions(rootDir, secondFactory),
      processId: 41002,
      nonceFactory: () => "second-nonce",
    }),
  ).rejects.toMatchObject({
    code: "SANDBOX_OWNERSHIP_CONFLICT",
    ownerPid: 41001,
    lockPath,
  });
  expect(secondFactory).not.toHaveBeenCalled();
  expect(readFileSync(protectedFile, "utf8")).toBe("owned work");
  expect(readFileSync(lockPath, "utf8")).toBe("41001\nowner-nonce\n");
  await service.stop();
  expect(existsSync(lockPath)).toBe(false);
});

it("recovers a stale owner before verified orphan cleanup and removes its recovery lock", async () => {
  const { rootDir, lockPath } = fixture();
  mkdirSync(rootDir);
  const orphanFile = join(rootDir, "orphan.txt");
  writeFileSync(orphanFile, "orphan");
  writeFileSync(lockPath, "41000\nstale-nonce\n");
  const manager = fakeManager();
  const start = manager.start.getMockImplementation();
  manager.start.mockImplementation(async () => {
    expect(readFileSync(lockPath, "utf8")).toBe("41001\nowner-nonce\n");
    await start?.();
  });
  const factory = vi.fn(() => manager);
  const service = await LocalSandboxService.start(
    undefined,
    serviceOptions(rootDir, factory),
  );
  expect(factory).toHaveBeenCalledWith({
    mode: "standard",
    image: "eliza-sandbox:bookworm-slim",
    containerPrefix: "test-sandbox",
    readOnlyRoot: true,
    workspaceRoot: rootDir,
  });
  expect(manager.stop).toHaveBeenCalledOnce();
  expect(existsSync(orphanFile)).toBe(false);
  expect(existsSync(rootDir)).toBe(true);
  expect(existsSync(`${lockPath}.recovery`)).toBe(false);
  await service.stop();
  expect(existsSync(lockPath)).toBe(false);
});

it.each<StopFailure>(["throw", "error-event", "container-remains"])(
  "retains ownership and workspace after %s cleanup, then retries through a recovery manager",
  async (failure) => {
    const { rootDir, lockPath } = fixture();
    const cleanupManager = fakeManager();
    const sandboxManager = fakeManager(failure);
    const recoveryManager = fakeManager();
    const managers = [cleanupManager, sandboxManager, recoveryManager];
    const factory = vi.fn((_config: SandboxManagerConfig) => {
      const manager = managers.shift();
      if (!manager) throw new Error("Unexpected sandbox manager creation");
      return manager;
    });
    const service = await LocalSandboxService.start(
      undefined,
      serviceOptions(rootDir, factory),
    );
    const sandboxId = await service.createSandbox();
    const workspace = join(rootDir, sandboxId);
    writeFileSync(join(workspace, "retained.txt"), "work");
    await expect(service.stop()).rejects.toMatchObject({
      name: "AggregateError",
      message: "Failed to stop all local sandboxes",
    });
    expect(readFileSync(lockPath, "utf8")).toBe("41001\nowner-nonce\n");
    expect(readFileSync(join(workspace, "retained.txt"), "utf8")).toBe("work");
    expect(service.listSandboxes().map((record) => record.id)).toEqual([
      sandboxId,
    ]);
    expect(service.getActiveSandboxId()).toBeUndefined();
    await expect(service.createSandbox()).rejects.toMatchObject({
      code: "SANDBOX_OWNERSHIP_CONFLICT",
    });
    await service.stop();
    expect(factory.mock.calls[2]?.[0]).toEqual(factory.mock.calls[1]?.[0]);
    expect(sandboxManager.stop).toHaveBeenCalledOnce();
    expect(recoveryManager.start).toHaveBeenCalledOnce();
    expect(recoveryManager.stop).toHaveBeenCalledOnce();
    expect(existsSync(workspace)).toBe(false);
    expect(existsSync(lockPath)).toBe(false);
    expect(service.listSandboxes()).toEqual([]);
  },
);

it("refuses to release a replacement owner with the same PID but a different nonce", async () => {
  const { rootDir, lockPath } = fixture();
  const service = await LocalSandboxService.start(
    undefined,
    serviceOptions(rootDir, () => fakeManager()),
  );
  writeFileSync(lockPath, "41001\nreplacement-nonce\n");
  await expect(service.stop()).rejects.toMatchObject({
    code: "SANDBOX_OWNERSHIP_CONFLICT",
    ownerPid: 41001,
  });
  expect(readFileSync(lockPath, "utf8")).toBe("41001\nreplacement-nonce\n");
  writeFileSync(lockPath, "41001\nowner-nonce\n");
  await service.stop();
  expect(existsSync(lockPath)).toBe(false);
});

it("preserves malformed ownership records rather than attempting unsafe cleanup", async () => {
  const { rootDir, lockPath } = fixture();
  writeFileSync(lockPath, "not an owner record");
  const factory = vi.fn(() => fakeManager());
  await expect(
    LocalSandboxService.start(undefined, serviceOptions(rootDir, factory)),
  ).rejects.toMatchObject({
    code: "SANDBOX_OWNERSHIP_CONFLICT",
    message: expect.stringContaining("refusing unsafe recovery"),
  });
  expect(readFileSync(lockPath, "utf8")).toBe("not an owner record");
  expect(factory).not.toHaveBeenCalled();
});

it("preserves a competing recovery lease instead of claiming the stale owner lock", async () => {
  const { rootDir, lockPath } = fixture();
  writeFileSync(lockPath, "41000\nstale-nonce\n");
  writeFileSync(`${lockPath}.recovery`, "41002\nrecovering-nonce\n");
  const factory = vi.fn(() => fakeManager());
  await expect(
    LocalSandboxService.start(undefined, serviceOptions(rootDir, factory)),
  ).rejects.toMatchObject({
    code: "SANDBOX_OWNERSHIP_CONFLICT",
    lockPath: `${lockPath}.recovery`,
  });
  expect(readFileSync(lockPath, "utf8")).toBe("41000\nstale-nonce\n");
  expect(readFileSync(`${lockPath}.recovery`, "utf8")).toBe(
    "41002\nrecovering-nonce\n",
  );
  expect(factory).not.toHaveBeenCalled();
});
