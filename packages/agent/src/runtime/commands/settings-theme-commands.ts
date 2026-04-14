import { syncProviderSettings } from "@/runtime/linked-provider-accounts";
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

function coerceSettingValue(raw: string): boolean | number | string {
  if (raw === "true") {
    return true;
  }
  if (raw === "false") {
    return false;
  }
  return Number.isNaN(Number(raw)) ? raw : Number(raw);
}

export async function handleSettingsThemeCommand(
  trimmed: string,
  context: AgentExecutionContext,
): Promise<string | undefined> {
  if (trimmed === "/model" || trimmed === "/model status") {
    return JSON.stringify(context.services.settings.get().model, null, 2);
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
