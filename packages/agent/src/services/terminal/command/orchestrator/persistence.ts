import type {
  ExecutionBackendPreview,
  TerminalCommandRecord,
} from "@/types/execution";
import type { CloudStateAccessor } from "../../cloud/store";
import type { TerminalRunResult } from "../../execution/subprocess";
import type { TerminalCommandHistoryStore } from "../../records/history";
import { persistTerminalCommandExecution } from "../flow";
import type { TerminalCommandUpdateEvent } from "./types";

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

  return record;
}
