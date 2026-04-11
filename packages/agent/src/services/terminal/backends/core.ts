import type { ExecutionBackendName } from "@/types/execution";
import type { ExecutionBackend } from "../contracts/backend";
import { createContainerExecutionBackends } from "./container";
import { createLocalExecutionBackend } from "./local";
import { createSingularityExecutionBackend } from "./singularity";
import { createSshExecutionBackend } from "./ssh";

export function createCoreExecutionBackends(): Map<
  ExecutionBackendName,
  ExecutionBackend
> {
  const containerBackends: Array<[ExecutionBackendName, ExecutionBackend]> =
    createContainerExecutionBackends().map((backend) => [
      backend.name,
      backend,
    ]);
  return new Map<ExecutionBackendName, ExecutionBackend>([
    ["local", createLocalExecutionBackend()],
    ...containerBackends,
    ["ssh", createSshExecutionBackend()],
    ["singularity", createSingularityExecutionBackend()],
  ]);
}
