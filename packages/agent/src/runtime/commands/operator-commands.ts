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
} from "@/runtime/native/service-bridge/index";
import type { ChatTurnRequest } from "@/types/runtime";
import type { AgentExecutionContext, AgentTurnHooks } from "../chat";

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
    return checks
      .map(
        (check) =>
          `[${check.status.toUpperCase()}] ${check.summary}: ${check.detail}`,
      )
      .join("\n");
  }

  if (trimmed === "/setup" || trimmed === "/setup checklist") {
    const checklist = await context.services.diagnostics.setupChecklist();
    return checklist.map((item, index) => `${index + 1}. ${item}`).join("\n");
  }

  if (trimmed === "/setup summary") {
    return JSON.stringify(
      await context.services.operator.setupSummary(),
      null,
      2,
    );
  }

  if (trimmed === "/update" || trimmed === "/update preview") {
    return JSON.stringify(
      await context.services.operator.updatePreview(),
      null,
      2,
    );
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
