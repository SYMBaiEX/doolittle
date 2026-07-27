import type { AppContext } from "@/runtime/bootstrap";
import { isApiRequestAuthorized } from "@/server/auth";
import { json } from "@/server/responses";
import { dispatchRouteHandlers } from "@/server/router";
import { apiRouteHandlers } from "@/server/routes";

let activeApiServer: ReturnType<typeof Bun.serve> | null = null;
let activeApiServerAddress: string | null = null;

export interface ApiServerAddress {
  host: string;
  port: number;
  url: string;
}

let activeApiServerInfo: ApiServerAddress | null = null;

export function startApiServer(context: AppContext): ApiServerAddress {
  const address = `${context.config.host}:${context.config.port}`;
  if (
    activeApiServer &&
    activeApiServerAddress === address &&
    activeApiServerInfo
  ) {
    return activeApiServerInfo;
  }

  if (activeApiServer) {
    activeApiServer.stop(true);
    activeApiServer = null;
    activeApiServerAddress = null;
    activeApiServerInfo = null;
  }

  activeApiServer = Bun.serve({
    hostname: context.config.host,
    port: context.config.port,
    fetch: async (request, server) => {
      const url = new URL(request.url);
      if (url.pathname === "/chat" || url.pathname === "/v1/responses") {
        // Local models and tool-running turns can remain quiet while they
        // reason. Bun's ten-second default idle timeout would otherwise sever
        // the SSE response and leave the turn writing into a closed stream.
        server.timeout(request, 0);
      }

      if (request.method === "OPTIONS") {
        return json({ ok: true });
      }

      if (
        !isApiRequestAuthorized(
          { host: context.config.host, apiToken: context.config.apiToken },
          request,
        )
      ) {
        return json({ error: "Unauthorized" }, 401);
      }

      const response = await dispatchRouteHandlers(
        context,
        request,
        url,
        apiRouteHandlers,
      );
      if (response) {
        return response;
      }

      return json({ error: "Not found" }, 404);
    },
  });
  activeApiServerAddress = address;
  const host = activeApiServer.hostname ?? context.config.host;
  const port = activeApiServer.port ?? context.config.port;
  const serverInfo: ApiServerAddress = {
    host,
    port,
    url: `http://${host}:${port}`,
  };
  activeApiServerInfo = serverInfo;
  return serverInfo;
}
