import type {
  ExecutionBackendHealth,
  ExecutionBackendName,
  ExecutionBackendPreview,
} from "@/types/execution";
import type { RuntimeSettings } from "../../settings/runtime-settings";
import type { TerminalRunResult } from "../execution/subprocess";

export interface ExecutionBackend {
  readonly name: ExecutionBackendName;
  preview(
    command: string,
    options: { cwd: string; timeoutMs: number; settings: RuntimeSettings },
  ): ExecutionBackendPreview;
  health(
    settings: RuntimeSettings,
    workspaceDir: string,
  ): Promise<ExecutionBackendHealth>;
  run(
    command: string,
    options: {
      cwd: string;
      timeoutMs: number;
      settings: RuntimeSettings;
      abortSignal?: AbortSignal;
    },
  ): Promise<TerminalRunResult>;
}
