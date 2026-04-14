import type {
  ExecutionBackendHealth,
  ExecutionBackendPreview,
} from "@/types/execution";
import type { RuntimeSettings } from "../../settings/runtime-settings";
import type { ExecutionBackend } from "../contracts/backend";
import {
  getContainerExecutionBackendHealth,
  previewContainerExecutionBackend,
  runContainerExecutionBackend,
} from "./container-runtime";
import { CONTAINER_BACKEND_SPECS } from "./container-specs";
import type { ContainerBackendSpec } from "./container-types";

class ContainerExecutionBackend implements ExecutionBackend {
  readonly name: ContainerBackendSpec["name"];

  constructor(private readonly spec: ContainerBackendSpec) {
    this.name = spec.name;
  }

  preview(
    command: string,
    options: { cwd: string; timeoutMs: number; settings: RuntimeSettings },
  ): ExecutionBackendPreview {
    return previewContainerExecutionBackend(this.spec, command, options);
  }

  health(
    settings: RuntimeSettings,
    workspaceDir: string,
  ): Promise<ExecutionBackendHealth> {
    return getContainerExecutionBackendHealth(
      this.spec,
      settings,
      workspaceDir,
    );
  }

  run(
    command: string,
    options: {
      cwd: string;
      timeoutMs: number;
      settings: RuntimeSettings;
      abortSignal?: AbortSignal;
    },
  ) {
    return runContainerExecutionBackend(this.spec, command, options);
  }
}

export function createContainerExecutionBackends(): ExecutionBackend[] {
  return CONTAINER_BACKEND_SPECS.map(
    (spec) => new ContainerExecutionBackend(spec),
  );
}
