import { loadGatewayConfig, saveGatewayConfig } from "@/config/gateway";
import type { AppContext } from "@/runtime/bootstrap";
import { readJsonObjectBody } from "@/server/request-body";
import { json } from "@/server/responses";
import type { GatewayConfig } from "@/types";

function applyGatewayConfig(
  context: AppContext,
  gatewayConfig: GatewayConfig,
): void {
  context.services.gatewayConfig = gatewayConfig;
  context.services.diagnostics.updateGatewayConfig(gatewayConfig);
  context.services.nativeOwnership.attachRuntime(
    context.runtime,
    context.services,
    gatewayConfig,
  );
}

export async function handleGatewayConfigRoutes(
  context: AppContext,
  request: Request,
  url: URL,
): Promise<Response | null> {
  if (request.method === "GET" && url.pathname === "/gateway/config") {
    return json({
      gateway: loadGatewayConfig(context.config),
    });
  }

  if (request.method === "POST" && url.pathname === "/gateway/config") {
    const parsed = await readJsonObjectBody(request);
    if (!parsed.ok) {
      return json(
        {
          error:
            parsed.reason === "invalid_json"
              ? "Invalid JSON body"
              : "JSON body must be an object",
        },
        400,
      );
    }
    const body = parsed.value as unknown as GatewayConfig;
    saveGatewayConfig(context.config, body);
    applyGatewayConfig(context, body);
    return json({ ok: true, gateway: body });
  }

  return null;
}
