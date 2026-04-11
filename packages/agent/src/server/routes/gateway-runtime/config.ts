import { loadGatewayConfig, saveGatewayConfig } from "@/config/gateway";
import type { AppContext } from "@/runtime/bootstrap";
import { json } from "@/server/responses";
import { DiagnosticsService } from "@/services/diagnostics/service";
import { OperatorService } from "@/services/operator/service";
import { RepositoryService } from "@/services/repository-service";
import type { GatewayConfig } from "@/types";

function rebuildGatewayServices(
  context: AppContext,
  gatewayConfig: GatewayConfig,
): void {
  context.services.gatewayConfig = gatewayConfig;
  context.services.nativeOwnership.attachRuntime(
    context.runtime,
    context.services,
    gatewayConfig,
  );
  context.services.diagnostics = new DiagnosticsService(
    context.config,
    gatewayConfig,
    context.services.agentSdk,
    context.services.nativeOwnership,
    context.services.ecosystem,
    context.services.settings,
    context.services.runController,
    context.services.startupState,
    context.services.awareness,
  );
  context.services.diagnostics.attachRuntime(context.runtime);
  context.services.operator = new OperatorService(
    context.config,
    context.services.diagnostics,
    new RepositoryService(context.config.workspaceDir),
    context.services.autocoderPipeline,
    context.services.agentSdk,
    context.services.nativeOwnership,
    context.services.ecosystem,
  );
  context.services.operator.attachRuntime(context.runtime);
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
    const body = (await request.json()) as GatewayConfig;
    saveGatewayConfig(context.config, body);
    rebuildGatewayServices(context, body);
    return json({ ok: true, gateway: body });
  }

  return null;
}
