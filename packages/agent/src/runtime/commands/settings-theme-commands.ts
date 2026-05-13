import {
  activateLinkedProvider,
  type LinkedProviderName,
  resolveLinkedProviderName,
  syncProviderSettings,
} from "@/runtime/linked-provider-accounts";
import { getEffectiveShellStatus } from "@/runtime/native/service-bridge/tooling";
import {
  DEFAULT_TUI_THEME,
  getTuiTheme,
  listTuiThemes,
  nextTuiTheme,
  previousTuiTheme,
  resolveTuiThemeName,
} from "@/runtime/theme-catalog";
import type { AgentExecutionContext } from "../chat";

type ModelRoute = {
  id: "ollama" | LinkedProviderName;
  label: string;
  model: string;
  baseUrl: string;
  mode: "local" | "linked" | "cloud";
  ready: boolean;
  detail: string;
};

function coerceSettingValue(raw: string): boolean | number | string {
  if (raw === "true") {
    return true;
  }
  if (raw === "false") {
    return false;
  }
  return Number.isNaN(Number(raw)) ? raw : Number(raw);
}

function modelRoutes(context: AgentExecutionContext): ModelRoute[] {
  const config = context.config;
  const activeProvider = context.services.settings.get().model.provider;
  return [
    {
      id: "ollama",
      label: "Ollama",
      model: config.ollamaLargeModel,
      baseUrl: config.ollamaApiEndpoint,
      mode: "local",
      ready: Boolean(config.ollamaApiEndpoint?.trim()),
      detail: config.ollamaApiEndpoint?.trim()
        ? "local model inference and embeddings"
        : "OLLAMA_API_ENDPOINT is not configured",
    },
    {
      id: "devin",
      label: "Devin SWE",
      model: config.devinModel,
      baseUrl: "",
      mode: "linked",
      ready: activeProvider === "devin",
      detail: "linked Devin CLI provider route",
    },
    {
      id: "codex",
      label: "Codex",
      model: "gpt-5.4",
      baseUrl: "",
      mode: "linked",
      ready: activeProvider === "codex",
      detail: "linked Codex specialist route",
    },
    {
      id: "claude-code",
      label: "Claude Code",
      model: "claude-sonnet-4.6",
      baseUrl: "",
      mode: "linked",
      ready: activeProvider === "claude-code",
      detail: "linked Claude Code specialist route",
    },
    {
      id: "elizacloud",
      label: "Eliza Cloud",
      model: config.elizaCloudLargeModel,
      baseUrl: config.elizaCloudBaseUrl,
      mode: "cloud",
      ready: activeProvider === "elizacloud",
      detail: "managed Eliza Cloud inference route",
    },
  ];
}

function renderModelStatus(context: AgentExecutionContext): string {
  const settings = context.services.settings.get().model;
  const routes = modelRoutes(context);
  return [
    "MODEL ROUTING",
    `active: ${settings.provider} / ${settings.model}`,
    settings.baseUrl
      ? `baseUrl: ${settings.baseUrl}`
      : "baseUrl: provider default",
    `temperature: ${settings.temperature}`,
    `maxTokens: ${settings.maxTokens}`,
    "",
    "Use `/model list` to inspect routes or `/model use <provider> [model]` to switch.",
    "",
    ...routes.map(
      (route) =>
        `- ${route.id}${route.id === settings.provider ? " *active*" : ""} [${route.mode}] model=${route.model} ready=${route.ready ? "yes" : "check"} :: ${route.detail}`,
    ),
  ].join("\n");
}

function renderModelList(context: AgentExecutionContext): string {
  return modelRoutes(context)
    .map(
      (route) =>
        `- ${route.id} (${route.label}) [${route.mode}] default=${route.model} ready=${route.ready ? "yes" : "check"}${route.baseUrl ? ` baseUrl=${route.baseUrl}` : ""}\n  ${route.detail}`,
    )
    .join("\n");
}

function activateOllamaRoute(
  context: AgentExecutionContext,
  modelOverride?: string,
): string {
  const model = modelOverride || context.config.ollamaLargeModel;
  context.services.settings.set("model.provider", "ollama");
  context.services.settings.set("model.model", model);
  context.services.settings.set(
    "model.baseUrl",
    context.config.ollamaApiEndpoint,
  );
  const settings = context.services.settings.get();
  syncProviderSettings(context, settings);
  return [
    "Activated Ollama local inference.",
    `model: ${model}`,
    `baseUrl: ${context.config.ollamaApiEndpoint || "not configured"}`,
    `embeddings: ${context.config.ollamaEmbeddingModel}`,
  ].join("\n");
}

function activateLinkedRoute(
  context: AgentExecutionContext,
  provider: LinkedProviderName,
  modelOverride?: string,
): string {
  const activated = activateLinkedProvider(context, provider);
  if (modelOverride) {
    context.services.settings.set("model.model", modelOverride);
    syncProviderSettings(context, context.services.settings.get());
  }
  const settings = context.services.settings.get().model;
  return [
    provider === "elizacloud"
      ? "Activated Eliza Cloud managed inference."
      : `Activated ${provider} specialist inference.`,
    `model: ${settings.model || activated.model}`,
    settings.baseUrl
      ? `baseUrl: ${settings.baseUrl}`
      : "baseUrl: provider default",
  ].join("\n");
}

export async function handleSettingsThemeCommand(
  trimmed: string,
  context: AgentExecutionContext,
): Promise<string | undefined> {
  if (trimmed === "/model" || trimmed === "/model status") {
    return renderModelStatus(context);
  }

  if (trimmed === "/model list" || trimmed === "/models") {
    return renderModelList(context);
  }

  if (trimmed.startsWith("/model use ")) {
    const payload = trimmed.replace("/model use ", "").trim();
    const [providerRaw, ...modelParts] = payload.split(/\s+/u);
    const modelOverride = modelParts.join(" ").trim() || undefined;
    if (!providerRaw) {
      return "Usage: /model use <ollama|devin|codex|claude-code|elizacloud> [model]";
    }
    if (providerRaw === "ollama" || providerRaw === "local") {
      return activateOllamaRoute(context, modelOverride);
    }
    const linked = resolveLinkedProviderName(providerRaw);
    if (!linked) {
      return `Unknown provider route: ${providerRaw}\nUsage: /model use <ollama|devin|codex|claude-code|elizacloud> [model]`;
    }
    return activateLinkedRoute(context, linked, modelOverride);
  }

  if (trimmed === "/execution" || trimmed === "/execution status") {
    const settings = context.services.settings.get().execution;
    const native = await getEffectiveShellStatus(
      context.runtime,
      context.services,
    );
    const health = await context.services.terminal.health();
    return JSON.stringify(
      {
        active: settings,
        native,
        backends: health,
      },
      null,
      2,
    );
  }

  if (trimmed === "/execution backends") {
    const health = await context.services.terminal.health();
    return health
      .map((entry) => {
        const passCount = entry.checks.filter(
          (check) => check.status === "pass",
        ).length;
        const warnCount = entry.checks.filter(
          (check) => check.status === "warn",
        ).length;
        const failCount = entry.checks.filter(
          (check) => check.status === "fail",
        ).length;
        return `- ${entry.backend} [${entry.mode}] ready=${entry.ready} engine=${entry.engine ?? "n/a"} commandTimeout=${entry.limits.commandTimeoutMs}ms healthTimeout=${entry.limits.healthTimeoutMs}ms checks=${passCount}/${entry.checks.length} pass ${warnCount} warn ${failCount} fail bootstrap=${entry.bootstrap.length} :: ${entry.detail}`;
      })
      .join("\n");
  }

  if (trimmed === "/execution bootstrap") {
    const health = await context.services.terminal.health();
    return health
      .map(
        (entry) =>
          `- ${entry.backend}\n  checks:\n${entry.checks.map((check) => `    - [${check.status}] ${check.summary}: ${check.detail}`).join("\n")}\n  bootstrap:\n${entry.bootstrap.map((item) => `    - ${item}`).join("\n")}`,
      )
      .join("\n\n");
  }

  if (trimmed.startsWith("/execution preview ")) {
    const command = trimmed.replace("/execution preview ", "").trim();
    if (!command) {
      return "Usage: /execution preview <command>";
    }
    return JSON.stringify(context.services.terminal.preview(command), null, 2);
  }

  if (trimmed.startsWith("/execution set ")) {
    const payload = trimmed.replace("/execution set ", "").trim();
    const [field, ...valueParts] = payload.split(" ");
    const valueRaw = valueParts.join(" ").trim();
    if (!field || !valueRaw) {
      return "Usage: /execution set <field> <value>";
    }
    const path = field.startsWith("execution.") ? field : `execution.${field}`;
    const settings = context.services.settings.set(path, valueRaw);
    return JSON.stringify(settings.execution, null, 2);
  }

  if (trimmed.startsWith("/model set ")) {
    const payload = trimmed.replace("/model set ", "").trim();
    const [field, ...valueParts] = payload.split(" ");
    const valueRaw = valueParts.join(" ").trim();
    if (!field || !valueRaw) {
      return "Usage: /model set <field> <value>";
    }
    const path = field.startsWith("model.") ? field : `model.${field}`;
    const settings = context.services.settings.set(
      path,
      coerceSettingValue(valueRaw),
    );
    syncProviderSettings(context, settings);
    return JSON.stringify(settings.model, null, 2);
  }

  if (trimmed === "/config" || trimmed === "/config show") {
    return JSON.stringify(context.services.settings.get(), null, 2);
  }

  if (trimmed === "/theme" || trimmed === "/theme show") {
    const settings = context.services.settings.get();
    const active = getTuiTheme(settings.ui.theme);
    return [
      `active=${active.name}`,
      `label=${active.label}`,
      `primary=${active.primary}`,
      `secondary=${active.secondary}`,
      `available=${listTuiThemes()
        .map((entry) => entry.name)
        .join(", ")}`,
    ].join("\n");
  }

  if (trimmed === "/theme list") {
    return listTuiThemes()
      .map(
        (entry) =>
          `- ${entry.name} :: ${entry.label} aliases=${entry.aliases.join(",") || "none"} primary=${entry.primary} secondary=${entry.secondary}${entry.name === DEFAULT_TUI_THEME ? " default" : ""}`,
      )
      .join("\n");
  }

  if (trimmed === "/theme next") {
    const next = nextTuiTheme(context.services.settings.get().ui.theme);
    const settings = context.services.settings.set("ui.theme", next);
    return JSON.stringify(
      {
        theme: settings.ui.theme,
        profile: getTuiTheme(settings.ui.theme),
      },
      null,
      2,
    );
  }

  if (trimmed === "/theme prev" || trimmed === "/theme previous") {
    const previous = previousTuiTheme(context.services.settings.get().ui.theme);
    const settings = context.services.settings.set("ui.theme", previous);
    return JSON.stringify(
      {
        theme: settings.ui.theme,
        profile: getTuiTheme(settings.ui.theme),
      },
      null,
      2,
    );
  }

  if (trimmed.startsWith("/theme set ")) {
    const rawTheme = trimmed.replace("/theme set ", "").trim();
    const theme = resolveTuiThemeName(rawTheme);
    if (!theme) {
      return [
        `Unknown theme: ${rawTheme}`,
        `Available: ${listTuiThemes()
          .map((entry) => entry.name)
          .join(", ")}`,
      ].join("\n");
    }
    const settings = context.services.settings.set("ui.theme", theme);
    return JSON.stringify(
      {
        theme: settings.ui.theme,
        profile: getTuiTheme(settings.ui.theme),
      },
      null,
      2,
    );
  }

  return undefined;
}
