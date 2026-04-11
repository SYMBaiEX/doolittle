import type { AppContext } from "@/runtime/bootstrap";
import { getNativeServices } from "@/runtime/native/service-bridge/index";
import { json } from "@/server/responses";

export async function handleCronRoutes(
  context: AppContext,
  request: Request,
  url: URL,
): Promise<Response | null> {
  const nativeServices = getNativeServices(context.runtime);

  if (request.method === "GET" && url.pathname === "/cron/jobs") {
    return json({
      jobs: nativeServices.cron?.list() ?? context.services.cron.list(),
    });
  }

  if (request.method === "GET" && url.pathname === "/cron/runs") {
    return json({
      runs:
        nativeServices.cron?.runs(50) ?? context.services.cron.recentRuns(50),
    });
  }

  if (request.method === "POST" && url.pathname === "/cron/jobs") {
    const body = ((await request.json().catch(() => ({}))) ?? {}) as {
      name?: string;
      prompt?: string;
      schedule?: string;
      skills?: string[];
      delivery?: "origin" | "local";
      runtime?: {
        provider?: string;
        model?: string;
        baseUrl?: string;
        temperature?: number;
        maxTokens?: number;
        personalityId?: string;
      };
    };
    if (!body.schedule || !body.prompt) {
      return json({ error: "schedule and prompt are required" }, 400);
    }
    return json({
      job:
        nativeServices.cron?.create({
          name: body.name ?? `job-${Date.now()}`,
          schedule: body.schedule,
          prompt: body.prompt,
          skills: body.skills ?? [],
          delivery: body.delivery ?? "local",
          runtime: body.runtime,
        }) ??
        context.services.cron.create({
          name: body.name ?? `job-${Date.now()}`,
          schedule: body.schedule,
          prompt: body.prompt,
          skills: body.skills ?? [],
          delivery: body.delivery ?? "local",
          runtime: body.runtime,
        }),
    });
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
      delivery?: "origin" | "local";
      clearRuntime?: boolean;
      runtime?: {
        provider?: string;
        model?: string;
        baseUrl?: string;
        temperature?: number;
        maxTokens?: number;
        personalityId?: string;
      };
    };
    return json({
      job:
        nativeServices.cron?.update(id, {
          name: body.name,
          prompt: body.prompt,
          schedule: body.schedule,
          skills: body.skills,
          delivery: body.delivery,
          clearRuntime: body.clearRuntime,
          runtime: body.runtime,
        }) ??
        context.services.cron.updateConfig(id, {
          name: body.name,
          prompt: body.prompt,
          schedule: body.schedule,
          skills: body.skills,
          delivery: body.delivery,
          clearRuntime: body.clearRuntime,
          runtime: body.runtime,
        }),
    });
  }

  return null;
}
