import type {
  ExecutionBackendHealth,
  ExecutionBackendPreview,
} from "@/types/execution";
import type { RuntimeSettings } from "../../../settings/runtime-settings";
import type { ExecutionBackend } from "../../contracts/backend";
import type { CloudStateAccessor } from "../store";
import { buildModalHealth } from "./health";
import { buildModalPreview } from "./preview";
import { runModalCommand } from "./run";

class ModalExecutionBackend implements ExecutionBackend {
  readonly name = "modal" as const;

  constructor(private readonly cloudState: CloudStateAccessor) {}

  preview(
    command: string,
    options: { cwd: string; timeoutMs: number; settings: RuntimeSettings },
  ): ExecutionBackendPreview {
    return buildModalPreview(this.cloudState, command, options);
  }

  async health(
    settings: RuntimeSettings,
    workspaceDir: string,
  ): Promise<ExecutionBackendHealth> {
    return buildModalHealth(this.cloudState, settings, workspaceDir);
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
    return runModalCommand(this.cloudState, command, options);
  }
}

export function createModalExecutionBackend(
  cloudState: CloudStateAccessor,
): ExecutionBackend {
  return new ModalExecutionBackend(cloudState);
}
