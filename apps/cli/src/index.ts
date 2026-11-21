#!/usr/bin/env nub
import { DOOLITTLE_VERSION } from "@doolittle/agent/version";
import { renderTopLevelHelp } from "./entrypoint/help";
import { resolveSubcommand } from "./entrypoint/subcommand";

async function main(): Promise<number> {
  const selection = resolveSubcommand();
  switch (selection.command) {
    case "help":
      console.log(renderTopLevelHelp());
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
    const [
      { getEntrypointLogger },
      { getCliErrorMessage },
      { restoreTerminalState },
      { writeStderrLine },
      { isCliStartupExitError },
      { isRecoverableTopLevelRuntimeError },
    ] = await Promise.all([
      import("@doolittle/agent/logging/entrypoint-logger"),
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
    getEntrypointLogger("index").captureError("entrypoint-main-failed", error);
    if (isRecoverableTopLevelRuntimeError(error)) {
      writeStderrLine(getCliErrorMessage(error));
    } else {
      writeStderrLine(String(error));
    }
    process.exit(1);
  })
  .finally(() => {
    clearInterval(entryKeepAlive);
  });
