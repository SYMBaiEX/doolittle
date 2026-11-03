import { isExecutionBackendName } from "@doolittle/contracts/execution";
import type {
  ExecutionBackendName,
  ExecutionBackendPreview,
} from "../../../../types/execution";
import type { RuntimeSettings } from "../../../settings/runtime-settings";
import type { ExecutionBackend } from "../../contracts/backend";

export class ExecutionBackendUnavailableError extends Error {
  readonly code = "EXECUTION_BACKEND_UNAVAILABLE";

  constructor(readonly backend: string) {
    super(
      `The configured execution backend ${JSON.stringify(backend)} is unavailable. No local fallback was selected.`,
    );
    this.name = "ExecutionBackendUnavailableError";
  }
}

export class TerminalCancellationUnavailableError extends Error {
  readonly code = "TERMINAL_CANCELLATION_UNAVAILABLE";

  constructor() {
    super(
      "Owned CLI terminal cancellation is unavailable for this execution capability. Only the local backend in SDK local-yolo mode supports captured-command cancellation; execution policy was not changed.",
    );
    this.name = "TerminalCancellationUnavailableError";
  }
}

function requireBackend(
  backends: Map<ExecutionBackendName, ExecutionBackend>,
  name: string,
): ExecutionBackend {
  if (!isExecutionBackendName(name)) {
    throw new ExecutionBackendUnavailableError(name);
  }
  const backend = backends.get(name);
  if (!backend || backend.name !== name) {
    throw new ExecutionBackendUnavailableError(name);
  }
  return backend;
}

export function resolveConfiguredBackend(
  backends: Map<ExecutionBackendName, ExecutionBackend>,
  settings: RuntimeSettings,
): ExecutionBackend {
  return requireBackend(backends, settings.execution.backend);
}

/** Local execution is selected only by an explicit local operation. */
export function resolveLocalBackend(
  backends: Map<ExecutionBackendName, ExecutionBackend>,
): ExecutionBackend {
  return requireBackend(backends, "local");
}

export function requireOwnedCancellation(
  backend: ExecutionBackend,
  signal?: AbortSignal,
): void {
  signal?.throwIfAborted();
  if (!signal || !backend.capabilities().ownedCancellation) {
    throw new TerminalCancellationUnavailableError();
  }
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
