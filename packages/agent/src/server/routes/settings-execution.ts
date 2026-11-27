import { readWorkerBotProfile } from "../../runtime/bootstrap/bot-profile";
import type { AppContext } from "../../runtime/bootstrap/index";
import {
  syncProviderSettings,
  withLinkedProviderMutationLock,
} from "../../runtime/linked-provider-accounts/index";
import { applyAccountPoolApiCredentials } from "../../runtime/native/account-pool/index";
import { getEffectiveShellStatus } from "../../runtime/native/service-bridge/tooling/index";
import {
  getTuiTheme,
  listTuiThemes,
  nextTuiTheme,
  previousTuiTheme,
  resolveTuiThemeName,
} from "../../runtime/theme-catalog/index";
import { isSafeSettingPath } from "../../services/settings/path";
import { validateSettingChanges } from "../../services/settings/validation";
import { formatInputAnswerSubmission } from "../../services/user-input/service";
import type {
  UserInputAnswer,
  UserInputRequestStatus,
} from "../../services/user-input/types";
import { readRouteJsonBody } from "../request-body";
import { json } from "../responses";

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

const INPUT_REQUEST_STATUSES = new Set([
  "pending",
  "answered",
  "dismissed",
  "superseded",
]);

function inputRequestAction(pathname: string): {
  id: string;
  action: "answer" | "dismiss";
} | null {
  const match = pathname.match(
    /^\/execution\/input-requests\/([^/]+)\/(answer|dismiss)$/u,
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
  return { id, action: match[2] as "answer" | "dismiss" };
}

function normalizeInputAnswers(
  body: unknown,
  questions: readonly { question: string }[],
): UserInputAnswer[] | undefined {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return undefined;
  }
  const raw = (body as { answers?: unknown }).answers;
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > questions.length)
    return undefined;
  const answers: UserInputAnswer[] = [];
  for (const [index, entry] of raw.entries()) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return undefined;
    }
    const selected = (entry as { selected?: unknown }).selected;
    if (
      selected !== undefined &&
      (!Array.isArray(selected) ||
        selected.length > 8 ||
        selected.some(
          (label) => typeof label !== "string" || label.length > 500,
        ))
    )
      return undefined;
    const customText = (entry as { customText?: unknown }).customText;
    if (
      customText !== undefined &&
      (typeof customText !== "string" || customText.length > 4000)
    )
      return undefined;
    const question = questions[index]?.question;
    if (!question) return undefined;
    answers.push({
      question,
      selected: (selected ?? [])
        .map((label: string) => label.trim())
        .filter(Boolean),
      ...(typeof customText === "string" && customText.trim()
        ? { customText: customText.trim() }
        : {}),
    });
  }
  return answers;
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

  if (
    request.method === "GET" &&
    url.pathname === "/execution/input-requests"
  ) {
    const status = url.searchParams.get("status")?.trim().toLowerCase();
    if (status && !INPUT_REQUEST_STATUSES.has(status)) {
      return json({ error: "invalid input request status" }, 400);
    }
    const roomId = url.searchParams.get("roomId")?.trim();
    return json({
      requests: context.services.inputRequests
        .list(status as UserInputRequestStatus | undefined, roomId || undefined)
        .slice(0, 100),
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
    const inputAction = inputRequestAction(url.pathname);
    if (inputAction) {
      const record = context.services.inputRequests.get(inputAction.id);
      if (!record) {
        return json({ error: "input request not found" }, 404);
      }
      if (record.status !== "pending") {
        return json(
          {
            error: `input request is already ${record.status}`,
            request: record,
          },
          409,
        );
      }
      if (inputAction.action === "dismiss") {
        try {
          return json({
            request: context.services.inputRequests.dismiss(record.id),
          });
        } catch {
          return json({ error: "Input request could not be updated." }, 409);
        }
      }
      const parsed = await readRouteJsonBody(request);
      if ("response" in parsed) return parsed.response;
      const answers = normalizeInputAnswers(parsed.body, record.questions);
      if (!answers) {
        return json(
          { error: "answers must match the request's questions" },
          400,
        );
      }
      try {
        const answered = context.services.inputRequests.answer(
          record.id,
          answers,
        );
        return json({
          request: answered,
          message: formatInputAnswerSubmission(answered, answers),
        });
      } catch {
        return json({ error: "Input request could not be updated." }, 409);
      }
    }
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
      if (record.botId || record.sessionId || record.runId) {
        const active = record.sessionId
          ? context.services.runController.getActive(record.sessionId)
          : undefined;
        const botId =
          readWorkerBotProfile()?.id ?? String(context.runtime.agentId);
        if (
          !record.botId ||
          !record.sessionId ||
          !record.runId ||
          record.botId !== botId ||
          active?.sessionId !== record.sessionId ||
          active.runId !== record.runId
        ) {
          return json(
            { error: "execution approval run is no longer active" },
            409,
          );
        }
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
      } catch {
        return json({ error: "Execution approval could not be updated." }, 409);
      }
    }
  }

  if (request.method === "GET" && url.pathname === "/execution/backends") {
    return json({
      backends: await context.services.terminal.health(),
    });
  }

  if (request.method === "POST" && url.pathname === "/execution/preview") {
    const parsed = await readRouteJsonBody(request);
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
    const parsed = await readRouteJsonBody(request);
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
    const invalidChange = validateSettingChanges(changes);
    if (invalidChange) {
      return json({ error: invalidChange }, 400);
    }
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
    const parsed = await readRouteJsonBody(request);
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
