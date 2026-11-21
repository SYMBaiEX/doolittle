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

import { resolveSandboxPaths, SandboxOwnershipLease } from "./ownership";
import { collectProcessEnv, resolveExecutionCommand } from "./runtime";
import { resolveSandboxTemplate, SandboxStore } from "./sandbox-store";
import {
  DOOLITTLE_SANDBOX_IMAGE,
  type E2BExecutionResult,
  type E2BSandboxOptions,
  type E2BSandboxRecord,
  type LocalSandboxServiceOptions,
  SandboxCleanupVerificationError,
  SandboxClosingError,
  type SandboxManagerLike,
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
  private readonly ownershipLease: SandboxOwnershipLease;
  private acceptingOperations = false;
  private preparation?: Promise<void>;
  private orphanCleanupManager?: SandboxManagerLike;
  private orphanSweepUnverified = false;
  private implicitCreation?: Promise<string>;

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
    this.ownershipLease = new SandboxOwnershipLease(paths.rootDir, options);
  }

  static async start(
    runtime?: IAgentRuntime,
    options: LocalSandboxServiceOptions = {},
  ): Promise<LocalSandboxService> {
    const service = new LocalSandboxService(runtime, options);
    service.acceptingOperations = true;
    return service;
  }

  async stop(): Promise<void> {
    this.acceptingOperations = false;
    // Preparation can still be inspecting or cleaning the owned namespace.
    // Let it finish before releasing the lease or closing any sandbox handles.
    await this.preparation?.catch(() => undefined);
    await this.stopOrphanCleanupManager();
    if (this.orphanSweepUnverified) await this.cleanupOrphans();
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
    this.ownershipLease.release();
  }

  async createSandbox(options: E2BSandboxOptions = {}): Promise<string> {
    this.assertAcceptingOperations();
    const template = resolveSandboxTemplate(options.template);
    await this.prepareForUse();
    this.assertAcceptingOperations();
    const record = this.sandboxStore.createSandbox(template, options.metadata);
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
    } catch (error) {
      try {
        await this.closeHandle(handle);
      } catch (stopError) {
        throw new AggregateError(
          [error, stopError],
          `Failed to start or clean up sandbox: ${record.id}`,
        );
      }
      throw error;
    }
    // Shutdown owns this handle once it starts draining. Do not return an ID
    // for a container the caller can no longer use.
    this.assertAcceptingOperations();
    if (handle.closing) throw new SandboxClosingError(record.id);
    return record.id;
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

  private prepareForUse(): Promise<void> {
    // Eliza's standard SandboxManager checks the container engine synchronously.
    // Keep it off service startup and retry only when sandbox use is requested.
    this.preparation ??= this.prepareNamespace().catch((error: unknown) => {
      this.preparation = undefined;
      throw error;
    });
    return this.preparation;
  }

  private async prepareNamespace(): Promise<void> {
    if (!this.ownershipLease.held) this.ownershipLease.acquire();
    try {
      if (this.orphanCleanupManager) await this.stopOrphanCleanupManager();
      await this.cleanupOrphans();
    } catch (error) {
      if (this.orphanCleanupManager || this.orphanSweepUnverified) throw error;
      try {
        this.ownershipLease.release();
      } catch (releaseError) {
        throw new AggregateError(
          [error, releaseError],
          "Sandbox preparation and ownership release both failed",
        );
      }
      throw error;
    }
  }

  private async cleanupOrphans(): Promise<void> {
    const cleanupManager = this.createManager(
      this.containerPrefix,
      this.sandboxStore.rootDir,
    );
    this.orphanCleanupManager = cleanupManager;
    // SDK start sweeps existing containers before it acquires a container ID.
    // Stopping this manager cannot verify a sweep that failed before that ID.
    this.orphanSweepUnverified = true;
    try {
      await cleanupManager.start();
    } catch (error) {
      try {
        await this.stopOrphanCleanupManager();
      } catch (stopError) {
        throw new AggregateError(
          [error, stopError],
          "Sandbox preparation and cleanup both failed",
        );
      }
      throw error;
    }
    this.orphanSweepUnverified = false;
    await this.stopOrphanCleanupManager();
    this.sandboxStore.cleanupRoot();
  }

  private async stopOrphanCleanupManager(): Promise<void> {
    const manager = this.orphanCleanupManager;
    if (!manager) return;
    await this.stopManagerVerified(manager, "startup-cleanup");
    this.orphanCleanupManager = undefined;
  }

  private assertAcceptingOperations(): void {
    if (!this.acceptingOperations) {
      throw new SandboxOwnershipError(
        "Local sandbox service is not accepting operations",
        this.ownershipLease.lockPath,
      );
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
        await handle.ready.catch(() => undefined);
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

    this.implicitCreation ??= this.createSandbox().finally(() => {
      this.implicitCreation = undefined;
    });
    const createdId = await this.implicitCreation;
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
