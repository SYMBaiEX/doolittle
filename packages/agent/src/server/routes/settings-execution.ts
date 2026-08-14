import type { AppContext } from "@/runtime/bootstrap";
import {
  syncProviderSettings,
  withLinkedProviderMutationLock,
} from "@/runtime/linked-provider-accounts";
import { applyAccountPoolApiCredentials } from "@/runtime/native/account-pool";
import { getEffectiveShellStatus } from "@/runtime/native/service-bridge/tooling";
import {
  getTuiTheme,
  listTuiThemes,
  nextTuiTheme,
  previousTuiTheme,
  resolveTuiThemeName,
} from "@/runtime/theme-catalog";
import { readJsonObjectBody } from "@/server/request-body";
import { json } from "@/server/responses";
import { isSafeSettingPath } from "@/services/settings/path";

type ParsedBody = { body: Record<string, unknown> } | { response: Response };

async function readBody(request: Request): Promise<ParsedBody> {
  const parsed = await readJsonObjectBody(request);
  if (parsed.ok) return { body: parsed.value };
  return {
    response: json(
      {
        error:
          parsed.reason === "invalid_json"
            ? "Invalid JSON body"
            : "JSON body must be an object",
      },
      400,
    ),
  };
}

const APPROVAL_STATUSES = new Set([
  "pending",
  "approved",
  "denied",
  "used",
  "expired",
]);

function executionApprovalAction(pathname: string): {
  id: string;
  action: "approve" | "deny";
} | null {
  const match = pathname.match(
    /^\/execution\/approvals\/([^/]+)\/(approve|deny)$/u,
  );
  if (!match) return null;
  let id = "";
  try {
    id = decodeURIComponent(match[1] ?? "");
  } catch {
    return null;
  }
  if (!id || id.length > 256 || !/^[\p{L}\p{N}][\p{L}\p{N}._:-]*$/u.test(id)) {
    return null;
  }
  return { id, action: match[2] as "approve" | "deny" };
}

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
      native: await getEffectiveShellStatus(context.runtime),
    });
  }

  if (request.method === "GET" && url.pathname === "/execution/approvals") {
    const status = url.searchParams.get("status")?.trim().toLowerCase();
    if (status && !APPROVAL_STATUSES.has(status)) {
      return json({ error: "invalid approval status" }, 400);
    }
    return json({
      approvals: context.services.executionApprovals
        .list(
          status as
            | "pending"
            | "approved"
            | "denied"
            | "used"
            | "expired"
            | undefined,
        )
        .slice(0, 100),
    });
  }

  if (request.method === "POST") {
    const approvalAction = executionApprovalAction(url.pathname);
    if (approvalAction) {
      const record = context.services.executionApprovals.get(approvalAction.id);
      if (!record) {
        return json({ error: "execution approval not found" }, 404);
      }
      if (record.status !== "pending") {
        return json(
          {
            error: `execution approval is already ${record.status}`,
            approval: record,
          },
          409,
        );
      }
      try {
        const approval =
          approvalAction.action === "approve"
            ? await context.services.executionApprovals.approve(
                approvalAction.id,
                { useImmediately: false },
              )
            : await context.services.executionApprovals.deny(approvalAction.id);
        return json({ approval });
      } catch (error) {
        return json(
          {
            error: error instanceof Error ? error.message : String(error),
          },
          409,
        );
      }
    }
  }

  if (request.method === "GET" && url.pathname === "/execution/backends") {
    return json({
      backends: await context.services.terminal.health(),
    });
  }

  if (request.method === "POST" && url.pathname === "/execution/preview") {
    const parsed = await readBody(request);
    if ("response" in parsed) return parsed.response;
    const body = parsed.body as {
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
    const parsed = await readBody(request);
    if ("response" in parsed) return parsed.response;
    const body = parsed.body as {
      path?: string;
      value?: unknown;
      changes?: Array<{ path?: string; value?: unknown }>;
    };
    const requestedChanges = Array.isArray(body.changes)
      ? body.changes
      : body.path !== undefined
        ? [{ path: body.path, value: body.value }]
        : [];
    if (
      requestedChanges.length === 0 ||
      requestedChanges.length > 32 ||
      requestedChanges.some(
        (change) =>
          !isSafeSettingPath(change.path) || !Object.hasOwn(change, "value"),
      )
    ) {
      return json({ error: "one to 32 setting changes are required" }, 400);
    }
    const changes = requestedChanges.map((change) => ({
      path: change.path as string,
      value: change.value,
    }));
    const updatesModelRoute = changes.some((change) =>
      change.path.startsWith("model."),
    );
    const applyChanges = async () => {
      const next = context.services.settings.setMany(changes);
      if (updatesModelRoute) {
        syncProviderSettings(context, next);
        await applyAccountPoolApiCredentials({
          activeBackend: next.model.provider,
        });
      }
      return next;
    };
    // Active turns read a request-local settings snapshot, so this persisted
    // route update takes effect immediately for future turns.
    const settings = updatesModelRoute
      ? await withLinkedProviderMutationLock(context.runtime, applyChanges)
      : await applyChanges();
    return json({
      settings,
    });
  }

  if (request.method === "POST" && url.pathname === "/theme") {
    const parsed = await readBody(request);
    if ("response" in parsed) return parsed.response;
    const body = parsed.body as {
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
