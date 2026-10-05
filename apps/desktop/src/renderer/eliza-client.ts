import { ElizaClient } from "@elizaos/ui/api/client-base";
import {
  type AgentRequestTransport,
  bodyToString,
  headersToRecord,
} from "@elizaos/ui/api/transport";
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
          headers: headersToRecord(init.headers),
          body: bodyToString(init.body),
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

export const desktopElizaClient = new ElizaClient(DESKTOP_AGENT_ORIGIN);
desktopElizaClient.setRequestTransport(desktopAgentTransport);

const botClients = new Map<string, ElizaClient>();
function clientFor(botId?: string, origin?: ComputerOrigin): ElizaClient {
  if (origin && origin.botId !== botId)
    throw new Error("Computer request ownership conflicts.");
  if (!botId) return desktopElizaClient;
  if (!/^[a-zA-Z0-9:_-]{1,128}$/u.test(botId))
    throw new Error("Invalid bot owner.");
  const key = JSON.stringify([
    botId,
    origin?.originConversationId,
    origin?.workspacePath,
  ]);
  let client = botClients.get(key);
  if (!client) {
    client = new ElizaClient(DESKTOP_AGENT_ORIGIN);
    client.setRequestTransport(createDesktopAgentTransport(botId, origin));
    if (botClients.size >= 64)
      botClients.delete(botClients.keys().next().value ?? "");
    botClients.set(key, client);
  }
  return client;
}

export async function desktopRequest<T>(
  path: string,
  method: HttpMethod = "GET",
  body?: unknown,
  signal?: AbortSignal,
  timeoutMs = desktopRequestTimeoutMs(path),
  botId?: string,
  origin?: ComputerOrigin,
): Promise<T> {
  return clientFor(botId, origin).fetch<T>(
    path,
    {
      method,
      signal,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
    { timeoutMs },
  );
}
