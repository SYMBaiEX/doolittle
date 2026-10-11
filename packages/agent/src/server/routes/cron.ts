import type {
  AutomationAction,
  AutomationCondition,
} from "@doolittle/contracts";
import type { AppContext } from "@/runtime/bootstrap";
import { getNativeServices } from "@/runtime/native/service-bridge/runtime";
import { readJsonObjectBody } from "@/server/request-body";
import { json } from "@/server/responses";
import type { AutomationTriggerInput } from "@/services/automation/types";

export async function handleCronRoutes(
  context: AppContext,
  request: Request,
  url: URL,
): Promise<Response | null> {
  const isCronRoute =
    url.pathname === "/cron/jobs" ||
    url.pathname === "/cron/runs" ||
    url.pathname.startsWith("/cron/jobs/") ||
    url.pathname.startsWith("/cron/webhooks/");
  if (!isCronRoute) return null;
  if (process.env.DOOLITTLE_BOT_RUNTIME === "worker")
    return json(
      {
        error:
          "Automations are owned by the application scheduler, not bot workers.",
      },
      403,
    );

  const nativeServices = getNativeServices(context.runtime);
  const cron = nativeServices.automation;
  if (!cron) {
    return json({ error: "Trigger runtime service is not ready." }, 503);
  }

  if (request.method === "POST" && url.pathname.startsWith("/cron/webhooks/")) {
    const token = url.pathname.slice("/cron/webhooks/".length).trim();
    if (!token || token.includes("/")) {
      return json({ error: "webhook token is required" }, 400);
    }
    const payload = await readRecordBody(request);
    try {
      return json({
        run: await cron.triggerWebhook?.(token, payload),
      });
    } catch (error) {
      return automationErrorResponse(error);
    }
  }

  if (
    request.method === "POST" &&
    url.pathname.startsWith("/cron/jobs/") &&
    url.pathname.endsWith("/trigger")
  ) {
    const id = url.pathname
      .slice("/cron/jobs/".length, -"/trigger".length)
      .trim();
    if (!id) {
      return json({ error: "cron job id is required" }, 400);
    }
    const payload = await readRecordBody(request);
    try {
      return json({
        run: await cron.triggerNow?.(id, "manual", payload),
      });
    } catch (error) {
      return automationErrorResponse(error);
    }
  }

  const lifecycleAction = (["pause", "resume", "run"] as const).find(
    (action) =>
      request.method === "POST" &&
      url.pathname.startsWith("/cron/jobs/") &&
      url.pathname.endsWith(`/${action}`),
  );

  if (lifecycleAction) {
    const id = url.pathname
      .slice("/cron/jobs/".length, -`/${lifecycleAction}`.length)
      .trim();
    if (!id) {
      return json({ error: "cron job id is required" }, 400);
    }
    if (lifecycleAction === "pause") {
      return json({
        job: await cron.pause?.(id),
      });
    }
    if (lifecycleAction === "resume") {
      return json({
        job: await cron.resume?.(id),
      });
    }
    return json({
      job: await cron.runNow?.(id),
    });
  }

  if (request.method === "GET" && url.pathname === "/cron/jobs") {
    return json({ jobs: await cron.list() });
  }

  if (request.method === "GET" && url.pathname === "/cron/runs") {
    return json({ runs: await cron.runs(50) });
  }

  if (request.method === "POST" && url.pathname === "/cron/jobs") {
    const parsed = await readMutationBody(request);
    if ("response" in parsed) return parsed.response;
    const body = parsed.body as {
      targetBotId?: string;
      name?: string;
      prompt?: string;
      schedule?: string;
      skills?: string[];
      delivery?: "origin" | "local" | "home";
      trigger?: AutomationTriggerInput;
      condition?: AutomationCondition;
      action?: AutomationAction;
      runtime?: {
        provider?: string;
        model?: string;
        baseUrl?: string;
        temperature?: number;
        maxTokens?: number;
        personalityId?: string;
      };
    };
    if (!body.trigger && (!body.schedule || !body.prompt)) {
      return json({ error: "schedule and prompt are required" }, 400);
    }
    if (
      parsed.body.targetApprovalId !== undefined ||
      (body.targetBotId !== undefined &&
        (typeof body.targetBotId !== "string" ||
          !/^(?:default|[0-9a-f-]{36})$/iu.test(body.targetBotId)))
    )
      return json(
        { error: "Automation target must be an approved canonical bot." },
        400,
      );
    const input = {
      name: body.name ?? `job-${Date.now()}`,
      targetBotId: body.targetBotId,
      schedule: body.schedule,
      prompt: body.prompt,
      skills: body.skills ?? [],
      delivery: body.delivery ?? "local",
      runtime: body.runtime,
      trigger: body.trigger,
      condition: body.condition,
      action: body.action,
    };
    try {
      return json({
        job: await cron.create({
          name: input.name,
          targetBotId: input.targetBotId,
          schedule: body.schedule,
          prompt: body.prompt,
          skills: input.skills,
          delivery: input.delivery,
          runtime: input.runtime,
          trigger: input.trigger,
          condition: input.condition,
          action: input.action,
        }),
      });
    } catch (error) {
      return automationErrorResponse(error);
    }
  }

  if (
    request.method === "DELETE" &&
    (url.pathname === "/cron/jobs" || url.pathname.startsWith("/cron/jobs/"))
  ) {
    const id = url.pathname.replace("/cron/jobs/", "").trim();
    if (!id || id === "/cron/jobs") {
      return json({ error: "cron job id is required" }, 400);
    }
    await cron.remove?.(id);
    return json({ deleted: true, id });
  }

  if (request.method === "PATCH" && url.pathname.startsWith("/cron/jobs/")) {
    const id = url.pathname.replace("/cron/jobs/", "").trim();
    if (!id) {
      return json({ error: "cron job id is required" }, 400);
    }
    const parsed = await readMutationBody(request);
    if ("response" in parsed) return parsed.response;
    const body = parsed.body as {
      targetBotId?: string;
      name?: string;
      prompt?: string;
      schedule?: string;
      skills?: string[];
      delivery?: "origin" | "local" | "home";
      clearRuntime?: boolean;
      trigger?: AutomationTriggerInput;
      condition?: AutomationCondition;
      action?: AutomationAction;
      runtime?: {
        provider?: string;
        model?: string;
        baseUrl?: string;
        temperature?: number;
        maxTokens?: number;
        personalityId?: string;
      };
    };
    if (parsed.body.targetApprovalId !== undefined)
      return json(
        { error: "Host target approval cannot be supplied by a client." },
        400,
      );
    try {
      return json({
        job: await cron.update(id, {
          name: body.name,
          targetBotId: body.targetBotId,
          prompt: body.prompt,
          schedule: body.schedule,
          skills: body.skills,
          delivery: body.delivery,
          clearRuntime: body.clearRuntime,
          runtime: body.runtime,
          trigger: body.trigger,
          condition: body.condition,
          action: body.action,
        }),
      });
    } catch (error) {
      return automationErrorResponse(error);
    }
  }

  return null;
}

async function readRecordBody(
  request: Request,
): Promise<Record<string, unknown>> {
  const body = await request.json().catch(() => ({}));
  return body && typeof body === "object" && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : {};
}

type ParsedMutationBody =
  | { body: Record<string, unknown> }
  | { response: Response };

async function readMutationBody(request: Request): Promise<ParsedMutationBody> {
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

function automationErrorResponse(error: unknown): Response {
  const message = error instanceof Error ? error.message : "";
  const validationMessages = [
    "An automation trigger is required.",
    "Scheduled automations require a schedule.",
    "Payload conditions require a dot-separated field path.",
    "An automation action is required.",
    "Webhook actions currently support POST only.",
    "Webhook actions require a valid HTTP or HTTPS URL.",
    "Webhook actions require an HTTP or HTTPS URL without embedded credentials.",
    "An automation target is immutable. Create a new automation for another bot.",
    "Named automations do not support lead-loaded skills, runtime/model overrides, home delivery, or webhook triggers/actions.",
    "Named-bot automations require the application-owned desktop scheduler.",
    "workflowId is required for workflow triggers",
    "displayName is required",
    "instructions is required",
    "wakeMode must be inject_now or next_autonomy_cycle",
    "maxRuns must be a positive integer",
    "intervalMs is required for interval triggers",
    "scheduledAtIso must be a valid ISO timestamp",
    "eventKind is required for event triggers",
    "cronExpression must be a valid 5-field cron expression",
    "Invalid Eliza trigger definition.",
  ];
  const validationMessage = validationMessages.find(
    (entry) => entry === message,
  );
  if (validationMessage) return json({ error: validationMessage }, 400);
  if (message === "Named automation host approval is unavailable.")
    return json(
      { error: "Named automation host approval is unavailable." },
      503,
    );
  if (
    /^Unsupported automation (?:trigger|condition|action) ".*"\.$/u.test(
      message,
    )
  )
    return json({ error: "Unsupported automation configuration." }, 400);
  if (/^Unsupported payload condition ".*"\.$/u.test(message))
    return json({ error: "Unsupported payload condition." }, 400);
  if (
    /^The (?:equals|contains) condition requires a comparison value\.$/u.test(
      message,
    )
  )
    return json(
      { error: "Payload condition requires a comparison value." },
      400,
    );
  if (/^(?:prompt|run-agent) actions require a prompt\.$/u.test(message))
    return json({ error: "Automation action requires a prompt." }, 400);
  const status =
    /^(?:Cron job|Webhook automation) not found(?:: .*)?\.?$/u.test(message)
      ? 404
      : /^Cron job is paused: .*$/u.test(message)
        ? 409
        : 500;
  return json(
    {
      error:
        status === 404
          ? "Automation not found."
          : status === 409
            ? "Automation is paused."
            : "Automation request failed.",
    },
    status,
  );
}
