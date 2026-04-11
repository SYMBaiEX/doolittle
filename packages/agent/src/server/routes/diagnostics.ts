import type { AppContext } from "@/runtime/bootstrap";
import { json } from "@/server/responses";

export async function handleDiagnosticsRoutes(
  context: AppContext,
  request: Request,
  url: URL,
): Promise<Response | null> {
  if (request.method === "GET" && url.pathname === "/doctor") {
    const transportOverview = context.gateway
      ? await context.gateway.transportOverview()
      : undefined;
    return json({
      checks: await context.services.diagnostics.run({
        skillsCount: context.services.skills.list().length,
        contextFilesCount: context.services.contextFiles.list().length,
        recentCronRuns: context.services.cron.recentRuns(5).length,
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
