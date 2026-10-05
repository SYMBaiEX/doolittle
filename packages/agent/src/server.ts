import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import type { Socket } from "node:net";
import { Readable } from "node:stream";
import {
  ensureApiTokenForBindHost,
  isAllowedHost,
  isAuthorized,
  resolveTerminalRunRejection,
} from "@elizaos/agent/api/server-helpers-auth";
import { syncResolvedApiPort } from "@elizaos/shared";
import { formatLoggerError } from "@/logging/logger";
import type { AppContext } from "@/runtime/bootstrap";
import { readWorkerBotProfile } from "@/runtime/bootstrap/bot-profile";
import {
  applyDoolittleCors,
  isProviderAuthenticatedWebhookRequest,
  remoteTerminalMutationTokenError,
} from "@/server/auth";
import { dispatchRuntimePluginRoute } from "@/server/plugin-routes";
import {
  assertDeclaredRequestBodyLimit,
  RequestBodyTimeoutError,
  RequestBodyTooLargeError,
  readBoundedRequestBody,
  requestBodyFraming,
} from "@/server/request-body";
import { createRequestAbortController } from "@/server/request-lifecycle";
import { json, runResponsePostCommit } from "@/server/responses";
import { dispatchRouteHandlers } from "@/server/router";
import { apiRouteHandlers } from "@/server/routes";
import { handleOperationsRoutes } from "@/server/routes/operations";
import { isWorkerApiRouteAllowed } from "@/server/worker-route-policy";

let activeApiServer: Server | null = null;
let activeApiServerAddress: string | null = null;

export interface ApiServerAddress {
  host: string;
  port: number;
  url: string;
}

export interface ApiServerSecurityOptions {
  headersTimeoutMs?: number;
  maxRequestBodyBytes?: number;
  requestTimeoutMs?: number;
}

export interface OwnedApiServer {
  address: ApiServerAddress;
  close(): Promise<void>;
}

export function internalServerErrorResponse(): Response {
  return json({ error: "Internal server error" }, 500);
}

export function isRequestCancellation(
  _error: unknown,
  signal: AbortSignal,
): boolean {
  return signal.aborted;
}

async function writeEarlyResponse(
  response: Response,
  incoming: IncomingMessage,
  outgoing: ServerResponse,
  forceClose = false,
): Promise<void> {
  const shouldClose = forceClose || requestBodyFraming(incoming).hasBody;
  if (shouldClose) {
    outgoing.shouldKeepAlive = false;
    outgoing.setHeader("connection", "close");
  }
  await writeWebResponse(response, outgoing);
  if (shouldClose && !incoming.complete) incoming.destroy();
}

let activeApiServerInfo: ApiServerAddress | null = null;

function toWebRequest(
  incoming: IncomingMessage,
  fallbackHost: string,
  signal: AbortSignal,
  body: Uint8Array | undefined,
): Request {
  const host = incoming.headers.host ?? fallbackHost;
  const url = new URL(incoming.url ?? "/", `http://${host}`);
  const method = incoming.method ?? "GET";
  const hasBody = method !== "GET" && method !== "HEAD";
  return new Request(url, {
    method,
    headers: incoming.headers as HeadersInit,
    body: hasBody ? body : undefined,
    signal,
  } as RequestInit);
}

export async function writeWebResponse(
  response: Response,
  outgoing: ServerResponse,
): Promise<void> {
  outgoing.statusCode = response.status;
  response.headers.forEach((value, name) => {
    outgoing.setHeader(name, value);
  });
  const setCookies = response.headers.getSetCookie();
  if (setCookies.length) outgoing.setHeader("set-cookie", setCookies);
  if (!response.body) {
    outgoing.end();
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const body = Readable.fromWeb(
      response.body as import("node:stream/web").ReadableStream<Uint8Array>,
    );
    let settled = false;
    const settle = (callback: () => void) => {
      if (settled) return;
      settled = true;
      body.off("error", onBodyError);
      outgoing.off("error", onOutputError);
      outgoing.off("finish", onFinish);
      outgoing.off("close", onClose);
      callback();
    };
    const onBodyError = (error: Error) => settle(() => reject(error));
    const onOutputError = (error: Error) => settle(() => reject(error));
    const onFinish = () => settle(resolve);
    const onClose = () => {
      if (outgoing.writableFinished) {
        settle(resolve);
        return;
      }
      const error = new Error("Client disconnected before response completed.");
      // `destroy()` propagates cancellation to the underlying Web stream.
      // Do not pass `error`: listeners are removed while settling and Node
      // would otherwise surface it as an unhandled source-stream error.
      body.destroy();
      settle(() => reject(error));
    };
    body.once("error", onBodyError);
    outgoing.once("error", onOutputError);
    outgoing.once("finish", onFinish);
    outgoing.once("close", onClose);
    body.pipe(outgoing);
  });
}

/** Runs durable post-response work after either a successful or failed write attempt. */
export async function writeResponseAndRunPostCommit(
  response: Response,
  write: () => Promise<void>,
): Promise<void> {
  try {
    await write();
  } finally {
    runResponsePostCommit(response);
  }
}

export async function stopApiServer(): Promise<void> {
  const server = activeApiServer;
  if (!server) return;
  activeApiServer = null;
  activeApiServerAddress = null;
  activeApiServerInfo = null;
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

export async function startApiServer(
  context: AppContext,
  security: ApiServerSecurityOptions = {},
): Promise<ApiServerAddress> {
  const address = `${context.config.host}:${context.config.port}`;
  if (
    activeApiServer &&
    activeApiServerAddress === address &&
    activeApiServerInfo
  ) {
    return activeApiServerInfo;
  }

  await stopApiServer();

  const owned = await createApiServer(context, security);
  activeApiServer = owned.server;
  activeApiServerAddress = address;
  activeApiServerInfo = owned.address;
  syncResolvedApiPort(process.env, owned.address.port);
  return owned.address;
}

/** Independent listener ownership; the CLI profile never dispatches plugins. */
export async function createApiServer(
  context: AppContext,
  security: ApiServerSecurityOptions & {
    terminalOnly?: boolean;
    shutdownTimeoutMs?: number;
  } = {},
): Promise<OwnedApiServer & { server: Server }> {
  const address = `${context.config.host}:${context.config.port}`;
  const inFlight = new Set<Promise<void>>();
  const requestControllers = new Set<AbortController>();
  const connections = new Set<Socket>();
  const terminalCapability = security.terminalOnly
    ? process.env.ELIZA_TERMINAL_RUN_TOKEN
    : undefined;
  if (
    security.terminalOnly &&
    (context.config.host !== "127.0.0.1" ||
      context.config.port !== 0 ||
      !process.env.ELIZA_TERMINAL_RUN_TOKEN?.trim())
  ) {
    throw new Error(
      "Private terminal transport requires an owned loopback listener and capability.",
    );
  }

  // The actual listener configuration is authoritative for Eliza's native
  // host, auth, and CORS helpers even when a caller constructs AppContext
  // directly instead of going through loadConfig().
  process.env.ELIZA_API_BIND = context.config.host;
  if (!security.terminalOnly) ensureApiTokenForBindHost(context.config.host);

  const server = createServer(
    {
      headersTimeout: security.headersTimeoutMs ?? 60_000,
      requestTimeout: security.requestTimeoutMs ?? 120_000,
    },
    (incoming, outgoing) => {
      const pending = (async () => {
        const requestLifecycle = createRequestAbortController(
          incoming,
          outgoing,
        );
        requestControllers.add(requestLifecycle.controller);
        try {
          const requestPath = new URL(incoming.url ?? "/", "http://localhost")
            .pathname;
          assertDeclaredRequestBodyLimit(
            incoming,
            security.maxRequestBodyBytes,
          );
          if (!isAllowedHost(incoming)) {
            await writeEarlyResponse(
              json({ error: "Forbidden host" }, 403),
              incoming,
              outgoing,
            );
            return;
          }
          if (!applyDoolittleCors(incoming, outgoing, requestPath)) {
            await writeEarlyResponse(
              json({ error: "Forbidden origin" }, 403),
              incoming,
              outgoing,
            );
            return;
          }

          let response: Response;
          const method = incoming.method ?? "GET";
          const workerBot = readWorkerBotProfile();
          const knowledgeBroker =
            process.env.DOOLITTLE_KNOWLEDGE_BROKER === "1";
          const brokerRoute =
            (method === "POST" && requestPath === "/knowledge/documents") ||
            (method === "GET" &&
              /^\/knowledge\/documents\/[0-9a-f-]{36}$/iu.test(requestPath));
          const brokerProbe =
            method === "GET" &&
            ["/health", "/runtime/bot-identity"].includes(requestPath);
          if (
            workerBot &&
            (knowledgeBroker
              ? !(brokerRoute || brokerProbe)
              : !isWorkerApiRouteAllowed(
                  method,
                  requestPath,
                  workerBot.permissions.allowMutation,
                ))
          ) {
            await writeEarlyResponse(
              json({ error: "Not found" }, 404),
              incoming,
              outgoing,
            );
            return;
          }
          if (security.terminalOnly) {
            if (requestPath !== "/api/terminal/run" || method !== "POST") {
              await writeEarlyResponse(
                json({ error: "Not found" }, 404),
                incoming,
                outgoing,
              );
              return;
            }
            if (
              !terminalCapability ||
              process.env.ELIZA_TERMINAL_RUN_TOKEN !== terminalCapability
            ) {
              await writeEarlyResponse(
                json(
                  { error: "Terminal capability is no longer available." },
                  401,
                ),
                incoming,
                outgoing,
              );
              return;
            }
            // SHELL sends its dedicated capability, not an API bearer token.
            const rejection = resolveTerminalRunRejection(incoming, {});
            if (rejection) {
              await writeEarlyResponse(
                json({ error: rejection.reason }, rejection.status),
                incoming,
                outgoing,
              );
              return;
            }
          }
          const authorized = isAuthorized(incoming);
          const providerAuthenticatedWebhook =
            isProviderAuthenticatedWebhookRequest(requestPath, method);
          const bodyFraming = requestBodyFraming(incoming);
          if (
            bodyFraming.hasBody &&
            (method === "GET" || method === "HEAD" || method === "OPTIONS")
          ) {
            await writeEarlyResponse(
              json(
                { error: `${method} requests must not include a body.` },
                400,
              ),
              incoming,
              outgoing,
              true,
            );
            return;
          }
          if (method === "OPTIONS") {
            response = json({ ok: true });
          } else if (
            !security.terminalOnly &&
            !authorized &&
            !providerAuthenticatedWebhook
          ) {
            await writeEarlyResponse(
              json({ error: "Unauthorized" }, 401),
              incoming,
              outgoing,
            );
            return;
          } else {
            const terminalTokenError = remoteTerminalMutationTokenError(
              incoming,
              requestPath,
              method,
            );
            if (terminalTokenError) {
              await writeEarlyResponse(
                json(
                  { error: terminalTokenError.reason },
                  terminalTokenError.status,
                ),
                incoming,
                outgoing,
              );
              return;
            }
            const body = await readBoundedRequestBody(
              incoming,
              security.maxRequestBodyBytes,
              security.requestTimeoutMs,
            );
            if (requestPath === "/chat" || requestPath === "/v1/responses") {
              incoming.setTimeout(0);
              outgoing.setTimeout(0);
            }
            const request = toWebRequest(
              incoming,
              address,
              requestLifecycle.controller.signal,
              body,
            );
            const url = new URL(request.url);
            // Provider callbacks authenticate using their own signed payload or
            // verification token. Route them straight to Doolittle's webhook
            // handlers so a runtime plugin cannot intercept a public endpoint
            // or observe a synthetic API authorization result.
            response = security.terminalOnly
              ? ((await handleOperationsRoutes(context, request, url, {
                  captureOutputRequired: true,
                  expectedTerminalToken: terminalCapability,
                })) ?? json({ error: "Not found" }, 404))
              : providerAuthenticatedWebhook
                ? ((await dispatchRouteHandlers(
                    context,
                    request,
                    url,
                    apiRouteHandlers,
                  )) ?? json({ error: "Not found" }, 404))
                : ((await dispatchRuntimePluginRoute({
                    runtime: context.runtime,
                    request,
                    url,
                    isAuthorized: () => authorized,
                  })) ??
                  (await dispatchRouteHandlers(
                    context,
                    request,
                    url,
                    apiRouteHandlers,
                  )) ??
                  json({ error: "Not found" }, 404));
          }
          if (security.terminalOnly)
            requestLifecycle.controller.signal.throwIfAborted();
          await writeResponseAndRunPostCommit(response, () =>
            writeWebResponse(response, outgoing),
          );
        } catch (error) {
          if (
            isRequestCancellation(error, requestLifecycle.controller.signal)
          ) {
            if (!outgoing.destroyed) outgoing.destroy();
            return;
          }
          if (error instanceof RequestBodyTooLargeError) {
            await writeEarlyResponse(
              json({ error: error.message }, 413),
              incoming,
              outgoing,
              true,
            );
            return;
          }
          if (error instanceof RequestBodyTimeoutError) {
            await writeEarlyResponse(
              json({ error: error.message }, 408),
              incoming,
              outgoing,
              true,
            );
            return;
          }
          if (outgoing.headersSent) {
            outgoing.destroy(error instanceof Error ? error : undefined);
            return;
          }
          context.services.logger.error("api-request-failed", {
            detail: formatLoggerError(error),
            method: incoming.method ?? "GET",
            path: new URL(incoming.url ?? "/", `http://${address}`).pathname,
          });
          await writeWebResponse(internalServerErrorResponse(), outgoing);
        } finally {
          requestControllers.delete(requestLifecycle.controller);
          requestLifecycle.dispose();
        }
      })();
      inFlight.add(pending);
      void pending
        .finally(() => inFlight.delete(pending))
        .catch(() => undefined);
    },
  );

  server.on("connection", (socket) => {
    connections.add(socket);
    socket.once("close", () => connections.delete(socket));
  });
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => reject(error);
    server.once("error", onError);
    server.listen(context.config.port, context.config.host, () => {
      server.off("error", onError);
      resolve();
    });
  });

  const bound = server.address();
  if (!bound || typeof bound === "string") {
    server.close();
    throw new Error("Doolittle API server did not expose a TCP address.");
  }

  const host = context.config.host;
  const port = bound.port;
  const serverInfo: ApiServerAddress = {
    host,
    port,
    url: `http://${host}:${port}`,
  };
  let closing: Promise<void> | undefined;
  return {
    server,
    address: serverInfo,
    close() {
      closing ??= (async () => {
        const closed = new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        });
        for (const controller of requestControllers) controller.abort();
        for (const socket of connections) socket.destroy();
        server.closeAllConnections();
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([
            (async () => {
              await closed;
              while (inFlight.size) await Promise.all([...inFlight]);
            })(),
            new Promise<never>((_, reject) => {
              timer = setTimeout(
                () =>
                  reject(
                    new Error(
                      "Owned terminal endpoint cleanup could not be confirmed.",
                    ),
                  ),
                security.shutdownTimeoutMs ?? 10_000,
              );
            }),
          ]);
        } finally {
          if (timer) clearTimeout(timer);
        }
      })();
      return closing;
    },
  };
}
