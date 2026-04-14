import { formatDoctorSummary, formatSetupSummary, formatUpdatePreview } from "./formatters";
import type { AgentExecutionContext } from "../../chat";

export async function handleOperatorStatusCommand(
  trimmed: string,
  context: AgentExecutionContext,
): Promise<string | undefined> {
  if (trimmed === "/doctor") {
    const transportOverview = context.gateway
      ? await context.gateway.transportOverview()
      : undefined;
    const skillsSummary = context.services.skills.summary();
    const checks = await context.services.diagnostics.run({
      skillsCount: skillsSummary.total,
      skillsSummary,
      contextFilesCount: context.services.contextFiles.list().length,
      recentCronRuns: context.services.cron.recentRuns(5).length,
      recentTerminalCommands: context.services.terminal.recent(5).length,
      repositoryAvailable: context.services.repository.isRepository(),
      gatewayTransportOverview: transportOverview,
    });
    return formatDoctorSummary(checks);
  }

  if (trimmed === "/setup" || trimmed === "/setup checklist") {
    const checklist = await context.services.diagnostics.setupChecklist();
    return checklist.map((item, index) => `${index + 1}. ${item}`).join("\n");
  }

  if (trimmed === "/setup summary") {
    return formatSetupSummary(await context.services.operator.setupSummary());
  }

  if (trimmed === "/update" || trimmed === "/update preview") {
    return formatUpdatePreview(await context.services.operator.updatePreview());
  }

  return undefined;
}
