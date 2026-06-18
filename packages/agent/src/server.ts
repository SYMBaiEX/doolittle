import type { AppContext } from "@/runtime/bootstrap";
import { isApiRequestAuthorized } from "@/server/auth";
import { json } from "@/server/responses";
import { dispatchRouteHandlers } from "@/server/router";
import { apiRouteHandlers } from "@/server/routes";

let activeApiServer: ReturnType<typeof Bun.serve> | null = null;
let activeApiServerAddress: string | null = null;

export function startApiServer(context: AppContext): void {
  const address = `${context.config.host}:${context.config.port}`;
  if (activeApiServer && activeApiServerAddress === address) {
    return;
  }

  if (activeApiServer) {
    activeApiServer.stop(true);
    activeApiServer = null;
    activeApiServerAddress = null;
  }

  activeApiServer = Bun.serve({
    hostname: context.config.host,
    port: context.config.port,
    fetch: async (request) => {
      const url = new URL(request.url);

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
}
