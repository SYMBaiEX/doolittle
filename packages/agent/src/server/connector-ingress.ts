import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { isProviderAuthenticatedWebhookRequest } from "./auth";
import {
  RequestBodyTimeoutError,
  RequestBodyTooLargeError,
  readBoundedRequestBody,
  requestBodyFraming,
} from "./request-body";
import { createRequestAbortController } from "./request-lifecycle";
import { json, runResponsePostCommit } from "./responses";
import {
  handleProviderWebhookRoute,
  type ProviderWebhookContext,
} from "./routes/webhooks/provider";

const LOOPBACK = "127.0.0.1";
const MAX_BODY_BYTES = 1024 * 1024;
const REQUEST_TIMEOUT_MS = 10_000;
const SIGNATURE_HEADERS = [
  "x-slack-request-timestamp",
  "x-slack-signature",
  "x-hub-signature-256",
];

export interface ConnectorIngressOptions {
  port: number;
  workspaceIsCurrent: () => boolean;
}

export interface OwnedConnectorIngress {
  url: string;
  close(): Promise<void>;
}

export function parseConnectorIngressPort(raw: string | undefined) {
  if (raw === undefined || raw === "") return undefined;
  const port = Number(raw);
  if (!/^\d{4,5}$/u.test(raw) || port < 1024 || port > 65_535) {
    throw new Error(
      "Connector ingress port must be an integer from 1024 to 65535.",
    );
  }
  return port;
}

function providerTarget(incoming: IncomingMessage): URL | undefined {
  const target = incoming.url ?? "";
  if (target.length > 2048 || /[#\\\p{Cc}\s]/u.test(target)) return undefined;
  const pathname = target.split("?", 1)[0];
  const method = incoming.method ?? "";
  if (
    !isProviderAuthenticatedWebhookRequest(pathname, method) ||
    (method === "POST" && pathname !== target)
  )
    return undefined;
  // Match the raw HTTP target before parsing. Dot segments, encoded paths,
  // absolute URLs and alternate path spellings never reach a route handler.
  return new URL(target, `http://${LOOPBACK}`);
}

/** This listener never shares the owner API router, authorization, or plugins. */
export async function startConnectorIngress(
  context: ProviderWebhookContext,
  options: ConnectorIngressOptions,
  writeResponse: (
    response: Response,
    outgoing: ServerResponse,
  ) => Promise<void>,
): Promise<OwnedConnectorIngress> {
  if (parseConnectorIngressPort(String(options.port)) === undefined) {
    throw new Error("Connector ingress port is required.");
  }
  if (!context.config.slackSigningSecret && !context.config.whatsappAppSecret) {
    throw new Error(
      "Configure SLACK_SIGNING_SECRET or WHATSAPP_APP_SECRET before starting connector ingress.",
    );
  }

  const inFlight = new Set<Promise<void>>();
  const server = createServer(
    {
      headersTimeout: REQUEST_TIMEOUT_MS,
      requestTimeout: REQUEST_TIMEOUT_MS,
      connectionsCheckingInterval: 5_000,
      keepAliveTimeout: 3_000,
      maxHeaderSize: 8 * 1024,
    },
    (incoming, outgoing) => {
      const lifecycle = createRequestAbortController(incoming, outgoing);
      const { signal } = lifecycle.controller;
      const pending = (async () => {
        let response: Response;
        try {
          const url = providerTarget(incoming);
          if (!url) response = json({ error: "Not found" }, 404);
          else if (incoming.headers.origin !== undefined) {
            response = json({ error: "Browser origins are forbidden" }, 403);
          } else if (
            incoming.method === "GET" &&
            requestBodyFraming(incoming).hasBody
          ) {
            response = json({ error: "Unexpected request body" }, 400);
          } else if (!options.workspaceIsCurrent()) {
            response = json({ error: "Connector workspace unavailable" }, 503);
          } else {
            const body =
              incoming.method === "POST"
                ? await readBoundedRequestBody(
                    incoming,
                    MAX_BODY_BYTES,
                    REQUEST_TIMEOUT_MS,
                  )
                : undefined;
            if (signal.aborted) return;
            if (!options.workspaceIsCurrent()) {
              response = json(
                { error: "Connector workspace unavailable" },
                503,
              );
            } else {
              const headers = new Headers();
              for (const name of SIGNATURE_HEADERS) {
                const value = incoming.headers[name];
                if (typeof value === "string") headers.set(name, value);
              }
              response =
                (await handleProviderWebhookRoute(
                  context,
                  new Request(url, {
                    method: incoming.method,
                    headers,
                    body: body ? Buffer.from(body) : undefined,
                    signal,
                  }),
                  url,
                )) ?? json({ error: "Not found" }, 404);
            }
          }
        } catch (error) {
          if (signal.aborted) return;
          if (error instanceof RequestBodyTooLargeError) {
            response = json({ error: "Request body is too large" }, 413);
          } else if (error instanceof RequestBodyTimeoutError) {
            response = json({ error: "Request body timed out" }, 408);
          } else {
            // The raw URL can contain Meta's verification token. Do not log
            // the URL, provider payload, request headers, or parser errors.
            response = json({ error: "Connector ingress is unavailable" }, 503);
            response.headers.set("retry-after", "1");
          }
        }
        try {
          outgoing.shouldKeepAlive = false;
          outgoing.setHeader("connection", "close");
          outgoing.setHeader("cache-control", "no-store");
          outgoing.setHeader("x-content-type-options", "nosniff");
          if (!outgoing.destroyed) await writeResponse(response, outgoing);
        } finally {
          if (!incoming.complete) incoming.destroy();
          runResponsePostCommit(response);
        }
      })();
      inFlight.add(pending);
      void pending
        .finally(() => {
          inFlight.delete(pending);
          lifecycle.dispose();
        })
        .catch(() => {
          if (!outgoing.destroyed) outgoing.destroy();
        });
    },
  );
  server.maxConnections = 64;
  server.on("upgrade", (_request, socket) => socket.destroy());
  server.on("connect", (_request, socket) => socket.destroy());
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, LOOPBACK, () => {
      server.removeListener("error", reject);
      resolve();
    });
  });
  let closing: Promise<void> | undefined;
  return {
    url: `http://${LOOPBACK}:${options.port}`,
    close() {
      closing ??= (async () => {
        const closed = new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        });
        server.closeAllConnections();
        await closed;
        await Promise.allSettled(inFlight);
      })();
      return closing;
    },
  };
}
