import type { AppContext } from "@/runtime/bootstrap";
import { getEffectiveSkillsSummary } from "@/runtime/native/service-bridge/autonomous";
import { getNativeServices } from "@/runtime/native/service-bridge/runtime";
import { json } from "@/server/responses";

export async function handleDiagnosticsRoutes(
  context: AppContext,
  request: Request,
  url: URL,
): Promise<Response | null> {
  if (request.method === "GET" && url.pathname === "/doctor") {
    const cron = getNativeServices(context.runtime).cron;
    if (!cron) {
      return json({ error: "Trigger runtime service is not ready." }, 503);
    }
    const transportOverview = context.gateway
      ? await context.gateway.transportOverview()
      : undefined;
    const skillsSummary = getEffectiveSkillsSummary(
      context.runtime,
      context.services,
    );
    const recentCronRuns = await cron.runs(5);
    return json({
      checks: await context.services.diagnostics.run({
        skillsCount: skillsSummary.total,
        skillsSummary,
        contextFilesCount: context.services.contextFiles.list().length,
        recentCronRuns: recentCronRuns.length,
        recentTerminalCommands: context.services.terminal.recent(5).length,
        repositoryAvailable: context.services.repository.isRepository(),
        gatewayTransportOverview: transportOverview,
      }),
    });
  }

  if (request.method === "GET" && url.pathname === "/setup/checklist") {
    return json({
      checklist: await context.services.diagnostics.setupChecklist(),
    });
  }

  if (request.method === "GET" && url.pathname === "/setup/summary") {
    return json({
      summary: await context.services.operator.setupSummary(),
    });
  }

  if (request.method === "GET" && url.pathname === "/update/preview") {
    return json({
      update: await context.services.operator.updatePreview(),
    });
  }

  return null;
}
