import type { AppContext } from "@/runtime/bootstrap";
import { syncProviderSettings } from "@/runtime/linked-provider-accounts";
import { getEffectiveShellStatus } from "@/runtime/native/service-bridge/tooling";
import {
  getTuiTheme,
  listTuiThemes,
  nextTuiTheme,
  previousTuiTheme,
  resolveTuiThemeName,
} from "@/runtime/theme-catalog";
import { json } from "@/server/responses";

function buildThemePayload(theme: string) {
  return {
    active: theme,
    profile: getTuiTheme(theme),
    themes: listTuiThemes(),
  };
}

export async function handleSettingsExecutionRoutes(
  context: AppContext,
  request: Request,
  url: URL,
): Promise<Response | null> {
  if (request.method === "GET" && url.pathname === "/settings") {
    return json({
      settings: context.services.settings.get(),
    });
  }

  if (request.method === "GET" && url.pathname === "/theme") {
    return json(buildThemePayload(context.services.settings.get().ui.theme));
  }

  if (request.method === "GET" && url.pathname === "/execution/status") {
    const active = context.services.settings.get().execution;
    return json({
      active,
      backends: await context.services.terminal.health(),
      native: await getEffectiveShellStatus(context.runtime, context.services),
    });
  }

  if (request.method === "GET" && url.pathname === "/execution/backends") {
    return json({
      backends: await context.services.terminal.health(),
    });
  }

  if (request.method === "POST" && url.pathname === "/execution/preview") {
    const body = (await request.json()) as {
      command?: string;
      timeoutMs?: number;
    };
    if (!body.command) {
      return json({ error: "command is required" }, 400);
    }
    return json({
      preview: context.services.terminal.preview(body.command, body.timeoutMs),
    });
  }

  if (request.method === "POST" && url.pathname === "/settings") {
    const body = (await request.json()) as {
      path: string;
      value: string | number | boolean;
    };
    const settings = context.services.settings.set(body.path, body.value);
    syncProviderSettings(context, settings);
    return json({
      settings,
    });
  }

  if (request.method === "POST" && url.pathname === "/theme") {
    const body = (await request.json()) as {
      theme?: string;
    };
    const theme = resolveTuiThemeName(body.theme);
    if (!theme) {
      return json(
        {
          error: "valid theme is required",
          themes: listTuiThemes(),
        },
        400,
      );
    }
    const settings = context.services.settings.set("ui.theme", theme);
    return json(buildThemePayload(settings.ui.theme));
  }

  if (request.method === "POST" && url.pathname === "/theme/next") {
    const theme = nextTuiTheme(context.services.settings.get().ui.theme);
    const settings = context.services.settings.set("ui.theme", theme);
    return json(buildThemePayload(settings.ui.theme));
  }

  if (request.method === "POST" && url.pathname === "/theme/prev") {
    const theme = previousTuiTheme(context.services.settings.get().ui.theme);
    const settings = context.services.settings.set("ui.theme", theme);
    return json(buildThemePayload(settings.ui.theme));
  }

  return null;
}
