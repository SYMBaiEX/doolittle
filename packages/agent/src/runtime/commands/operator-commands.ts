import {
  formatShellCommandResponse,
  maybeRequireRemoteExecutionApproval,
  runShellCommandForTurn,
} from "@/runtime/commands/command-execution";
import {
  getEffectiveRepositoryDiff,
  getEffectiveRepositoryLog,
  getEffectiveRepositoryStatus,
  getEffectiveShellHistory,
} from "@/runtime/native/service-bridge/tooling";
import type { SetupSummary, UpdatePreview } from "@/services/operator/service";
import type { DiagnosticCheck } from "@/types";
import type { ChatTurnRequest } from "@/types/runtime";
import type { AgentExecutionContext, AgentTurnHooks } from "../chat";

function normalizeDiagnosticStatus(status: string): string {
  return status === "ok" ? "pass" : status;
}

function formatDoctorSummary(checks: DiagnosticCheck[]): string {
  const normalized = checks.map((check) => ({
    ...check,
    status: normalizeDiagnosticStatus(check.status),
  }));
  const counts = {
    pass: normalized.filter((check) => check.status === "pass").length,
    warn: normalized.filter((check) => check.status === "warn").length,
    fail: normalized.filter((check) => check.status === "fail").length,
  };
  const attention = normalized.filter(
    (check) => check.status === "warn" || check.status === "fail",
  );
  const lines = [
    "Doctor",
    `Overall: ${counts.pass} pass, ${counts.warn} warn, ${counts.fail} fail`,
  ];

  if (attention.length === 0) {
    lines.push(
      "",
      "No warning or failure checks. The core shell looks ready.",
      "Next: review `/setup summary` when you change providers, transports, or execution settings.",
    );
    return lines.join("\n");
  }

  lines.push("", "Attention:");
  for (const check of attention.slice(0, 8)) {
    lines.push(
      `- [${check.status.toUpperCase()}] ${check.summary}: ${check.detail}`,
    );
  }
  lines.push(
    "",
    "Next:",
    "1. Review `/setup summary` for provider and transport readiness.",
    "2. Fix the warning/failure checks above before relying on long-running automation.",
    "3. Re-run `/doctor` after configuration changes.",
  );
  return lines.join("\n");
}

function formatSetupSummary(summary: SetupSummary): string {
  const readyProviders = summary.providers.filter(
    (entry) => entry.ready,
  ).length;
  const readyTransports = summary.transports.filter(
    (entry) => entry.ready,
  ).length;
  const missingDirectories = summary.directories.filter(
    (entry) => !entry.exists,
  );
  const lines = [
    "Setup Summary",
    `Status: ${summary.readiness.level.toUpperCase()}`,
    summary.readiness.headline,
    summary.readiness.detail,
    "",
    `Providers ready: ${readyProviders}/${summary.providers.length}`,
    `Transports ready: ${readyTransports}/${summary.transports.length}`,
    `Directories missing: ${missingDirectories.length}`,
  ];

  const providerAttention = summary.providers.filter((entry) => !entry.ready);
  const transportAttention = summary.transports.filter((entry) => !entry.ready);
  if (providerAttention.length > 0) {
    lines.push("", "Providers needing attention:");
    for (const entry of providerAttention.slice(0, 4)) {
      lines.push(`- ${entry.id}: ${entry.detail}`);
    }
  }
  if (transportAttention.length > 0) {
    lines.push("", "Transports needing attention:");
    for (const entry of transportAttention.slice(0, 4)) {
      lines.push(`- ${entry.id}: ${entry.detail}`);
    }
  }
  if (summary.readiness.nextSteps.length > 0) {
    lines.push("", "Next:");
    summary.readiness.nextSteps.forEach((step, index) => {
      lines.push(`${index + 1}. ${step}`);
    });
  }
  return lines.join("\n");
}

function formatUpdatePreview(update: UpdatePreview): string {
  const lines = [
    "Update Preview",
    `Status: ${update.readiness.level.toUpperCase()}`,
    update.readiness.headline,
    update.readiness.detail,
    "",
    `Repository: ${update.repositoryAvailable ? "available" : "unavailable"}`,
    `Git status: ${update.repositoryStatus}`,
    `Recent commits: ${update.recentCommits}`,
  ];

  if (update.readiness.nextSteps.length > 0) {
    lines.push("", "Runtime follow-up:");
    update.readiness.nextSteps.forEach((step, index) => {
      lines.push(`${index + 1}. ${step}`);
    });
  }
  if (update.recommendedSteps.length > 0) {
    lines.push("", "Validation loop:");
    update.recommendedSteps.forEach((step, index) => {
      lines.push(`${index + 1}. ${step}`);
    });
  }
  return lines.join("\n");
}

export async function handleOperatorCommand(
  input: ChatTurnRequest,
  trimmed: string,
  context: AgentExecutionContext,
  hooks?: AgentTurnHooks,
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

  if (
    trimmed === "/migrate" ||
    trimmed === "/migrate scan" ||
    trimmed === "/migration scan"
  ) {
    return JSON.stringify(
      context.services.operator.migrationSources(),
      null,
      2,
    );
  }

  if (trimmed === "/migrate history" || trimmed === "/migration history") {
    return JSON.stringify(
      context.services.operator.migrationHistory(20),
      null,
      2,
    );
  }

  if (trimmed.startsWith("/migrate inspect ")) {
    const sourcePath = trimmed.replace("/migrate inspect ", "").trim();
    if (!sourcePath) {
      return "Usage: /migrate inspect <path>";
    }
    return JSON.stringify(
      context.services.operator.inspectMigrationSource(sourcePath),
      null,
      2,
    );
  }

  if (trimmed.startsWith("/migrate apply ")) {
    const payload = trimmed.replace("/migrate apply ", "");
    const [sourcePath, rawFlag] = payload
      .split("::")
      .map((part) => part.trim());
    if (!sourcePath) {
      return "Usage: /migrate apply <path> :: overwrite=true";
    }
    return JSON.stringify(
      context.services.operator.applyMigration(sourcePath, {
        overwrite: rawFlag === "overwrite=true",
      }),
      null,
      2,
    );
  }

  if (trimmed === "/terminal" || trimmed === "/terminal recent") {
    const commands = getEffectiveShellHistory(
      context.runtime,
      context.services,
      10,
    ) as Array<{
      exitCode: number;
      command: string;
      backend?: string;
      backendMode?: string;
      backendEngine?: string;
      timeoutMs?: number;
      durationMs?: number;
      timedOut?: boolean;
      stdout?: string;
      stderr?: string;
    }>;
    return commands.length
      ? commands
          .map(
            (entry) =>
              `- [${entry.exitCode}] ${entry.command}\n  backend=${entry.backend} mode=${entry.backendMode ?? "n/a"} engine=${entry.backendEngine ?? "n/a"} timeout=${entry.timeoutMs ?? "n/a"}ms duration=${entry.durationMs ?? "n/a"}ms timedOut=${entry.timedOut ? "yes" : "no"}\n  stdout=${entry.stdout?.slice(0, 160) || "(empty)"}\n  stderr=${entry.stderr?.slice(0, 160) || "(empty)"}`,
          )
          .join("\n")
      : "No terminal commands recorded.";
  }

  if (trimmed.startsWith("/terminal run ")) {
    const command = trimmed.replace("/terminal run ", "").trim();
    if (!command) {
      return "Usage: /terminal run <command>";
    }
    const approvalPrompt = await maybeRequireRemoteExecutionApproval(
      input,
      context,
      command,
      hooks,
    );
    if (approvalPrompt) {
      return approvalPrompt;
    }
    const result = await runShellCommandForTurn(command, context, hooks);
    const response = formatShellCommandResponse(result);
    await hooks?.onResponseProgress?.({
      chunk: response,
      response,
      phase: "command",
    });
    return response;
  }

  if (trimmed === "/repo" || trimmed === "/repo status") {
    return String(
      await getEffectiveRepositoryStatus(context.runtime, context.services),
    );
  }

  if (trimmed === "/repo diff") {
    return String(
      await getEffectiveRepositoryDiff(context.runtime, context.services),
    );
  }

  if (trimmed === "/repo log") {
    return String(
      await getEffectiveRepositoryLog(context.runtime, context.services),
    );
  }

  return undefined;
}
