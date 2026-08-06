import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { Readable } from "node:stream";
import {
  ensureApiTokenForBindHost,
  isAllowedHost,
  isAuthorized,
} from "@elizaos/agent/api/server-helpers-auth";
import { syncResolvedApiPort } from "@elizaos/shared";
import type { AppContext } from "@/runtime/bootstrap";
import {
  applyDoolittleCors,
  isSdkTerminalRequestAuthorized,
} from "@/server/auth";
import { dispatchRuntimePluginRoute } from "@/server/plugin-routes";
import { json } from "@/server/responses";
import { dispatchRouteHandlers } from "@/server/router";
import { apiRouteHandlers } from "@/server/routes";

let activeApiServer: Server | null = null;
let activeApiServerAddress: string | null = null;

export interface ApiServerAddress {
  host: string;
  port: number;
  url: string;
}

let activeApiServerInfo: ApiServerAddress | null = null;

function toWebRequest(
  incoming: IncomingMessage,
  fallbackHost: string,
): Request {
  const host = incoming.headers.host ?? fallbackHost;
  const url = new URL(incoming.url ?? "/", `http://${host}`);
  const method = incoming.method ?? "GET";
  const hasBody = method !== "GET" && method !== "HEAD";
  return new Request(url, {
    method,
    headers: incoming.headers as HeadersInit,
    body: hasBody
      ? (Readable.toWeb(incoming) as ReadableStream<Uint8Array>)
      : undefined,
    ...(hasBody ? { duplex: "half" } : {}),
  } as RequestInit);
}

async function writeWebResponse(
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
    body.once("error", reject);
    outgoing.once("error", reject);
    outgoing.once("finish", resolve);
    body.pipe(outgoing);
  });
}

async function closeActiveServer(): Promise<void> {
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
): Promise<ApiServerAddress> {
  const address = `${context.config.host}:${context.config.port}`;
  if (
    activeApiServer &&
    activeApiServerAddress === address &&
    activeApiServerInfo
  ) {
    return activeApiServerInfo;
  }

  await closeActiveServer();

  // The actual listener configuration is authoritative for Eliza's native
  // host, auth, and CORS helpers even when a caller constructs AppContext
  // directly instead of going through loadConfig().
  process.env.ELIZA_API_BIND = context.config.host;
  ensureApiTokenForBindHost(context.config.host);

  const server = createServer(async (incoming, outgoing) => {
    try {
      const requestPath = new URL(incoming.url ?? "/", "http://localhost")
        .pathname;
      if (!isAllowedHost(incoming)) {
        await writeWebResponse(
          json({ error: "Forbidden host" }, 403),
          outgoing,
        );
        return;
      }
      if (!applyDoolittleCors(incoming, outgoing, requestPath)) {
        await writeWebResponse(
          json({ error: "Forbidden origin" }, 403),
          outgoing,
        );
        return;
      }

      const request = toWebRequest(incoming, address);
      const url = new URL(request.url);
      if (url.pathname === "/chat" || url.pathname === "/v1/responses") {
        incoming.setTimeout(0);
        outgoing.setTimeout(0);
      }

      let response: Response;
      const authorized =
        isAuthorized(incoming) ||
        isSdkTerminalRequestAuthorized(incoming, url.pathname);
      if (request.method === "OPTIONS") {
        response = json({ ok: true });
      } else if (!authorized) {
        response = json({ error: "Unauthorized" }, 401);
      } else {
        response =
          (await dispatchRuntimePluginRoute({
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
          json({ error: "Not found" }, 404);
      }
      await writeWebResponse(response, outgoing);
    } catch (error) {
      if (outgoing.headersSent) {
        outgoing.destroy(error instanceof Error ? error : undefined);
        return;
      }
      await writeWebResponse(
        json(
          {
            error: "Internal server error",
            detail: error instanceof Error ? error.message : String(error),
          },
          500,
        ),
        outgoing,
      );
    }
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

  activeApiServer = server;
  activeApiServerAddress = address;
  const host = context.config.host;
  const port = bound.port;
  // Publish the operating-system-selected port through Eliza's canonical
  // runtime environment contract.
  syncResolvedApiPort(process.env, port);
  const serverInfo: ApiServerAddress = {
    host,
    port,
    url: `http://${host}:${port}`,
  };
  activeApiServerInfo = serverInfo;
  return serverInfo;
}
