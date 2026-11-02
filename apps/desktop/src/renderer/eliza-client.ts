import { ApiError } from "@elizaos/ui/api/client-types";
import type { AgentRequestTransport } from "@elizaos/ui/api/transport";
import { createFetch, FetchError } from "ofetch";
import {
  type AgentTransportRequest,
  desktopRequestTimeoutMs,
  type HttpMethod,
} from "../shared/contracts";
import type { ComputerOrigin } from "./computer-origin";

const DESKTOP_AGENT_ORIGIN = "http://desktop.local";
const DESKTOP_HTTP_METHODS = new Set<HttpMethod>([
  "GET",
  "POST",
  "PATCH",
  "DELETE",
]);

function desktopPath(url: string): string {
  const parsed = new URL(url, DESKTOP_AGENT_ORIGIN);
  if (parsed.origin !== DESKTOP_AGENT_ORIGIN) {
    throw new Error("Eliza desktop transport only accepts local agent URLs.");
  }
  return `${parsed.pathname}${parsed.search}`;
}

function desktopMethod(method: string | undefined): HttpMethod {
  const normalized = (method ?? "GET").toUpperCase();
  if (!DESKTOP_HTTP_METHODS.has(normalized as HttpMethod)) {
    throw new Error(`Unsupported Eliza desktop method: ${normalized}`);
  }
  return normalized as HttpMethod;
}

async function invokeDesktopTransport(
  request: AgentTransportRequest,
  signal: AbortSignal | null | undefined,
) {
  if (signal?.aborted) {
    throw new DOMException(
      "The Eliza desktop request was aborted.",
      "AbortError",
    );
  }

  const pending = window.doolittle.requestAgent(request);
  if (!signal) return pending;

  return new Promise<Awaited<typeof pending>>((resolve, reject) => {
    const onAbort = () => {
      void window.doolittle
        .cancelAgentRequest(request.requestId, request.botId)
        .catch(() => {
          // The renderer cancellation result is authoritative; IPC teardown may
          // race request completion or application shutdown.
        });
      reject(
        new DOMException(
          "The Eliza desktop request was aborted.",
          "AbortError",
        ),
      );
    };
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) onAbort();
    void pending.then(resolve, reject).finally(() => {
      signal.removeEventListener("abort", onAbort);
    });
  });
}

export function createDesktopAgentTransport(
  botId?: string,
  origin?: ComputerOrigin,
): AgentRequestTransport {
  if (origin && origin.botId !== botId)
    throw new Error("Computer request ownership conflicts.");
  const capturedOrigin = origin ? { ...origin } : undefined;
  return {
    async request(url, init) {
      const response = await invokeDesktopTransport(
        {
          requestId: crypto.randomUUID(),
          path: desktopPath(url),
          method: desktopMethod(init.method),
          headers: Object.fromEntries(new Headers(init.headers).entries()),
          body:
            typeof init.body === "string" || init.body == null
              ? init.body
              : init.body instanceof URLSearchParams
                ? init.body.toString()
                : undefined,
          ...(botId ? { botId } : {}),
          ...(capturedOrigin
            ? {
                originConversationId: capturedOrigin.originConversationId,
                workspacePath: capturedOrigin.workspacePath,
              }
            : {}),
        },
        init.signal,
      );

      return new Response(response.body || null, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    },
  };
}

export const desktopAgentTransport = createDesktopAgentTransport();

export async function desktopRequest<T>(
  path: string,
  method: HttpMethod = "GET",
  body?: unknown,
  signal?: AbortSignal,
  timeoutMs = desktopRequestTimeoutMs(path),
  botId?: string,
  origin?: ComputerOrigin,
): Promise<T> {
  if (botId && !/^[a-zA-Z0-9:_-]{1,128}$/u.test(botId))
    throw new Error("Invalid bot owner.");
  const transport = createDesktopAgentTransport(botId, origin);
  const request = createFetch({
    fetch: (url, init) => transport.request(String(url), init ?? {}),
  });
  try {
    return await request<T>(path, {
      method,
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)])
        : AbortSignal.timeout(timeoutMs),
      retry: 0,
      parseResponse: JSON.parse,
      headers: { "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch (error) {
    if (!(error instanceof FetchError) || !error.response) throw error;
    const payload = error.data;
    throw new ApiError({
      kind: "http",
      path,
      status: error.response.status,
      message:
        typeof payload?.error === "string" ? payload.error : error.message,
      code: typeof payload?.code === "string" ? payload.code : undefined,
      cause: error,
    });
  }
}
