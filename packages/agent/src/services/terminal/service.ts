import { EventEmitter } from "node:events";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type {
  ExecutionBackendHealth,
  ExecutionBackendName,
  ExecutionBackendPreview,
  ExecutionCloudArtifactRecord,
  ExecutionCloudSnapshotRecord,
  TerminalCommandRecord,
} from "@/types";
import type { RuntimeSettings } from "../settings/runtime-settings";
import { createCoreExecutionBackends } from "./backends/core";
import { createCloudExecutionBackends } from "./cloud/backends";
import { CloudStoreManager } from "./cloud/store";
import {
  type TerminalCommandUpdateEvent,
  TerminalServiceCommandOrchestrator,
} from "./command/orchestrator";
import type { ExecutionBackend } from "./contracts/backend";
import { TerminalCommandHistoryStore } from "./records/history";

export class TerminalService {
  private readonly events = new EventEmitter();
  private readonly commandHistory: TerminalCommandHistoryStore;
  private readonly cloudState: CloudStoreManager;
  private readonly backends: Map<ExecutionBackendName, ExecutionBackend>;
  private readonly commandOrchestrator: TerminalServiceCommandOrchestrator;
  private healthCache?: {
    capturedAt: number;
    value: ExecutionBackendHealth[];
  };
  private healthPromise?: Promise<ExecutionBackendHealth[]>;

  constructor(
    baseDir: string,
    private readonly workspaceDir: string,
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
      workspaceDir: this.workspaceDir,
      getSettings: this.getSettings,
      backends: this.backends,
      historyStore: this.commandHistory,
      cloudState: this.cloudState,
      onMutation: () => this.invalidateHealthCache(),
      onCommand: (event) => {
        this.events.emit("update", event);
      },
    });
  }

  async run(
    command: string,
    timeoutMs?: number,
    abortSignal?: AbortSignal,
  ): Promise<TerminalCommandRecord> {
    return this.commandOrchestrator.run(command, timeoutMs, abortSignal);
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
    return this.commandOrchestrator.runStreamingLocal(
      command,
      callbacks,
      timeoutMs,
      abortSignal,
    );
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
    this.healthPromise = Promise.all(
      Array.from(this.backends.values()).map((backend) =>
        backend.health(settings, this.workspaceDir),
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
}
