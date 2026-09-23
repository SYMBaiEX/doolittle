import { EventEmitter } from "node:events";
import { mkdirSync, realpathSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import type {
  ExecutionBackendHealth,
  ExecutionBackendName,
  ExecutionBackendPreview,
  ExecutionCloudArtifactRecord,
  ExecutionCloudSnapshotRecord,
  TerminalCommandRecord,
} from "@/types";
import type { RuntimeSettings } from "../settings/runtime-settings";
import {
  resolveWorkspaceDirectory,
  type WorkspaceDirectorySource,
} from "../workspace-directory";
import { AppServerManager } from "./app-server";
import { createCoreExecutionBackends } from "./backends/core";
import { createCloudExecutionBackends } from "./cloud/backends";
import { CloudStoreManager } from "./cloud/store";
import {
  type TerminalCommandUpdateEvent,
  TerminalServiceCommandOrchestrator,
} from "./command/orchestrator";
import type { ExecutionBackend } from "./contracts/backend";
import { TerminalCommandHistoryStore } from "./records/history";
import {
  type InteractiveTerminalOutput,
  InteractiveTerminalSessionManager,
  type InteractiveTerminalSessionSnapshot,
} from "./session";

export class TerminalService {
  private readonly events = new EventEmitter();
  private readonly commandHistory: TerminalCommandHistoryStore;
  private readonly cloudState: CloudStoreManager;
  private readonly backends: Map<ExecutionBackendName, ExecutionBackend>;
  private readonly commandOrchestrator: TerminalServiceCommandOrchestrator;
  private readonly interactiveSessions: InteractiveTerminalSessionManager;
  readonly appServers: AppServerManager;
  private healthCache?: {
    capturedAt: number;
    value: ExecutionBackendHealth[];
  };
  private healthPromise?: Promise<ExecutionBackendHealth[]>;
  private readonly buildsInProgress = new Set<string>();

  constructor(
    baseDir: string,
    private readonly workspaceDirectory: WorkspaceDirectorySource,
    private readonly getSettings: () => RuntimeSettings,
  ) {
    mkdirSync(baseDir, { recursive: true });
    this.commandHistory = new TerminalCommandHistoryStore(
      join(baseDir, "terminal-history.json"),
    );
    this.cloudState = new CloudStoreManager(
      join(baseDir, "cloud-sessions.json"),
    );
    const coreBackends = createCoreExecutionBackends();
    const cloudBackends = createCloudExecutionBackends(this.cloudState);
    this.backends = new Map<ExecutionBackendName, ExecutionBackend>([
      ...coreBackends,
      ...cloudBackends,
    ]);
    this.commandOrchestrator = new TerminalServiceCommandOrchestrator({
      getWorkspaceDir: () => resolveWorkspaceDirectory(this.workspaceDirectory),
      getSettings: this.getSettings,
      backends: this.backends,
      historyStore: this.commandHistory,
      cloudState: this.cloudState,
      onMutation: () => this.invalidateHealthCache(),
      onCommand: (event) => {
        this.events.emit("update", event);
      },
    });
    this.interactiveSessions = new InteractiveTerminalSessionManager(
      this.workspaceDirectory,
    );
    this.appServers = new AppServerManager(this.interactiveSessions);
  }

  async run(
    command: string,
    timeoutMs?: number,
    abortSignal?: AbortSignal,
  ): Promise<TerminalCommandRecord> {
    const buildDirectory = this.productionBuildDirectory(command);
    if (!buildDirectory) {
      return this.commandOrchestrator.run(command, timeoutMs, abortSignal);
    }
    const blocked = this.preflightProductionBuild(command);
    if (blocked) throw new Error(blocked);
    this.buildsInProgress.add(buildDirectory);
    try {
      return await this.commandOrchestrator.run(
        command,
        timeoutMs,
        abortSignal,
      );
    } finally {
      this.buildsInProgress.delete(buildDirectory);
    }
  }

  /** Return an actionable reason when a build would race a managed dev server. */
  preflightProductionBuild(command: string): string | undefined {
    const directory = this.productionBuildDirectory(command);
    if (!directory) return undefined;
    if (this.buildsInProgress.has(directory)) {
      return `A production build is already running in ${directory}. Wait for it to finish before starting another build.`;
    }
    const liveApp = this.interactiveSessions
      .listManaged()
      .find(
        (session) =>
          session.state === "running" &&
          this.canonicalDirectory(session.cwd) === directory,
      );
    if (liveApp) {
      return `The production build was not run because a managed app is already running from ${directory}. Stop that dev server from the Terminal surface, then run the build. Next.js build and dev processes must not write to the same .next directory at the same time.`;
    }
    return undefined;
  }

  /** Prevent app startup from racing a production build in the same workspace. */
  async startManagedApplication(input: {
    owner: string;
    cwd: string;
    command: string;
    abortSignal?: AbortSignal;
    waitMs?: number;
  }) {
    const directory = this.canonicalDirectory(input.cwd);
    if (directory && this.buildsInProgress.has(directory)) {
      throw new Error(
        `A production build is still running in ${directory}. Start the dev server after that build has finished.`,
      );
    }
    return this.appServers.start(input);
  }

  invalidateWorkspace(): void {
    this.interactiveSessions.dispose({ preserveManaged: true });
    this.invalidateHealthCache();
  }

  async runStreamingLocal(
    command: string,
    callbacks?: {
      onStdout?: (chunk: string) => void;
      onStderr?: (chunk: string) => void;
    },
    timeoutMs?: number,
    abortSignal?: AbortSignal,
  ): Promise<TerminalCommandRecord> {
    const buildDirectory = this.productionBuildDirectory(command);
    if (buildDirectory) {
      const blocked = this.preflightProductionBuild(command);
      if (blocked) throw new Error(blocked);
      this.buildsInProgress.add(buildDirectory);
    }
    try {
      return await this.commandOrchestrator.runStreamingLocal(
        command,
        callbacks,
        timeoutMs,
        abortSignal,
      );
    } finally {
      if (buildDirectory) this.buildsInProgress.delete(buildDirectory);
    }
  }

  onUpdate(listener: (event: TerminalCommandUpdateEvent) => void): () => void {
    this.events.on("update", listener);
    return () => {
      this.events.off("update", listener);
    };
  }

  async health(): Promise<ExecutionBackendHealth[]> {
    const now = Date.now();
    if (this.healthCache && now - this.healthCache.capturedAt < 20_000) {
      return this.healthCache.value;
    }
    if (this.healthPromise) {
      return this.healthPromise;
    }
    const settings = this.getSettings();
    const workspaceDir = resolveWorkspaceDirectory(this.workspaceDirectory);
    this.healthPromise = Promise.all(
      Array.from(this.backends.values()).map((backend) =>
        backend.health(settings, workspaceDir),
      ),
    )
      .then((value) => {
        this.healthCache = {
          capturedAt: Date.now(),
          value,
        };
        return value;
      })
      .finally(() => {
        this.healthPromise = undefined;
      });
    return this.healthPromise;
  }

  preview(command: string, timeoutMs?: number): ExecutionBackendPreview {
    return this.commandOrchestrator.preview(command, timeoutMs);
  }

  recent(limit = 10): TerminalCommandRecord[] {
    return this.commandHistory.read().commands.slice(-limit).reverse();
  }

  getHistory(limit = 10): TerminalCommandRecord[] {
    return this.recent(limit);
  }

  startInteractiveSession(options?: {
    cols?: number;
    rows?: number;
  }): InteractiveTerminalSessionSnapshot {
    return this.interactiveSessions.start(options);
  }

  managedApplicationSessions(): InteractiveTerminalSessionSnapshot[] {
    return this.interactiveSessions
      .listManaged()
      .filter((session) => session.state === "running");
  }

  writeInteractiveSession(
    sessionId: string,
    data: string,
  ): InteractiveTerminalSessionSnapshot {
    return this.interactiveSessions.input(sessionId, data);
  }

  resizeInteractiveSession(
    sessionId: string,
    cols: number,
    rows: number,
  ): InteractiveTerminalSessionSnapshot {
    return this.interactiveSessions.resize(sessionId, cols, rows);
  }

  interruptInteractiveSession(
    sessionId: string,
  ): InteractiveTerminalSessionSnapshot {
    return this.interactiveSessions.interrupt(sessionId);
  }

  closeInteractiveSession(
    sessionId: string,
  ): InteractiveTerminalSessionSnapshot {
    return this.interactiveSessions.close(sessionId);
  }

  interactiveSessionOutput(
    sessionId: string,
    cursor?: number,
  ): InteractiveTerminalOutput {
    return this.interactiveSessions.output(sessionId, cursor);
  }

  disposeInteractiveSessions(): void {
    this.interactiveSessions.dispose();
  }

  async status(): Promise<{
    configured: ExecutionBackendName;
    preview: ExecutionBackendPreview;
    health: ExecutionBackendHealth[];
  }> {
    const settings = this.getSettings();
    return {
      configured: settings.execution.backend as ExecutionBackendName,
      preview: this.preview("printf 'doolittle-status'"),
      health: await this.health(),
    };
  }

  cloudSnapshots(limit = 10): ExecutionCloudSnapshotRecord[] {
    return this.cloudState.listSnapshots(limit);
  }

  cloudArtifacts(limit = 10): ExecutionCloudArtifactRecord[] {
    return this.cloudState.listArtifacts(limit);
  }

  private invalidateHealthCache(): void {
    this.healthCache = undefined;
    this.healthPromise = undefined;
  }

  private productionBuildDirectory(command: string): string | undefined {
    if (
      !/(?:\b(?:bun|npm|pnpm|yarn)\s+(?:run\s+)?build\b|\bnext\s+build\b)/iu.test(
        command,
      )
    ) {
      return undefined;
    }
    const workspaceDir = resolveWorkspaceDirectory(this.workspaceDirectory);
    const cdMatch = command.match(
      /^\s*cd\s+(?:"([^"]+)"|'([^']+)'|([^\s;&]+))\s*&&/u,
    );
    const requested = cdMatch?.[1] ?? cdMatch?.[2] ?? cdMatch?.[3];
    const directory = requested
      ? isAbsolute(requested)
        ? requested
        : resolve(workspaceDir, requested)
      : workspaceDir;
    return this.canonicalDirectory(directory);
  }

  private canonicalDirectory(directory: string): string | undefined {
    try {
      return realpathSync(directory);
    } catch {
      return undefined;
    }
  }
}
