import type {
  AgentTransportResponse,
  BackendState,
} from "../../shared/contracts";
import type { BackendManager } from "../backend";
import {
  apiResponseLimit,
  parseApiPath,
  validateAgentTransportRequest,
} from "./agent-api-policy";

export {
  apiResponseLimit,
  parseApiPath,
  validateAgentTransportRequest,
} from "./agent-api-policy";

import { readBoundedResponseText } from "./runtime-http";

const API_TIMEOUT_MS = 15_000;
const EXTENSION_INSTALL_TIMEOUT_MS = 120_000;
const RUNTIME_TRANSITION_TIMEOUT_MS = 45_000;

type ReadyBackendState = BackendState & {
  phase: "ready";
  url: string;
};

function isReadyBackendState(state: BackendState): state is ReadyBackendState {
  return state.phase === "ready" && Boolean(state.url);
}

function runtimeFetchErrorCode(error: unknown): string {
  let current = error;
  for (let depth = 0; depth < 4; depth += 1) {
    if (!current || typeof current !== "object") return "";
    const record = current as Record<string, unknown>;
    if (typeof record.code === "string") return record.code;
    current = record.cause;
  }
  return "";
}

export function isRecoverableRuntimeFetchError(error: unknown): boolean {
  return new Set(["ECONNRESET", "ECONNREFUSED", "EPIPE", "UND_ERR_SOCKET"]).has(
    runtimeFetchErrorCode(error),
  );
}

export async function waitForReadyBackend(
  backend: BackendManager,
  timeoutMs = RUNTIME_TRANSITION_TIMEOUT_MS,
): Promise<ReadyBackendState> {
  const current = backend.getState();
  if (isReadyBackendState(current)) return current;
  if (current.phase !== "booting") {
    throw new Error("The local runtime is not ready.");
  }

  return new Promise<ReadyBackendState>((resolvePromise, rejectPromise) => {
    let settled = false;
    let unsubscribe: () => void = () => undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const finish = (
      result: { state: ReadyBackendState } | { error: Error },
    ) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      unsubscribe();
      if ("state" in result) resolvePromise(result.state);
      else rejectPromise(result.error);
    };
    const inspect = (state: BackendState) => {
      if (isReadyBackendState(state)) {
        finish({ state });
      } else if (state.phase === "degraded" || state.phase === "stopped") {
        finish({
          error: new Error(
            state.detail || state.message || "The local runtime is not ready.",
          ),
        });
      }
    };
    timeout = setTimeout(
      () =>
        finish({
          error: new Error(
            "Timed out waiting for the local runtime to finish switching projects.",
          ),
        }),
      timeoutMs,
    );
    unsubscribe = backend.subscribe(inspect);
    inspect(backend.getState());
  });
}

export async function fetchBackendApi(
  backend: BackendManager,
  fetchImplementation: typeof fetch,
  path: string,
  init: RequestInit,
  retryDuringRuntimeTransition: boolean,
): Promise<Response> {
  const attempts = retryDuringRuntimeTransition ? 2 : 1;
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    let state = backend.getState();
    if (!isReadyBackendState(state)) {
      if (!retryDuringRuntimeTransition || state.phase !== "booting") {
        throw new Error("The local runtime is not ready.");
      }
      state = await waitForReadyBackend(backend);
    }

    try {
      const response = await fetchImplementation(`${state.url}${path}`, {
        ...init,
        signal: AbortSignal.timeout(
          path === "/runtime/registry/install"
            ? EXTENSION_INSTALL_TIMEOUT_MS
            : API_TIMEOUT_MS,
        ),
      });
      const latest = backend.getState();
      if (
        retryDuringRuntimeTransition &&
        attempt + 1 < attempts &&
        (!isReadyBackendState(latest) || latest.url !== state.url)
      ) {
        await waitForReadyBackend(backend);
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
      const latest = backend.getState();
      const runtimeChanged =
        !isReadyBackendState(latest) || latest.url !== state.url;
      if (
        !retryDuringRuntimeTransition ||
        attempt + 1 >= attempts ||
        (!runtimeChanged && !isRecoverableRuntimeFetchError(error))
      ) {
        throw error;
      }
      await waitForReadyBackend(backend);
    }
  }

  throw lastError;
}

export async function requestAgentTransport(
  backend: BackendManager,
  fetchImplementation: typeof fetch,
  unsafeRequest: unknown,
): Promise<AgentTransportResponse> {
  const request = validateAgentTransportRequest(unsafeRequest);
  const path = parseApiPath(request.path, request.method);
  const response = await fetchBackendApi(
    backend,
    fetchImplementation,
    path,
    {
      method: request.method,
      headers: request.headers,
      body: request.body ?? undefined,
    },
    request.method === "GET",
  );
  const body = await readBoundedResponseText(response, apiResponseLimit(path));
  const headers: Record<string, string> = {};
  response.headers.forEach((value, name) => {
    if (name !== "set-cookie" && name !== "set-cookie2") headers[name] = value;
  });
  return {
    status: response.status,
    statusText: response.statusText,
    headers,
    body,
  };
}
