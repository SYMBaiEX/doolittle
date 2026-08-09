import { ElizaClient } from "@elizaos/ui/api/client-base";
import {
  type AgentRequestTransport,
  bodyToString,
  headersToRecord,
} from "@elizaos/ui/api/transport";
import type { AgentTransportRequest, HttpMethod } from "../shared/contracts";

const DESKTOP_AGENT_ORIGIN = "http://desktop.local";
const DESKTOP_REQUEST_TIMEOUT_MS = 15_000;
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

export const desktopAgentTransport: AgentRequestTransport = {
  async request(url, init) {
    const response = await invokeDesktopTransport(
      {
        path: desktopPath(url),
        method: desktopMethod(init.method),
        headers: headersToRecord(init.headers),
        body: bodyToString(init.body),
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

export const desktopElizaClient = new ElizaClient(DESKTOP_AGENT_ORIGIN);
desktopElizaClient.setRequestTransport(desktopAgentTransport);

export async function desktopRequest<T>(
  path: string,
  method: HttpMethod = "GET",
  body?: unknown,
  signal?: AbortSignal,
  timeoutMs = DESKTOP_REQUEST_TIMEOUT_MS,
): Promise<T> {
  return desktopElizaClient.fetch<T>(
    path,
    {
      method,
      signal,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
    { timeoutMs },
  );
}
