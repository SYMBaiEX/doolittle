import type { AppContext } from "@/runtime/bootstrap";
import {
  getCommandCatalogEntries,
  normalizeSlashCommandSyntax,
} from "@/runtime/command-catalog";
import {
  getNativePluginCatalog,
  groupNativePluginCatalog,
} from "@/runtime/native/plugin-catalog";
import { json } from "@/server/responses";
import { hasAsciiControlCharacters } from "@/utils/text-validation";
import { resolveOwnership } from "./shared";

export async function handleRuntimeStatusRoutes(
  context: AppContext,
  request: Request,
  url: URL,
): Promise<Response | null> {
  if (request.method === "GET" && url.pathname === "/commands/catalog") {
    return json({
      commands: getCommandCatalogEntries(context.config.workspaceDir).map(
        (entry) => {
          const normalized = normalizeSlashCommandSyntax(entry.command);
          return {
            ...entry,
            aliases:
              normalized === entry.command
                ? entry.aliases
                : [...(entry.aliases ?? []), normalized],
          };
        },
      ),
    });
  }

  if (request.method === "GET" && url.pathname === "/runtime/status") {
    const settings = context.services.settings.get();
    const catalog = getNativePluginCatalog(context.config);
    const ownership = resolveOwnership(context);
    return json({
      provider: settings.model.provider,
      model: settings.model.model,
      ...(settings.model.reasoningEffort
        ? { reasoningEffort: settings.model.reasoningEffort }
        : {}),
      startup: context.services.startupState.getSnapshot(),
      fallback: {
        offlineBootstrapMode: context.config.offlineBootstrapMode,
      },
      plugins: {
        openai: Boolean(context.config.openAiApiKey),
        anthropic: Boolean(context.config.anthropicApiKey),
        pdf: true,
        browser: true,
        telegram: Boolean(context.config.telegramBotToken),
        discord: Boolean(context.config.discordBotToken),
        slack: Boolean(
          context.config.slackBotToken && context.config.slackAppToken,
        ),
        whatsapp: Boolean(
          context.config.whatsappAccessToken &&
            context.config.whatsappPhoneNumberId &&
            context.config.whatsappVerifyToken,
        ),
        signal: Boolean(context.config.signalAccountNumber),
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
    const views = url.searchParams.getAll("view");
    if (
      [...url.searchParams.keys()].some((key) => key !== "view") ||
      views.length > 1 ||
      (views.length === 1 && views[0] !== "catalog")
    ) {
      return json({ error: "Unsupported plugin catalog query." }, 400);
    }
    if (views[0] === "catalog") return json({ catalog });
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
    if (
      [...url.searchParams.keys()].some(
        (key) => key !== "query" && key !== "refresh",
      ) ||
      url.searchParams.getAll("query").length > 1 ||
      url.searchParams.getAll("refresh").length > 1
    ) {
      return json({ error: "Unsupported registry query." }, 400);
    }
    const rawQuery = url.searchParams.get("query");
    const query = rawQuery?.trim();
    if (
      (rawQuery !== null &&
        (!query || query.length > 128 || hasAsciiControlCharacters(query))) ||
      (url.searchParams.has("refresh") &&
        !["true", "false", "1", "0"].includes(
          url.searchParams.get("refresh") ?? "",
        ))
    ) {
      return json({ error: "Invalid registry query." }, 400);
    }
    const refresh =
      url.searchParams.get("refresh") === "true" ||
      url.searchParams.get("refresh") === "1";
    if (query && refresh) await context.services.agentSdk.registry(true);
    return json(
      query
        ? await context.services.agentSdk.searchRegistry(query)
        : await context.services.agentSdk.registry(refresh),
    );
  }

  if (
    request.method === "POST" &&
    url.pathname === "/runtime/registry/install"
  ) {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json({ error: "a valid JSON body is required" }, 400);
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return json({ error: "a JSON object is required" }, 400);
    }
    const record = body as Record<string, unknown>;
    const unknownField = Object.keys(record).find(
      (field) =>
        !["name", "packageName", "version", "approved"].includes(field),
    );
    const name = typeof record.name === "string" ? record.name.trim() : "";
    const packageName =
      typeof record.packageName === "string" ? record.packageName.trim() : "";
    const version =
      typeof record.version === "string" ? record.version.trim() : "";
    if (
      unknownField ||
      !name ||
      name.length > 214 ||
      !packageName ||
      packageName.length > 214 ||
      !version ||
      version.length > 128 ||
      /[\r\n\0]/u.test(`${name}${packageName}${version}`) ||
      record.approved !== true
    ) {
      return json(
        {
          error:
            "name, packageName, version, and explicit approved=true are required",
        },
        400,
      );
    }
    try {
      const result = await context.services.agentSdk.installRegistryExtension({
        name,
        packageName,
        version,
        approved: true,
      });
      return json(result, result.status);
    } catch (error) {
      return json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Eliza could not install the registry plugin",
        },
        422,
      );
    }
  }

  return null;
}
