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
import type {
  SandboxEvent,
  SandboxManagerConfig,
} from "@elizaos/agent/services/sandbox-manager";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runShell = vi.hoisted(() => vi.fn());

vi.mock("@elizaos/agent/services/shell-execution-router", () => ({
  runShell,
}));

import { LocalSandboxService } from "./service";
import type { SandboxManagerLike } from "./types";
import {
  SANDBOX_OWNER_LOCK_SUFFIX,
  SandboxCleanupVerificationError,
  SandboxClosingError,
  SandboxNotFoundError,
  SandboxOwnershipError,
  UnsupportedSandboxTemplateError,
} from "./types";

interface FakeManager extends SandboxManagerLike {
  config: SandboxManagerConfig;
  events: SandboxEvent[];
  containerId: string | null;
  browserContainerId: string | null;
}

interface FakeStopOutcome {
  cleanupError?: string;
  retainContainer?: boolean;
}

const roots: string[] = [];

function createFixture(
  startHook?: (config: SandboxManagerConfig, index: number) => Promise<void>,
  stopHook?: (
    config: SandboxManagerConfig,
    index: number,
  ) => Promise<FakeStopOutcome | undefined>,
) {
  const rootDir = mkdtempSync(join(tmpdir(), "doolittle-e2b-test-"));
  roots.push(rootDir);
  const containerPrefix = `doolittle-e2b-test-${crypto.randomUUID()}`;
  const managers: FakeManager[] = [];
  const managerFactory = (config: SandboxManagerConfig): FakeManager => {
    const index = managers.length;
    const manager: FakeManager = {
      config,
      events: [],
      containerId: null,
      browserContainerId: null,
      getContainerWorkspacePath: vi.fn((hostPath: string) =>
        hostPath === config.workspaceRoot ? "/workspace" : null,
      ),
      getEventLog: vi.fn(() => [...manager.events]),
      getStatus: vi.fn(() => ({
        state: "ready" as const,
        mode: "standard" as const,
        containerId: manager.containerId,
        browserContainerId: manager.browserContainerId,
      })),
      start: vi.fn(async () => {
        await startHook?.(config, index);
        manager.containerId = `container-${index}`;
      }),
      stop: vi.fn(async () => {
        const outcome = await stopHook?.(config, index);
        if (outcome?.cleanupError) {
          manager.events.push({
            timestamp: Date.now(),
            type: "error",
            detail: outcome.cleanupError,
          });
        }
        if (!outcome?.retainContainer) {
          manager.containerId = null;
          manager.browserContainerId = null;
        }
      }),
    };
    managers.push(manager);
    return manager;
  };
  return { rootDir, containerPrefix, managers, managerFactory };
}

async function startFixture(fixture = createFixture()) {
  const service = await LocalSandboxService.start(undefined, fixture);
  return { ...fixture, service };
}

function ownerRecord(pid: number, nonce: string): string {
  return `${pid}\n${nonce}\n`;
}

function readOwnerRecord(lockPath: string): { pid: number; nonce: string } {
  const [pid, nonce, trailing] = readFileSync(lockPath, "utf8").split("\n");
  expect(trailing).toBe("");
  return { pid: Number(pid), nonce: nonce ?? "" };
}

describe("local sandbox service", () => {
  beforeEach(() => {
    runShell.mockReset();
    runShell.mockResolvedValue({
      exitCode: 0,
      stdout: "ok\n",
      stderr: "",
      durationMs: 1,
      sandbox: "docker",
    });
  });

  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
      rmSync(`${root}${SANDBOX_OWNER_LOCK_SUFFIX}`, { force: true });
      rmSync(`${root}${SANDBOX_OWNER_LOCK_SUFFIX}.recovery`, { force: true });
    }
  });

  it("rejects a second live service owner for the same root", async () => {
    const fixture = createFixture();
    const first = await startFixture(fixture);

    await expect(
      LocalSandboxService.start(undefined, fixture),
    ).rejects.toBeInstanceOf(SandboxOwnershipError);
    expect(fixture.managers).toHaveLength(1);

    await first.service.stop();
  });

  it("recovers a stale owner lock before cleanup", async () => {
    const fixture = createFixture();
    const lockPath = `${fixture.rootDir}${SANDBOX_OWNER_LOCK_SUFFIX}`;
    writeFileSync(lockPath, ownerRecord(4242, "stale"));

    const service = await LocalSandboxService.start(undefined, {
      ...fixture,
      processId: 7331,
      nonceFactory: () => "fresh-nonce",
      isProcessAlive: () => false,
    });

    expect(readOwnerRecord(lockPath)).toEqual({
      pid: 7331,
      nonce: "fresh-nonce",
    });
    await service.stop();
    expect(existsSync(lockPath)).toBe(false);
  });

  it("releases ownership when startup cleanup fails", async () => {
    const fixture = createFixture(async (_config, index) => {
      if (index === 0) throw new Error("cleanup start failed");
    });
    const lockPath = `${fixture.rootDir}${SANDBOX_OWNER_LOCK_SUFFIX}`;

    await expect(startFixture(fixture)).rejects.toThrow("cleanup start failed");
    expect(existsSync(lockPath)).toBe(false);
  });

  it("releases ownership only after a successful service stop", async () => {
    const fixture = createFixture();
    const lockPath = `${fixture.rootDir}${SANDBOX_OWNER_LOCK_SUFFIX}`;
    const { service } = await startFixture(fixture);

    expect(existsSync(lockPath)).toBe(true);
    await service.stop();
    expect(existsSync(lockPath)).toBe(false);
    await expect(service.createSandbox()).rejects.toBeInstanceOf(
      SandboxOwnershipError,
    );
  });

  it("never releases an ownership nonce it does not own", async () => {
    const fixture = createFixture();
    const lockPath = `${fixture.rootDir}${SANDBOX_OWNER_LOCK_SUFFIX}`;
    const service = await LocalSandboxService.start(undefined, {
      ...fixture,
      processId: 7331,
      nonceFactory: () => "owned-nonce",
    });
    const replacement = { pid: 8442, nonce: "replacement-nonce" };
    writeFileSync(lockPath, ownerRecord(replacement.pid, replacement.nonce));

    await expect(service.stop()).rejects.toBeInstanceOf(SandboxOwnershipError);
    expect(readOwnerRecord(lockPath)).toEqual(replacement);
  });

  it("fails closed on malformed ownership text", async () => {
    const fixture = createFixture();
    const lockPath = `${fixture.rootDir}${SANDBOX_OWNER_LOCK_SUFFIX}`;
    writeFileSync(lockPath, "not-a-pid\nstale\n");

    await expect(startFixture(fixture)).rejects.toBeInstanceOf(
      SandboxOwnershipError,
    );
    expect(readFileSync(lockPath, "utf8")).toBe("not-a-pid\nstale\n");
    expect(fixture.managers).toHaveLength(0);
  });

  it("derives isolated manager namespaces for distinct roots", async () => {
    const firstFixture = createFixture();
    const secondFixture = createFixture();
    const first = await LocalSandboxService.start(undefined, {
      rootDir: firstFixture.rootDir,
      managerFactory: firstFixture.managerFactory,
    });
    const second = await LocalSandboxService.start(undefined, {
      rootDir: secondFixture.rootDir,
      managerFactory: secondFixture.managerFactory,
    });
    const firstPrefix = firstFixture.managers[0]?.config.containerPrefix;
    const secondPrefix = secondFixture.managers[0]?.config.containerPrefix;

    expect(firstPrefix).toMatch(/^doolittle-e2b-[a-f0-9]{24}$/);
    expect(secondPrefix).toMatch(/^doolittle-e2b-[a-f0-9]{24}$/);
    expect(firstPrefix).not.toBe(secondPrefix);

    await first.stop();
    await second.stop();
  });

  it("cleans startup orphans through a stable official-manager lifecycle", async () => {
    const fixture = createFixture();
    const staleRoot = join(fixture.rootDir, "stale-sandbox");
    mkdirSync(staleRoot, { recursive: true });
    writeFileSync(join(staleRoot, "stale.txt"), "stale");

    const { service, managers } = await startFixture(fixture);

    expect(managers).toHaveLength(1);
    expect(managers[0]?.config).toMatchObject({
      containerPrefix: fixture.containerPrefix,
      workspaceRoot: fixture.rootDir,
      image: "eliza-sandbox:bookworm-slim",
      mode: "standard",
      readOnlyRoot: true,
    });
    expect(managers[0]?.start).toHaveBeenCalledOnce();
    expect(managers[0]?.stop).toHaveBeenCalledOnce();
    expect(existsSync(staleRoot)).toBe(false);

    await service.stop();
  });

  it("uses distinct managers and workspace roots for each sandbox", async () => {
    const { service, managers, containerPrefix } = await startFixture();
    const first = await service.createSandbox({ metadata: { owner: "a" } });
    const second = await service.createSandbox({ template: "python" });
    const records = service.listSandboxes();

    expect(managers).toHaveLength(3);
    expect(managers[1]).not.toBe(managers[2]);
    expect(managers[1]?.config.workspaceRoot).toBe(records[0]?.path);
    expect(managers[2]?.config.workspaceRoot).toBe(records[1]?.path);
    expect(records.map((record) => record.template)).toEqual([
      "node-js",
      "python",
    ]);
    expect(records[0]?.metadata).toEqual({ owner: "a" });
    expect(managers[1]?.config.env).toBeUndefined();
    expect(managers.slice(1).map((manager) => manager.config.image)).toEqual([
      "eliza-sandbox:bookworm-slim",
      "eliza-sandbox:bookworm-slim",
    ]);
    expect(managers[1]?.config.containerPrefix).toBe(
      `${containerPrefix}-${first}`,
    );
    expect(managers[2]?.config.containerPrefix).toBe(
      `${containerPrefix}-${second}`,
    );
    expect(service.getActiveSandboxId()).toBe(second);

    await service.stop();
  });

  it("targets a selected sandbox and preserves legacy active execution", async () => {
    const { service, managers } = await startFixture();
    const first = await service.createSandbox();
    const second = await service.createSandbox({ template: "python" });

    const selected = await service.executeCode(
      "console.log('a')",
      "javascript",
      first,
    );
    const active = await service.executeCode("print('b')", "python");

    expect(runShell).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        command: "node",
        args: ["-e", "console.log('a')"],
        cwd: "/workspace",
        env: expect.objectContaining({ XDG_CACHE_HOME: "/workspace/.cache" }),
      }),
      expect.objectContaining({ sandboxManager: managers[1] }),
    );
    expect(runShell).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ command: "python3" }),
      expect.objectContaining({ sandboxManager: managers[2] }),
    );
    expect(selected.sandboxId).toBe(first);
    expect(active.sandboxId).toBe(second);
    expect(second).not.toBe(first);

    await service.stop();
  });

  it("auto-creates one active sandbox for legacy no-ID execution", async () => {
    const { service, managers } = await startFixture();

    const first = await service.executeCode("print('a')");
    const second = await service.executeCode("print('b')");

    expect(first.sandboxId).toBe(second.sandboxId);
    expect(service.listSandboxes()).toHaveLength(1);
    expect(managers).toHaveLength(2);

    await service.stop();
  });

  it("does not reactivate an older sandbox after killing the active one", async () => {
    const { service } = await startFixture();
    const first = await service.createSandbox();
    const second = await service.createSandbox({ template: "python" });

    await service.killSandbox(second);
    expect(service.getActiveSandboxId()).toBeUndefined();
    expect(service.listSandboxes().map((sandbox) => sandbox.id)).toEqual([
      first,
    ]);

    const created = await service.executeCode("print('new default')");
    expect(created.sandboxId).not.toBe(first);
    expect(created.sandboxId).not.toBe(second);
    expect(service.getActiveSandboxId()).toBe(created.sandboxId);

    await service.stop();
  });

  it("waits for an auto-created manager before concurrent execution", async () => {
    let releaseStart!: () => void;
    const startBlocked = new Promise<void>((resolve) => {
      releaseStart = resolve;
    });
    const fixture = createFixture(async (_config, index) => {
      if (index === 1) await startBlocked;
    });
    const { service } = await startFixture(fixture);

    const first = service.executeCode("print('a')");
    const second = service.executeCode("print('b')");
    expect(runShell).not.toHaveBeenCalled();
    releaseStart();
    const results = await Promise.all([first, second]);

    expect(new Set(results.map((result) => result.sandboxId)).size).toBe(1);
    expect(service.listSandboxes()).toHaveLength(1);
    await service.stop();
  });

  it("rejects unknown IDs for execute and kill", async () => {
    const { service } = await startFixture();

    await expect(
      service.executeCode("print('no')", "python", "missing"),
    ).rejects.toBeInstanceOf(SandboxNotFoundError);
    await expect(service.killSandbox("missing")).rejects.toBeInstanceOf(
      SandboxNotFoundError,
    );

    await service.stop();
  });

  it("rejects unsupported templates before creating resources", async () => {
    const { service, managers, rootDir } = await startFixture();

    await expect(
      service.createSandbox({ template: "ruby" }),
    ).rejects.toBeInstanceOf(UnsupportedSandboxTemplateError);
    expect(managers).toHaveLength(1);
    expect(service.listSandboxes()).toEqual([]);
    expect(existsSync(rootDir)).toBe(true);

    await service.stop();
  });

  it("stops a partially started manager before removing its workspace", async () => {
    const fixture = createFixture(async (_config, index) => {
      if (index === 1) throw new Error("start failed");
    });
    const { service, managers } = await startFixture(fixture);

    await expect(service.createSandbox()).rejects.toThrow("start failed");
    expect(managers[1]?.stop).toHaveBeenCalledOnce();
    expect(service.listSandboxes()).toEqual([]);

    await service.stop();
  });

  it("waits for execution before stopping and removing a sandbox", async () => {
    let releaseExecution!: () => void;
    const executionBlocked = new Promise<void>((resolve) => {
      releaseExecution = resolve;
    });
    runShell.mockImplementation(async () => {
      await executionBlocked;
      return {
        exitCode: 0,
        stdout: "done\n",
        stderr: "",
        durationMs: 1,
        sandbox: "docker",
      };
    });
    const { service, managers } = await startFixture();
    const id = await service.createSandbox();
    const path = service.listSandboxes()[0]?.path ?? "";

    const execution = service.executeCode("print('wait')", "python", id);
    await vi.waitFor(() => expect(runShell).toHaveBeenCalledOnce());
    const killing = service.killSandbox(id);

    expect(managers[1]?.stop).not.toHaveBeenCalled();
    expect(existsSync(path)).toBe(true);
    releaseExecution();
    await execution;
    await killing;
    expect(managers[1]?.stop).toHaveBeenCalledOnce();
    expect(existsSync(path)).toBe(false);

    await service.stop();
  });

  it("retains workspace and ownership when stop fails, then retries", async () => {
    const { service, managers, rootDir } = await startFixture();
    await service.createSandbox();
    const path = service.listSandboxes()[0]?.path ?? "";
    const lockPath = `${rootDir}${SANDBOX_OWNER_LOCK_SUFFIX}`;
    const manager = managers[1];
    if (!manager) throw new Error("expected sandbox manager");
    vi.mocked(manager.stop).mockRejectedValueOnce(new Error("stop failed"));

    await expect(service.stop()).rejects.toThrow(
      "Failed to stop all local sandboxes",
    );
    expect(existsSync(path)).toBe(true);
    expect(existsSync(lockPath)).toBe(true);
    expect(service.getActiveSandboxId()).toBeUndefined();
    await expect(service.stop()).resolves.toBeUndefined();
    expect(existsSync(path)).toBe(false);
    expect(existsSync(lockPath)).toBe(false);
  });

  it("rejects an official-style false-success stop and recovers fresh", async () => {
    let reportFalseSuccess = true;
    const fixture = createFixture(undefined, async (_config, index) => {
      if (index === 1 && reportFalseSuccess) {
        return {
          cleanupError: "Sandbox stop error: engine unavailable",
          retainContainer: true,
        };
      }
      return undefined;
    });
    const { service, managers } = await startFixture(fixture);
    const id = await service.createSandbox();
    const record = service.listSandboxes()[0];
    if (!record) throw new Error("expected sandbox record");
    const lockPath = `${fixture.rootDir}${SANDBOX_OWNER_LOCK_SUFFIX}`;

    await expect(service.killSandbox(id)).rejects.toBeInstanceOf(
      SandboxCleanupVerificationError,
    );
    expect(managers[1]?.containerId).not.toBeNull();
    expect(existsSync(record.path)).toBe(true);
    expect(existsSync(lockPath)).toBe(true);
    expect(service.listSandboxes()).toEqual([record]);
    await expect(
      service.executeCode("print('must not run')", "python", id),
    ).rejects.toBeInstanceOf(SandboxClosingError);

    reportFalseSuccess = false;
    await service.stop();
    expect(managers).toHaveLength(3);
    expect(managers[2]?.config.containerPrefix).toBe(
      managers[1]?.config.containerPrefix,
    );
    expect(managers[2]?.config.workspaceRoot).toBe(
      managers[1]?.config.workspaceRoot,
    );
    expect(managers[2]?.start).toHaveBeenCalledOnce();
    expect(managers[2]?.stop).toHaveBeenCalledOnce();
    expect(existsSync(record.path)).toBe(false);
    expect(existsSync(lockPath)).toBe(false);
  });

  it("retains ownership when a fresh recovery manager cannot start", async () => {
    let failRecoveryStart = true;
    const fixture = createFixture(
      async (_config, index) => {
        if (index === 2 && failRecoveryStart) {
          failRecoveryStart = false;
          throw new Error("recovery start failed");
        }
      },
      async (_config, index) =>
        index === 1
          ? {
              cleanupError: "Sandbox stop error: engine unavailable",
              retainContainer: true,
            }
          : undefined,
    );
    const { service, managers } = await startFixture(fixture);
    const id = await service.createSandbox();
    const record = service.listSandboxes()[0];
    if (!record) throw new Error("expected sandbox record");
    const lockPath = `${fixture.rootDir}${SANDBOX_OWNER_LOCK_SUFFIX}`;

    await expect(service.killSandbox(id)).rejects.toBeInstanceOf(
      SandboxCleanupVerificationError,
    );
    await expect(service.killSandbox(id)).rejects.toThrow(
      "recovery start failed",
    );
    expect(managers[2]?.stop).not.toHaveBeenCalled();
    expect(existsSync(record.path)).toBe(true);
    expect(existsSync(lockPath)).toBe(true);
    expect(service.listSandboxes()).toEqual([record]);

    await service.stop();
    expect(managers).toHaveLength(4);
    expect(managers[3]?.start).toHaveBeenCalledOnce();
    expect(managers[3]?.stop).toHaveBeenCalledOnce();
    expect(existsSync(record.path)).toBe(false);
    expect(existsSync(lockPath)).toBe(false);
  });

  it("keeps a dual-failure handle non-executable until explicit retry", async () => {
    let allowStop = false;
    const fixture = createFixture(
      async (_config, index) => {
        if (index === 1) throw new Error("start failed");
      },
      async (_config, index) => {
        if (index === 1 && !allowStop) throw new Error("stop failed");
      },
    );
    const { service } = await startFixture(fixture);
    const lockPath = `${fixture.rootDir}${SANDBOX_OWNER_LOCK_SUFFIX}`;

    await expect(service.createSandbox()).rejects.toThrow(
      "Failed to start or clean up sandbox",
    );
    const failedId = service.listSandboxes()[0]?.id;
    if (!failedId) throw new Error("expected retained failed sandbox");
    expect(service.getActiveSandboxId()).toBeUndefined();
    expect(existsSync(lockPath)).toBe(true);
    await expect(
      service.executeCode("print('must not run')", "python", failedId),
    ).rejects.toBeInstanceOf(SandboxClosingError);
    expect(runShell).not.toHaveBeenCalled();

    allowStop = true;
    await service.killSandbox(failedId);
    await service.stop();
    expect(existsSync(lockPath)).toBe(false);
  });

  it("stops every live manager and preserves command failure shapes", async () => {
    runShell.mockResolvedValue({
      exitCode: 1,
      stdout: "",
      stderr: "command failed\n",
      durationMs: 1,
      sandbox: "docker",
    });
    const { service, managers } = await startFixture();
    const first = await service.createSandbox();
    await service.createSandbox({ template: "python" });

    await expect(
      service.executeCode("exit 1", "bash", first),
    ).resolves.toMatchObject({
      success: false,
      text: "command failed",
      error: { value: "command failed", traceback: "command failed" },
      sandboxId: first,
    });
    await service.stop();

    expect(managers[1]?.stop).toHaveBeenCalledOnce();
    expect(managers[2]?.stop).toHaveBeenCalledOnce();
    expect(service.listSandboxes()).toEqual([]);
  });
});
