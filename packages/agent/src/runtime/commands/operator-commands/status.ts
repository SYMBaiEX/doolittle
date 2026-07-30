import { getEffectiveSkillsSummary } from "@/runtime/native/service-bridge/autonomous";
import { getNativeServices } from "@/runtime/native/service-bridge/runtime";
import type { AgentExecutionContext } from "../../chat";
import {
  formatDoctorSummary,
  formatSetupSummary,
  formatUpdatePreview,
} from "./formatters";

export async function handleOperatorStatusCommand(
  trimmed: string,
  context: AgentExecutionContext,
): Promise<string | undefined> {
  if (trimmed === "/doctor") {
    const cron = getNativeServices(context.runtime).automation;
    if (!cron) {
      return "Doctor unavailable: Trigger runtime service is not ready.";
    }
    const transportOverview = context.gateway
      ? await context.gateway.transportOverview()
      : undefined;
    const skillsSummary = getEffectiveSkillsSummary(
      context.runtime,
      context.services,
    );
    const recentCronRuns = await cron.runs(5);
    const checks = await context.services.diagnostics.run({
      skillsCount: skillsSummary.total,
      skillsSummary,
      contextFilesCount: context.services.contextFiles.list().length,
      recentCronRuns: recentCronRuns.length,
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
