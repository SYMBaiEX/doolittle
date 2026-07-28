import type {
  AutomationAction,
  AutomationCondition,
} from "@doolittle/contracts";
import type { AppContext } from "@/runtime/bootstrap";
import { getNativeServices } from "@/runtime/native/service-bridge/runtime";
import { json } from "@/server/responses";
import type { AutomationTriggerInput } from "@/services/cron/service/types";

export async function handleCronRoutes(
  context: AppContext,
  request: Request,
  url: URL,
): Promise<Response | null> {
  const nativeServices = getNativeServices(context.runtime);
  const localCron = context.services.cron;
  const localJobs = () => localCron.list();
  const hasLocalJob = (id: string) => localJobs().some((job) => job.id === id);

  if (request.method === "POST" && url.pathname.startsWith("/cron/webhooks/")) {
    const token = url.pathname.slice("/cron/webhooks/".length).trim();
    if (!token || token.includes("/")) {
      return json({ error: "webhook token is required" }, 400);
    }
    const payload = await readRecordBody(request);
    try {
      return json({
        run: nativeServices.cron?.triggerWebhook
          ? await nativeServices.cron.triggerWebhook(token, payload)
          : await localCron.triggerWebhook(token, payload),
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
        run: nativeServices.cron?.triggerNow
          ? await nativeServices.cron.triggerNow(id, "manual", payload)
          : await localCron.triggerNow(id, "manual", payload),
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
        job: hasLocalJob(id)
          ? ((await nativeServices.cron?.pause?.(id)) ?? localCron.pause(id))
          : ((await nativeServices.cron?.pause?.(id)) ?? localCron.pause(id)),
      });
    }
    if (lifecycleAction === "resume") {
      return json({
        job: hasLocalJob(id)
          ? ((await nativeServices.cron?.resume?.(id)) ?? localCron.resume(id))
          : ((await nativeServices.cron?.resume?.(id)) ?? localCron.resume(id)),
      });
    }
    return json({
      job: hasLocalJob(id)
        ? ((await nativeServices.cron?.runNow?.(id)) ?? localCron.runNow(id))
        : ((await nativeServices.cron?.runNow?.(id)) ?? localCron.runNow(id)),
    });
  }

  if (request.method === "GET" && url.pathname === "/cron/jobs") {
    const nativeJobs = (await nativeServices.cron?.list()) ?? [];
    return json({
      jobs: mergeRecords(localJobs(), nativeJobs),
    });
  }

  if (request.method === "GET" && url.pathname === "/cron/runs") {
    const nativeRuns = (await nativeServices.cron?.runs(50)) ?? [];
    return json({
      runs: mergeRecords(localCron.recentRuns(50), nativeRuns),
    });
  }

  if (request.method === "POST" && url.pathname === "/cron/jobs") {
    const body = ((await request.json().catch(() => ({}))) ?? {}) as {
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
    const input = {
      name: body.name ?? `job-${Date.now()}`,
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
        job:
          (await nativeServices.cron?.create({
            name: input.name,
            schedule: body.schedule,
            prompt: body.prompt,
            skills: input.skills,
            delivery: input.delivery,
            runtime: input.runtime,
            trigger: input.trigger,
            condition: input.condition,
            action: input.action,
          })) ?? localCron.create(input),
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
    if (hasLocalJob(id)) {
      if (nativeServices.cron?.remove) {
        await nativeServices.cron.remove(id);
      } else {
        localCron.remove(id);
      }
    } else if (nativeServices.cron?.remove) {
      await nativeServices.cron.remove(id);
    } else {
      localCron.remove(id);
    }
    return json({ deleted: true, id });
  }

  if (request.method === "PATCH" && url.pathname.startsWith("/cron/jobs/")) {
    const id = url.pathname.replace("/cron/jobs/", "").trim();
    if (!id) {
      return json({ error: "cron job id is required" }, 400);
    }
    const body = ((await request.json().catch(() => ({}))) ?? {}) as {
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
    const patch = {
      name: body.name,
      prompt: body.prompt,
      schedule: body.schedule,
      skills: body.skills,
      delivery: body.delivery,
      clearRuntime: body.clearRuntime,
      runtime: body.runtime,
      trigger: body.trigger,
      condition: body.condition,
      action: body.action,
    };
    try {
      return json({
        job: hasLocalJob(id)
          ? ((await nativeServices.cron?.update(id, patch)) ??
            localCron.updateConfig(id, patch))
          : ((await nativeServices.cron?.update(id, {
              name: body.name,
              prompt: body.prompt,
              schedule: body.schedule,
              skills: body.skills,
              delivery: body.delivery,
              clearRuntime: body.clearRuntime,
              runtime: body.runtime,
              trigger: body.trigger,
              condition: body.condition,
              action: body.action,
            })) ?? localCron.updateConfig(id, patch)),
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

function mergeRecords(primary: unknown[], secondary: unknown[]): unknown[] {
  const records = new Map<string, unknown>();
  for (const entry of [...secondary, ...primary]) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const id = (entry as { id?: unknown }).id;
    records.set(typeof id === "string" ? id : `record:${records.size}`, entry);
  }
  return Array.from(records.values());
}

function automationErrorResponse(error: unknown): Response {
  const message = error instanceof Error ? error.message : String(error);
  const status = message.includes("not found")
    ? 404
    : message.includes("paused")
      ? 409
      : 400;
  return json({ error: message }, status);
}
