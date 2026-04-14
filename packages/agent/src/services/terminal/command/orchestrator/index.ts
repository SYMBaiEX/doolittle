import type { TerminalCommandRecord } from "@/types/execution";
import {
  LOCAL_SHELL,
  normalizeBackendError,
  runCommandStreaming,
} from "../../execution/subprocess";
import {
  previewWithBackend,
  resolveConfiguredBackend,
  resolveLocalBackend,
} from "./backend";
import { resolveExecutionContext } from "./context";
import { persistAndNotifyCommand } from "./persistence";
import type {
  TerminalCommandUpdateEvent,
  TerminalServiceCommandOrchestratorOptions,
} from "./types";

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
      resolveExecutionContext({
        command,
        timeoutMs,
        getSettings: this.options.getSettings,
      });
    const backend = resolveConfiguredBackend(this.options.backends, settings);
    const preview = previewWithBackend({
      backend,
      command: safeCommand,
      settings,
      timeoutMs: effectiveTimeoutMs,
      workspaceDir: this.options.workspaceDir,
    });
    const startedAt = new Date().toISOString();
    const result = await backend.run(safeCommand, {
      cwd: this.options.workspaceDir,
      timeoutMs: effectiveTimeoutMs,
      settings,
      abortSignal,
    });

    return persistAndNotifyCommand({
      command: safeCommand,
      backend: backend.name,
      preview,
      result,
      timeoutMs: effectiveTimeoutMs,
      startedAt,
      workspaceDir: this.options.workspaceDir,
      historyStore: this.options.historyStore,
      cloudState: this.options.cloudState,
      onCommand: this.options.onCommand,
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
    if (settings.execution.backend !== "local") {
      return this.run(command, timeoutMs, abortSignal);
    }

    this.options.onMutation?.();
    const { safeCommand, effectiveTimeoutMs } = resolveExecutionContext({
      command,
      timeoutMs,
      getSettings: this.options.getSettings,
      settings,
    });
    const backend = resolveLocalBackend(this.options.backends);
    const preview = previewWithBackend({
      backend,
      command: safeCommand,
      settings,
      timeoutMs: effectiveTimeoutMs,
      workspaceDir: this.options.workspaceDir,
    });
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

    return persistAndNotifyCommand({
      command: safeCommand,
      backend: "local",
      preview,
      result,
      timeoutMs: effectiveTimeoutMs,
      startedAt,
      workspaceDir: this.options.workspaceDir,
      historyStore: this.options.historyStore,
      cloudState: this.options.cloudState,
      onCommand: this.options.onCommand,
    });
  }

  preview(command: string, timeoutMs?: number) {
    const { settings, safeCommand, effectiveTimeoutMs } =
      resolveExecutionContext({
        command,
        timeoutMs,
        getSettings: this.options.getSettings,
      });
    const backend = resolveConfiguredBackend(this.options.backends, settings);
    return previewWithBackend({
      backend,
      command: safeCommand,
      settings,
      timeoutMs: effectiveTimeoutMs,
      workspaceDir: this.options.workspaceDir,
    });
  }
}

export type { TerminalCommandUpdateEvent };
