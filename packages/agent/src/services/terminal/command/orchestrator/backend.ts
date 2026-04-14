import type {
  ExecutionBackendName,
  ExecutionBackendPreview,
} from "@/types/execution";
import type { RuntimeSettings } from "../../../settings/runtime-settings";
import type { ExecutionBackend } from "../../contracts/backend";

export function resolveConfiguredBackend(
  backends: Map<ExecutionBackendName, ExecutionBackend>,
  settings: RuntimeSettings,
): ExecutionBackend {
  const backendName = settings.execution.backend as ExecutionBackendName;
  const backend = backends.get(backendName) ?? backends.get("local");
  if (!backend) {
    throw new Error("No execution backend is available.");
  }
  return backend;
}

export function resolveLocalBackend(
  backends: Map<ExecutionBackendName, ExecutionBackend>,
): ExecutionBackend {
  const backend = backends.get("local");
  if (!backend) {
    throw new Error("No local execution backend is available.");
  }
  return backend;
}

export function previewWithBackend(input: {
  backend: ExecutionBackend;
  command: string;
  settings: RuntimeSettings;
  timeoutMs: number;
  workspaceDir: string;
}): ExecutionBackendPreview {
  return input.backend.preview(input.command, {
    cwd: input.workspaceDir,
    timeoutMs: input.timeoutMs,
    settings: input.settings,
  });
}
