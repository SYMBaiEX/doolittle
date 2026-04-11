import type { AppContext } from "@/runtime/bootstrap";
import {
  getNativePluginCatalog,
  groupNativePluginCatalog,
} from "@/runtime/native/plugin-catalog/index";
import { json } from "@/server/responses";
import { resolveOwnership } from "./shared";

export async function handleRuntimeStatusRoutes(
  context: AppContext,
  request: Request,
  url: URL,
): Promise<Response | null> {
  if (request.method === "GET" && url.pathname === "/runtime/status") {
    const settings = context.services.settings.get();
    const catalog = getNativePluginCatalog(context.config);
    const ownership = resolveOwnership(context);
    return json({
      provider: settings.model.provider,
      model: settings.model.model,
      startup: context.services.startupState.getSnapshot(),
      fallback: {
        offlineBootstrapMode: context.config.offlineBootstrapMode,
      },
      plugins: {
        openai: Boolean(context.config.openAiApiKey),
        anthropic: Boolean(context.config.anthropicApiKey),
        pdf: true,
        telegram: Boolean(context.config.telegramBotToken),
      },
      gateway: context.services.gatewayConfig,
      native: {
        catalog,
        grouped: groupNativePluginCatalog(catalog),
        serviceRegistry: context.services.nativeRegistry,
        transportInventory: ownership.transportControl.transportInventory,
        transportControl: ownership.transportControl.totals,
        messagingBridge: ownership.transportControl.messagingBridge,
        ownership: {
          serviceResolution: ownership.serviceResolution,
          pluginManager: ownership.pluginManager,
          identity: ownership.identity,
        },
      },
    });
  }

  if (request.method === "GET" && url.pathname === "/runtime/plugins") {
    const catalog = getNativePluginCatalog(context.config);
    const ownership = resolveOwnership(context);
    return json({
      catalog,
      grouped: groupNativePluginCatalog(catalog),
      serviceRegistry: context.services.nativeRegistry,
      pluginManager: ownership.pluginManager,
      ownership: {
        serviceResolution: ownership.serviceResolution,
        identity: ownership.identity,
      },
    });
  }

  if (request.method === "GET" && url.pathname === "/runtime/compatibility") {
    return json(await context.services.agentSdk.compatibility());
  }

  if (request.method === "GET" && url.pathname === "/runtime/registry") {
    const query = url.searchParams.get("query")?.trim();
    const refresh =
      url.searchParams.get("refresh") === "true" ||
      url.searchParams.get("refresh") === "1";
    return json(
      query
        ? await context.services.agentSdk.searchRegistry(query)
        : await context.services.agentSdk.registry(refresh),
    );
  }

  return null;
}
