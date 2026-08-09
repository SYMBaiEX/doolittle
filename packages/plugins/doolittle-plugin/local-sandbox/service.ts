import { createHash, randomUUID } from "node:crypto";
import {
  closeSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir, userInfo } from "node:os";
import { join, resolve } from "node:path";
import { DOOLITTLE_LOCAL_SANDBOX_SERVICE } from "@doolittle/contracts";
import {
  SandboxManager,
  type SandboxManagerConfig,
} from "@elizaos/agent/services/sandbox-manager";
import {
  runShell,
  type ShellResult,
} from "@elizaos/agent/services/shell-execution-router";
import { Service as ElizaService, type IAgentRuntime } from "@elizaos/core";

import { collectProcessEnv, resolveExecutionCommand } from "./runtime";
import { SandboxStore } from "./sandbox-store";
import {
  DOOLITTLE_SANDBOX_IMAGE,
  DOOLITTLE_SANDBOX_PREFIX,
  type E2BExecutionResult,
  type E2BSandboxOptions,
  type E2BSandboxRecord,
  type LocalSandboxServiceOptions,
  SANDBOX_OWNER_LOCK_SUFFIX,
  SandboxCleanupVerificationError,
  SandboxClosingError,
  type SandboxManagerLike,
  type SandboxOwnerRecord,
  SandboxOwnershipError,
} from "./types";

interface SandboxHandle {
  record: E2BSandboxRecord;
  containerPrefix: string;
  workspaceRoot: string;
  manager: SandboxManagerLike;
  ready: Promise<void>;
  queue: Promise<void>;
  closing: boolean;
  cleanupPending: boolean;
  closePromise?: Promise<void>;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function stableHash(value: string, length = 24): string {
  return createHash("sha256").update(value).digest("hex").slice(0, length);
}

function currentUserIdentity(): string {
  if (typeof process.getuid === "function") {
    return `uid:${process.getuid()}`;
  }
  return `user:${userInfo().username}`;
}

function resolveSandboxPaths(options: LocalSandboxServiceOptions): {
  rootDir: string;
  containerPrefix: string;
} {
  const userIdentity = currentUserIdentity();
  const userNamespace = stableHash(userIdentity, 16);
  const rootDir = resolve(
    options.rootDir ??
      join(tmpdir(), `${DOOLITTLE_SANDBOX_PREFIX}-${userNamespace}`),
  );
  return {
    rootDir,
    containerPrefix:
      options.containerPrefix ??
      `${DOOLITTLE_SANDBOX_PREFIX}-${stableHash(`${userIdentity}\0${rootDir}`)}`,
  };
}

export class LocalSandboxService extends ElizaService {
  static serviceType = DOOLITTLE_LOCAL_SANDBOX_SERVICE;

  capabilityDescription =
    "Doolittle local sandbox service with E2B-compatible methods for local code execution and autocoder workflows.";

  private readonly sandboxStore: SandboxStore;
  private readonly handles = new Map<string, SandboxHandle>();
  private readonly containerPrefix: string;
  private readonly managerFactory: (
    config: SandboxManagerConfig,
  ) => SandboxManagerLike;
  private readonly ownershipLockPath: string;
  private readonly ownershipRecoveryLockPath: string;
  private readonly processId: number;
  private readonly nonceFactory: () => string;
  private readonly isProcessAlive: (processId: number) => boolean;
  private ownership?: SandboxOwnerRecord;
  private acceptingOperations = false;

  constructor(
    runtime?: IAgentRuntime,
    options: LocalSandboxServiceOptions = {},
  ) {
    super(runtime);
    const paths = resolveSandboxPaths(options);
    this.sandboxStore = new SandboxStore(paths.rootDir);
    this.containerPrefix = paths.containerPrefix;
    this.managerFactory =
      options.managerFactory ?? ((config) => new SandboxManager(config));
    this.ownershipLockPath = `${paths.rootDir}${SANDBOX_OWNER_LOCK_SUFFIX}`;
    this.ownershipRecoveryLockPath = `${this.ownershipLockPath}.recovery`;
    this.processId = options.processId ?? process.pid;
    this.nonceFactory = options.nonceFactory ?? randomUUID;
    this.isProcessAlive = options.isProcessAlive ?? this.checkProcessAlive;
  }

  static async start(
    runtime?: IAgentRuntime,
    options: LocalSandboxServiceOptions = {},
  ): Promise<LocalSandboxService> {
    const service = new LocalSandboxService(runtime, options);
    service.acquireOwnership();
    try {
      await service.cleanupOrphans();
      service.acceptingOperations = true;
      return service;
    } catch (error) {
      try {
        service.releaseOwnership();
      } catch (releaseError) {
        throw new AggregateError(
          [error, releaseError],
          "Sandbox startup and ownership release both failed",
        );
      }
      throw error;
    }
  }

  async stop(): Promise<void> {
    this.acceptingOperations = false;
    const handles = [...this.handles.values()];
    for (const handle of handles) {
      handle.closing = true;
    }

    const results = await Promise.allSettled(
      handles.map((handle) => this.closeHandle(handle)),
    );
    const errors = results.flatMap((result) =>
      result.status === "rejected" ? [result.reason] : [],
    );
    if (errors.length > 0) {
      throw new AggregateError(errors, "Failed to stop all local sandboxes");
    }
    this.releaseOwnership();
  }

  async createSandbox(options: E2BSandboxOptions = {}): Promise<string> {
    this.assertAcceptingOperations();
    // The store validates templates before creating a workspace or manager.
    const record = this.sandboxStore.createSandbox(options);
    const containerPrefix = `${this.containerPrefix}-${record.id}`;
    let manager: SandboxManagerLike;
    try {
      manager = this.createManager(containerPrefix, record.path);
    } catch (error) {
      this.sandboxStore.removeSandbox(record.id);
      throw error;
    }
    const handle: SandboxHandle = {
      record,
      containerPrefix,
      workspaceRoot: record.path,
      manager,
      ready: Promise.resolve(),
      queue: Promise.resolve(),
      closing: false,
      cleanupPending: false,
      closePromise: undefined,
    };
    this.handles.set(record.id, handle);

    try {
      handle.ready = manager.start();
      await handle.ready;
      return record.id;
    } catch (error) {
      handle.closing = true;
      try {
        await this.stopManagerVerified(manager, record.id);
      } catch (stopError) {
        handle.ready = Promise.resolve();
        handle.cleanupPending = true;
        this.sandboxStore.deactivateSandbox(record.id);
        throw new AggregateError(
          [error, stopError],
          `Failed to start or clean up sandbox: ${record.id}`,
        );
      }
      this.handles.delete(record.id);
      this.sandboxStore.removeSandbox(record.id);
      throw error;
    }
  }

  async killSandbox(id?: string): Promise<void> {
    const sandboxId = id ?? this.sandboxStore.getActiveSandboxId();
    if (!sandboxId) {
      return;
    }
    const record = this.sandboxStore.getSandbox(sandboxId);
    const handle = this.handles.get(record.id);
    if (!handle) {
      // Store/handle divergence should still surface as an explicit target error.
      throw new Error(`Sandbox manager not found: ${record.id}`);
    }
    await this.closeHandle(handle);
  }

  async executeCode(
    code: string,
    language = "python",
    sandboxId?: string,
  ): Promise<E2BExecutionResult> {
    this.assertAcceptingOperations();
    const handle = await this.resolveHandle(sandboxId);
    await handle.ready;
    if (handle.closing) {
      throw new SandboxClosingError(handle.record.id);
    }

    let resolveQueue!: () => void;
    const previous = handle.queue;
    handle.queue = new Promise<void>((resolve) => {
      resolveQueue = resolve;
    });

    await previous;
    try {
      if (handle.closing) {
        throw new SandboxClosingError(handle.record.id);
      }
      return await this.executeWithHandle(handle, code, language);
    } finally {
      resolveQueue();
    }
  }

  listSandboxes(): E2BSandboxRecord[] {
    return this.sandboxStore.listSandboxes();
  }

  getActiveSandboxId(): string | undefined {
    return this.sandboxStore.getActiveSandboxId();
  }

  private async cleanupOrphans(): Promise<void> {
    const cleanupManager = this.createManager(
      this.containerPrefix,
      this.sandboxStore.rootDir,
    );
    try {
      await cleanupManager.start();
    } catch (error) {
      await this.stopManagerVerified(cleanupManager, "startup-cleanup");
      throw error;
    }
    await this.stopManagerVerified(cleanupManager, "startup-cleanup");
    this.sandboxStore.cleanupRoot();
  }

  private acquireOwnership(): void {
    const owner = { pid: this.processId, nonce: this.nonceFactory() };
    if (this.tryCreateOwnershipLock(this.ownershipLockPath, owner)) {
      this.ownership = owner;
      return;
    }

    const existing = this.readOwnershipLock(this.ownershipLockPath);
    if (!existing) {
      this.acquireOwnership();
      return;
    }
    if (this.isProcessAlive(existing.pid)) {
      throw new SandboxOwnershipError(
        `Local sandbox is already owned by live process ${existing.pid}`,
        this.ownershipLockPath,
        existing.pid,
      );
    }

    const recoveryOwner = {
      pid: this.processId,
      nonce: `${owner.nonce}:recovery`,
    };
    if (
      !this.tryCreateOwnershipLock(
        this.ownershipRecoveryLockPath,
        recoveryOwner,
      )
    ) {
      throw new SandboxOwnershipError(
        "Local sandbox ownership recovery is already in progress",
        this.ownershipRecoveryLockPath,
      );
    }

    try {
      const current = this.readOwnershipLock(this.ownershipLockPath);
      if (current && this.isProcessAlive(current.pid)) {
        throw new SandboxOwnershipError(
          `Local sandbox is already owned by live process ${current.pid}`,
          this.ownershipLockPath,
          current.pid,
        );
      }
      if (current) {
        unlinkSync(this.ownershipLockPath);
      }
      if (!this.tryCreateOwnershipLock(this.ownershipLockPath, owner)) {
        const winner = this.readOwnershipLock(this.ownershipLockPath);
        throw new SandboxOwnershipError(
          winner
            ? `Local sandbox ownership was acquired by process ${winner.pid}`
            : "Local sandbox ownership changed during recovery",
          this.ownershipLockPath,
          winner?.pid,
        );
      }
      this.ownership = owner;
    } finally {
      this.releaseOwnedLock(this.ownershipRecoveryLockPath, recoveryOwner);
    }
  }

  private releaseOwnership(): void {
    if (!this.ownership) {
      return;
    }
    this.releaseOwnedLock(this.ownershipLockPath, this.ownership);
    this.ownership = undefined;
  }

  private assertAcceptingOperations(): void {
    if (!this.acceptingOperations || !this.ownership) {
      throw new SandboxOwnershipError(
        "Local sandbox service is not accepting operations",
        this.ownershipLockPath,
      );
    }
  }

  private tryCreateOwnershipLock(
    lockPath: string,
    owner: SandboxOwnerRecord,
  ): boolean {
    let descriptor: number;
    try {
      descriptor = openSync(lockPath, "wx", 0o600);
    } catch (error) {
      if (isNodeError(error) && error.code === "EEXIST") {
        return false;
      }
      throw error;
    }

    try {
      if (
        !Number.isSafeInteger(owner.pid) ||
        owner.pid <= 0 ||
        owner.nonce.length === 0 ||
        /[\r\n]/.test(owner.nonce)
      ) {
        throw new SandboxOwnershipError(
          "Local sandbox ownership record is invalid",
          lockPath,
          owner.pid,
        );
      }
      writeFileSync(descriptor, `${owner.pid}\n${owner.nonce}\n`, "utf8");
    } catch (error) {
      closeSync(descriptor);
      unlinkSync(lockPath);
      throw error;
    }
    closeSync(descriptor);
    return true;
  }

  private readOwnershipLock(lockPath: string): SandboxOwnerRecord | undefined {
    let raw: string;
    try {
      raw = readFileSync(lockPath, "utf8");
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        return undefined;
      }
      throw error;
    }

    const match = /^([1-9][0-9]*)\n([^\r\n]+)\n$/.exec(raw);
    const pid = match ? Number(match[1]) : Number.NaN;
    if (!match || !Number.isSafeInteger(pid)) {
      throw new SandboxOwnershipError(
        "Local sandbox ownership lock is unreadable; refusing unsafe recovery",
        lockPath,
      );
    }
    return { pid, nonce: match[2] ?? "" };
  }

  private releaseOwnedLock(
    lockPath: string,
    expected: SandboxOwnerRecord,
  ): void {
    const current = this.readOwnershipLock(lockPath);
    if (
      !current ||
      current.pid !== expected.pid ||
      current.nonce !== expected.nonce
    ) {
      throw new SandboxOwnershipError(
        "Local sandbox ownership changed; refusing to release another owner",
        lockPath,
        current?.pid,
      );
    }
    unlinkSync(lockPath);
  }

  private checkProcessAlive(processId: number): boolean {
    try {
      process.kill(processId, 0);
      return true;
    } catch (error) {
      if (isNodeError(error) && error.code === "ESRCH") {
        return false;
      }
      return true;
    }
  }

  private closeHandle(handle: SandboxHandle): Promise<void> {
    if (handle.closePromise) {
      return handle.closePromise;
    }
    handle.closing = true;
    this.sandboxStore.deactivateSandbox(handle.record.id);
    handle.closePromise = (async () => {
      try {
        await handle.ready;
        await handle.queue;
        if (handle.cleanupPending) {
          const recoveryManager = this.createManager(
            handle.containerPrefix,
            handle.workspaceRoot,
          );
          await recoveryManager.start();
          await this.stopManagerVerified(recoveryManager, handle.record.id);
          handle.manager = recoveryManager;
        } else {
          await this.stopManagerVerified(handle.manager, handle.record.id);
        }
        this.handles.delete(handle.record.id);
        this.sandboxStore.removeSandbox(handle.record.id);
      } catch (error) {
        handle.cleanupPending = true;
        handle.closePromise = undefined;
        throw error;
      }
    })();
    return handle.closePromise;
  }

  private async stopManagerVerified(
    manager: SandboxManagerLike,
    sandboxId: string,
  ): Promise<void> {
    const eventCursor = manager.getEventLog().length;
    await manager.stop();
    const cleanupErrors = manager
      .getEventLog()
      .slice(eventCursor)
      .filter((event) => event.type === "error");
    const status = manager.getStatus();
    if (
      cleanupErrors.length > 0 ||
      status.containerId !== null ||
      status.browserContainerId !== null
    ) {
      throw new SandboxCleanupVerificationError(
        `Sandbox cleanup could not be verified for ${sandboxId}`,
      );
    }
  }

  private createManager(
    containerPrefix: string,
    workspaceRoot: string,
  ): SandboxManagerLike {
    return this.managerFactory({
      mode: "standard",
      image: DOOLITTLE_SANDBOX_IMAGE,
      containerPrefix,
      readOnlyRoot: true,
      workspaceRoot,
    });
  }

  private async resolveHandle(sandboxId?: string): Promise<SandboxHandle> {
    if (sandboxId) {
      const record = this.sandboxStore.getSandbox(sandboxId);
      const handle = this.handles.get(record.id);
      if (!handle) {
        throw new Error(`Sandbox manager not found: ${record.id}`);
      }
      return handle;
    }

    const activeId = this.sandboxStore.getActiveSandboxId();
    const activeHandle = activeId ? this.handles.get(activeId) : undefined;
    if (activeHandle && !activeHandle.closing) {
      return activeHandle;
    }

    const createdId = await this.createSandbox();
    const createdHandle = this.handles.get(createdId);
    if (!createdHandle) {
      throw new Error(`Sandbox manager not found: ${createdId}`);
    }
    return createdHandle;
  }

  private async executeWithHandle(
    handle: SandboxHandle,
    code: string,
    language: string,
  ): Promise<E2BExecutionResult> {
    const [command, args] = resolveExecutionCommand(language, code);
    const workdir = handle.manager.getContainerWorkspacePath(
      handle.record.path,
    );
    if (!workdir) {
      return this.executionError(
        language,
        handle.record.id,
        `Sandbox workspace is outside the managed workspace: ${handle.record.path}`,
      );
    }

    let result: ShellResult;
    try {
      result = await runShell(
        {
          command,
          args,
          cwd: workdir,
          env: {
            ...collectProcessEnv(),
            NODE_ENV: process.env.NODE_ENV ?? "development",
            XDG_CACHE_HOME: `${workdir}/.cache`,
          },
          toolName: "doolittle.local-sandbox.execute-code",
        },
        {
          mode: "local-safe",
          sandboxManager: handle.manager as SandboxManager,
        },
      );
    } catch (error) {
      return this.executionError(
        language,
        handle.record.id,
        error instanceof Error ? error.message : String(error),
      );
    }

    const { exitCode, stdout, stderr } = result;
    const text = [stdout.trim(), stderr.trim()].filter(Boolean).join("\n");

    if (exitCode !== 0) {
      return {
        success: false,
        text,
        stdout,
        stderr,
        error: {
          value: stderr.trim() || stdout.trim() || `Process exited ${exitCode}`,
          traceback: stderr.trim() || undefined,
        },
        language,
        sandboxId: handle.record.id,
      };
    }

    return {
      success: true,
      text,
      stdout,
      stderr,
      language,
      sandboxId: handle.record.id,
    };
  }

  private executionError(
    language: string,
    sandboxId: string,
    value: string,
  ): E2BExecutionResult {
    return {
      success: false,
      text: value,
      stdout: "",
      stderr: value,
      error: { value, traceback: value },
      language,
      sandboxId,
    };
  }
}
