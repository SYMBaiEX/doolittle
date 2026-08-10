import { existsSync } from "node:fs";
import { join } from "node:path";
import { getTransportRequirementRecords } from "@/gateway/transport";
import type { DiagnosticCheck, EnvConfig, GatewayConfig } from "@/types";
import type { DiagnosticsRunInput } from "./types";

export async function buildDiagnosticsFilesystemChecks(
  config: EnvConfig,
  isWritable: (path: string) => Promise<boolean>,
): Promise<DiagnosticCheck[]> {
  const onboardingSummaryPath = join(config.dataDir, "onboarding.json");

  return [
    {
      id: "workspace.exists",
      status: existsSync(config.workspaceDir) ? "pass" : "fail",
      summary: "Workspace directory",
      detail: config.workspaceDir,
    },
    {
      id: "workspace.writeable",
      status: (await isWritable(config.workspaceDir)) ? "pass" : "fail",
      summary: "Workspace write access",
      detail: config.workspaceDir,
    },
    {
      id: "data.exists",
      status: existsSync(config.dataDir) ? "pass" : "fail",
      summary: "Agent data directory",
      detail: config.dataDir,
    },
    {
      id: "onboarding.summary",
      status: existsSync(onboardingSummaryPath) ? "pass" : "warn",
      summary: "Product onboarding summary",
      detail: onboardingSummaryPath,
    },
    {
      id: "gateway.data",
      status: existsSync(config.gatewayDataDir) ? "pass" : "warn",
      summary: "Gateway state directory",
      detail: config.gatewayDataDir,
    },
  ];
}

export function buildDiagnosticsInventoryChecks(
  config: EnvConfig,
  gatewayConfig: GatewayConfig,
  input: DiagnosticsRunInput,
): DiagnosticCheck[] {
  const enabledPlatforms = Object.entries(gatewayConfig.platforms)
    .filter(([, platform]) => platform.enabled)
    .map(([platform]) => platform);
  const transportRequirements = getTransportRequirementRecords(
    config,
    gatewayConfig,
  );
  const checks: DiagnosticCheck[] = [
    {
      id: "skills.present",
      status: input.skillsCount > 0 ? "pass" : "warn",
      summary: "Installed skills",
      detail: input.skillsSummary
        ? `${input.skillsSummary.total} skills available (workspace=${input.skillsSummary.workspace} generated=${input.skillsSummary.generated} bundled=${input.skillsSummary.bundled} managed=${input.skillsSummary.managed} project=${input.skillsSummary.project} invocable=${input.skillsSummary.invocable})`
        : `${input.skillsCount} skill documents found in ${config.skillsDir}`,
    },
    {
      id: "context.present",
      status: input.contextFilesCount > 0 ? "pass" : "warn",
      summary: "Workspace context files",
      detail:
        input.contextFilesCount > 0
          ? `${input.contextFilesCount} context files detected`
          : "No AGENTS.md, SOUL.md, MISSION.md, or ROADMAP.md file found.",
    },
    {
      id: "gateway.platforms",
      status: enabledPlatforms.length > 0 ? "pass" : "warn",
      summary: "Enabled gateway platforms",
      detail: enabledPlatforms.length
        ? enabledPlatforms.join(", ")
        : "No gateway platforms enabled.",
    },
    ...transportRequirements.map((requirement) => ({
      id: `${requirement.platform}.readiness`,
      status: requirement.status,
      summary: `${requirement.label} transport readiness`,
      detail: requirement.summary,
    })),
    {
      id: "repository.available",
      status: input.repositoryAvailable ? "pass" : "warn",
      summary: "Repository inspection",
      detail: input.repositoryAvailable
        ? "Git repository detected."
        : "Workspace is not inside a git repository.",
    },
    {
      id: "cron.activity",
      status: input.recentCronRuns > 0 ? "pass" : "warn",
      summary: "Automation run history",
      detail:
        input.recentCronRuns > 0
          ? `${input.recentCronRuns} recent automation runs recorded.`
          : "No recent cron runs recorded yet.",
    },
    {
      id: "terminal.activity",
      status: input.recentTerminalCommands > 0 ? "pass" : "warn",
      summary: "Terminal execution history",
      detail:
        input.recentTerminalCommands > 0
          ? `${input.recentTerminalCommands} recent terminal commands recorded.`
          : "No terminal commands recorded yet.",
    },
  ];

  return checks;
}
