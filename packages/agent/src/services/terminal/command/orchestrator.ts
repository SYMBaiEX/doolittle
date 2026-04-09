import type {
  ExecutionBackendName,
  ExecutionBackendPreview,
  TerminalCommandRecord,
} from "@/types/execution";
import type { RuntimeSettings } from "../../settings/runtime-settings";
import type { CloudStateAccessor } from "../cloud/store";
import type { ExecutionBackend } from "../contracts/backend";
import {
  LOCAL_SHELL,
  normalizeBackendError,
  runCommandStreaming,
  sanitizeCommand,
  type TerminalRunResult,
} from "../execution/subprocess";
import type { TerminalCommandHistoryStore } from "../records/history";
import { persistTerminalCommandExecution } from "./flow";

export interface TerminalCommandUpdateEvent {
  kind: "command";
  commandId: string;
  backend: ExecutionBackendName;
  exitCode: number;
  detail: string;
}

interface TerminalServiceCommandOrchestratorOptions {
  workspaceDir: string;
  getSettings: () => RuntimeSettings;
  backends: Map<ExecutionBackendName, ExecutionBackend>;
  historyStore: TerminalCommandHistoryStore;
  cloudState?: CloudStateAccessor;
  onMutation?: () => void;
  onCommand?: (event: TerminalCommandUpdateEvent) => void;
}

interface ResolvedExecutionContext {
  settings: RuntimeSettings;
  safeCommand: string;
  effectiveTimeoutMs: number;
}

export class TerminalServiceCommandOrchestrator {
  constructor(
    private readonly options: TerminalServiceCommandOrchestratorOptions,
  ) {}

  async run(
    command: string,
    timeoutMs?: number,
    abortSignal?: AbortSignal,
  ): Promise<TerminalCommandRecord> {
    this.options.onMutation?.();
    const { settings, safeCommand, effectiveTimeoutMs } =
      this.resolveExecutionContext(command, timeoutMs);
    const backend = this.resolveConfiguredBackend(settings);
    const preview = this.previewWithBackend(
      backend,
      safeCommand,
      settings,
      effectiveTimeoutMs,
    );
    const startedAt = new Date().toISOString();
    const result = await backend.run(safeCommand, {
      cwd: this.options.workspaceDir,
      timeoutMs: effectiveTimeoutMs,
      settings,
      abortSignal,
    });
    return this.persistAndNotify({
      command: safeCommand,
      backend: backend.name,
      preview,
      result,
      timeoutMs: effectiveTimeoutMs,
      startedAt,
    });
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
    const settings = this.options.getSettings();
    const backendName = settings.execution.backend as ExecutionBackendName;
    if (backendName !== "local") {
      return this.run(command, timeoutMs, abortSignal);
    }

    this.options.onMutation?.();
    const { safeCommand, effectiveTimeoutMs } = this.resolveExecutionContext(
      command,
      timeoutMs,
      settings,
    );
    const backend = this.resolveLocalBackend();
    const preview = this.previewWithBackend(
      backend,
      safeCommand,
      settings,
      effectiveTimeoutMs,
    );
    const startedAt = new Date().toISOString();
    const result = normalizeBackendError(
      await runCommandStreaming([LOCAL_SHELL, "-lc", safeCommand], {
        cwd: this.options.workspaceDir,
        timeoutMs: effectiveTimeoutMs,
        onStdout: callbacks?.onStdout,
        onStderr: callbacks?.onStderr,
        abortSignal,
      }),
    );
    return this.persistAndNotify({
      command: safeCommand,
      backend: "local",
      preview,
      result,
      timeoutMs: effectiveTimeoutMs,
      startedAt,
    });
  }

  preview(command: string, timeoutMs?: number): ExecutionBackendPreview {
    const { settings, safeCommand, effectiveTimeoutMs } =
      this.resolveExecutionContext(command, timeoutMs);
    const backend = this.resolveConfiguredBackend(settings);
    return this.previewWithBackend(
      backend,
      safeCommand,
      settings,
      effectiveTimeoutMs,
    );
  }

  private resolveExecutionContext(
    command: string,
    timeoutMs?: number,
    settings = this.options.getSettings(),
  ): ResolvedExecutionContext {
    return {
      settings,
      safeCommand: sanitizeCommand(command),
      effectiveTimeoutMs:
        timeoutMs ?? settings.execution.commandTimeoutMs ?? 30_000,
    };
  }

  private resolveConfiguredBackend(
    settings: RuntimeSettings,
  ): ExecutionBackend {
    const backendName = settings.execution.backend as ExecutionBackendName;
    const backend =
      this.options.backends.get(backendName) ??
      this.options.backends.get("local");
    if (!backend) {
      throw new Error("No execution backend is available.");
    }
    return backend;
  }

  private resolveLocalBackend(): ExecutionBackend {
    const backend = this.options.backends.get("local");
    if (!backend) {
      throw new Error("No local execution backend is available.");
    }
    return backend;
  }

  private previewWithBackend(
    backend: ExecutionBackend,
    command: string,
    settings: RuntimeSettings,
    timeoutMs: number,
  ): ExecutionBackendPreview {
    return backend.preview(command, {
      cwd: this.options.workspaceDir,
      timeoutMs,
      settings,
    });
  }

  private persistAndNotify(input: {
    command: string;
    backend: TerminalCommandRecord["backend"];
    preview: ExecutionBackendPreview;
    result: TerminalRunResult;
    timeoutMs: number;
    startedAt: string;
  }): TerminalCommandRecord {
    const { record } = persistTerminalCommandExecution({
      command: input.command,
      backend: input.backend,
      preview: input.preview,
      result: input.result,
      cwd: this.options.workspaceDir,
      timeoutMs: input.timeoutMs,
      startedAt: input.startedAt,
      completedAt: new Date().toISOString(),
      cloudState: this.options.cloudState,
      historyStore: this.options.historyStore,
    });
    this.options.onCommand?.({
      kind: "command",
      commandId: record.id,
      backend: record.backend,
      exitCode: record.exitCode,
      detail: `${record.backend} ${record.command.slice(0, 120)}`,
    });
    return record;
  }
}
