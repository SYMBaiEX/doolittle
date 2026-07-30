import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { Readable } from "node:stream";
import type { AppContext } from "@/runtime/bootstrap";
import {
  isApiRequestAuthorized,
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

export function publishElizaApiPort(
  port: number,
  env: NodeJS.ProcessEnv = process.env,
): void {
  env.ELIZA_PORT = String(port);
}

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

  const server = createServer(async (incoming, outgoing) => {
    try {
      const request = toWebRequest(incoming, address);
      const url = new URL(request.url);
      if (url.pathname === "/chat" || url.pathname === "/v1/responses") {
        incoming.setTimeout(0);
        outgoing.setTimeout(0);
      }

      let response: Response;
      if (request.method === "OPTIONS") {
        response = json({ ok: true });
      } else if (
        !(
          isApiRequestAuthorized(
            { host: context.config.host, apiToken: context.config.apiToken },
            request,
          ) || isSdkTerminalRequestAuthorized(request)
        )
      ) {
        response = json({ error: "Unauthorized" }, 401);
      } else {
        response =
          (await dispatchRuntimePluginRoute({
            runtime: context.runtime,
            request,
            url,
            isAuthorized: () =>
              isApiRequestAuthorized(
                {
                  host: context.config.host,
                  apiToken: context.config.apiToken,
                },
                request,
              ) || isSdkTerminalRequestAuthorized(request),
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
  // Official Eliza actions resolve their in-process API target from
  // ELIZA_PORT. Doolittle can bind to port 0, so publish the actual bound port
  // only after Node has selected it.
  publishElizaApiPort(port);
  const serverInfo: ApiServerAddress = {
    host,
    port,
    url: `http://${host}:${port}`,
  };
  activeApiServerInfo = serverInfo;
  return serverInfo;
}
