import type {
  ExecutionBackendPreview,
  TerminalCommandRecord,
} from "@/types/execution";
import type { CloudStateAccessor } from "../../cloud/store";
import type { TerminalRunResult } from "../../execution/subprocess";
import type { TerminalCommandHistoryStore } from "../../records/history";
import { persistTerminalCommandExecution } from "../flow";
import type {
  TerminalCommandUpdateEvent,
  TerminalExecutionObservation,
} from "./types";

export function persistAndNotifyCommand(input: {
  command: string;
  backend: TerminalCommandRecord["backend"];
  preview: ExecutionBackendPreview;
  result: TerminalRunResult;
  timeoutMs: number;
  startedAt: string;
  workspaceDir: string;
  historyStore: TerminalCommandHistoryStore;
  cloudState?: CloudStateAccessor;
  onCommand?: (event: TerminalCommandUpdateEvent) => void;
  onExecutionResult?: (event: TerminalExecutionObservation) => void;
}): TerminalCommandRecord {
  const { record } = persistTerminalCommandExecution({
    command: input.command,
    backend: input.backend,
    preview: input.preview,
    result: input.result,
    cwd: input.workspaceDir,
    timeoutMs: input.timeoutMs,
    startedAt: input.startedAt,
    completedAt: new Date().toISOString(),
    cloudState: input.cloudState,
    historyStore: input.historyStore,
  });

  input.onCommand?.({
    kind: "command",
    commandId: record.id,
    backend: record.backend,
    exitCode: record.exitCode,
    detail: `${record.backend} ${record.command.slice(0, 120)}`,
  });

  try {
    input.onExecutionResult?.({
      record: {
        id: record.id,
        command: record.command,
        backend: record.backend,
        backendMode: record.backendMode,
        cwd: record.cwd,
        exitCode: record.exitCode,
        stdout: record.stdout,
        stderr: record.stderr,
        timedOut: record.timedOut,
        startedAt: record.startedAt,
        completedAt: record.completedAt,
      },
      ...(input.result.sandbox ? { sandbox: input.result.sandbox } : {}),
    });
  } catch {
    // Transient verification observers must never change terminal command results.
  }

  return record;
}
