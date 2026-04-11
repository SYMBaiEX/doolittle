import type { ExecutionBackendName } from "@/types/execution";
import type { ExecutionBackend } from "../contracts/backend";
import { createDaytonaExecutionBackend } from "./daytona";
import { createModalExecutionBackend } from "./modal";
import type { CloudStateAccessor } from "./store";

export function createCloudExecutionBackends(
  cloudState: CloudStateAccessor,
): Map<ExecutionBackendName, ExecutionBackend> {
  return new Map<ExecutionBackendName, ExecutionBackend>([
    ["daytona", createDaytonaExecutionBackend(cloudState)],
    ["modal", createModalExecutionBackend(cloudState)],
  ]);
}
