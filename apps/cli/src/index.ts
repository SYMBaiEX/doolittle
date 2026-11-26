#!/usr/bin/env nub
import { randomUUID } from "node:crypto";
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { AppLogger } from "@doolittle/agent/logging/logger";
import { DOOLITTLE_VERSION } from "@doolittle/agent/version";
import { renderHelp } from "./entrypoint/help";
import {
  CliUsageError,
  resolveHelpTopic,
  resolveSubcommand,
} from "./entrypoint/subcommand";

function appendTextFile(path: string, text: string): void {
  try {
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, text, "utf8");
  } catch {
    // Fatal reporting must never replace the original process failure.
  }
}

/**
 * Fatal telemetry belongs in the local operations logs. The user stderr channel
 * gets exactly one concise error line below, not a structured record and stack.
 */
function recordFatalTelemetry(
  logger: AppLogger,
  label: string,
  detail: string,
): void {
  const at = new Date().toISOString();
  const eventLogPath = logger.getEventLogPath();
  if (eventLogPath) {
    appendTextFile(
      eventLogPath,
      `${JSON.stringify({
        id: randomUUID(),
        at,
        level: "error",
        scope: logger.scope,
        message: label,
        detail,
        fields: { crash: true, entrypoint: true },
      })}\n`,
    );
  }
  const crashLogPath = logger.getCrashLogPath();
  if (crashLogPath) {
    appendTextFile(
      crashLogPath,
      `[${at}] ${label} (${logger.scope})\n${detail}\n\n`,
    );
  }
}

async function main(): Promise<number> {
  const selection = resolveSubcommand();
  switch (selection.command) {
    case "help":
      console.log(renderHelp(resolveHelpTopic(selection.rest[0])));
      return 0;
    case "version":
      console.log(`Doolittle ${DOOLITTLE_VERSION}`);
      return 0;
    case "commands": {
      const [{ getDefaultRepoRoot }, { renderCommandCatalog }] =
        await Promise.all([
          import("@doolittle/agent/config/env/paths"),
          import("@doolittle/agent/runtime/command-catalog"),
        ]);
      const query = selection.rest.join(" ").trim();
      console.log(
        renderCommandCatalog(query || undefined, 80, getDefaultRepoRoot()),
      );
      return 0;
    }
  }

  // Snapshot the launch environment before any configuration or plugins load.
  await import("./entrypoint/host-execution");
  const [
    { getDefaultRepoRoot },
    { getEntrypointLogger },
    { handleLocalEntrypointSubcommand },
  ] = await Promise.all([
    import("@doolittle/agent/config/env/paths"),
    import("@doolittle/agent/logging/entrypoint-logger"),
    import("./entrypoint/local-subcommands"),
  ]);
  const entryLogger = getEntrypointLogger("index");
  const repoRoot = getDefaultRepoRoot();
  const localExitCode = await handleLocalEntrypointSubcommand({
    ...selection,
    repoRoot,
    entryLogger,
  });
  if (localExitCode !== undefined) return localExitCode;

  const [
    { resolveEntrypointInvocation },
    { handleEntrypointInitialCommandFlow },
  ] = await Promise.all([
    import("./entrypoint/invocation"),
    import("./entrypoint/initial-command-flow"),
  ]);
  const invocation = await resolveEntrypointInvocation(selection, { repoRoot });
  const initialExitCode = await handleEntrypointInitialCommandFlow({
    ...invocation,
    entryLogger,
    launcherPath: process.argv[1],
  });
  if (initialExitCode !== undefined) return initialExitCode;
  const { runEntrypointRuntime } = await import("./entrypoint/runtime-command");
  return runEntrypointRuntime(invocation, entryLogger, import.meta.url);
}

// Keep one lightweight handle alive while long-lived TUI/server startup
// promises are being assembled.
const entryKeepAlive = setInterval(() => {}, 60_000);

main()
  .then((exitCode) => {
    process.exitCode = exitCode;
  })
  .catch(async (error) => {
    if (error instanceof CliUsageError) {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 1;
      return;
    }
    const [
      { getEntrypointLogger },
      { formatLoggerError },
      { getCliErrorMessage },
      { restoreTerminalState, sanitizeTerminalText },
      { writeStderrLine },
      { isCliStartupExitError },
      { isRecoverableTopLevelRuntimeError },
    ] = await Promise.all([
      import("@doolittle/agent/logging/entrypoint-logger"),
      import("@doolittle/agent/logging/logger"),
      import("./cli/execution/types"),
      import("./cli/render-utils"),
      import("./entrypoint/output"),
      import("./cli/startup"),
      import("./entrypoint/runtime-errors"),
    ]);
    restoreTerminalState();
    if (isCliStartupExitError(error)) {
      process.exitCode = error.exitCode;
      return;
    }
    recordFatalTelemetry(
      getEntrypointLogger("index"),
      "entrypoint-main-failed",
      formatLoggerError(error),
    );
    const userMessage = isRecoverableTopLevelRuntimeError(error)
      ? getCliErrorMessage(error)
      : String(error);
    writeStderrLine(
      sanitizeTerminalText(userMessage, {
        preserveNewlines: false,
        collapseWhitespace: true,
        maxTokenLength: 4_000,
      }) || "Doolittle failed unexpectedly.",
    );
    process.exit(1);
  })
  .finally(() => {
    clearInterval(entryKeepAlive);
  });
