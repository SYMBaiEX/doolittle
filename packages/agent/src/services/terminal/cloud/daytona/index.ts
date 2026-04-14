import type {
  ExecutionBackendHealth,
  ExecutionBackendPreview,
} from "@/types/execution";
import type { RuntimeSettings } from "../../../settings/runtime-settings";
import type { ExecutionBackend } from "../../contracts/backend";
import type { CloudStateAccessor } from "../store";
import { buildDaytonaHealth } from "./health";
import { buildDaytonaPreview } from "./preview";
import { runDaytonaCommand } from "./run";

class DaytonaExecutionBackend implements ExecutionBackend {
  readonly name = "daytona" as const;

  constructor(private readonly cloudState: CloudStateAccessor) {}

  preview(
    command: string,
    options: { cwd: string; timeoutMs: number; settings: RuntimeSettings },
  ): ExecutionBackendPreview {
    return buildDaytonaPreview({
      cloudState: this.cloudState,
      command,
      settings: options.settings,
      cwd: options.cwd,
      timeoutMs: options.timeoutMs,
    });
  }

  async health(
    settings: RuntimeSettings,
    workspaceDir: string,
  ): Promise<ExecutionBackendHealth> {
    return buildDaytonaHealth({
      cloudState: this.cloudState,
      settings,
      workspaceDir,
    });
  }

  async run(
    command: string,
    options: {
      cwd: string;
      timeoutMs: number;
      settings: RuntimeSettings;
      abortSignal?: AbortSignal;
    },
  ) {
    return runDaytonaCommand({
      cloudState: this.cloudState,
      settings: options.settings,
      command,
      cwd: options.cwd,
      timeoutMs: options.timeoutMs,
      abortSignal: options.abortSignal,
    });
  }
}

export function createDaytonaExecutionBackend(
  cloudState: CloudStateAccessor,
): ExecutionBackend {
  return new DaytonaExecutionBackend(cloudState);
}
