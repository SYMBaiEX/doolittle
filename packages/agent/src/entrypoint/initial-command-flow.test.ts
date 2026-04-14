import { describe, expect, it, mock } from "bun:test";
import { handleEntrypointInitialCommandFlow } from "./initial-command-flow";

function createLogger() {
  return {
    warn: mock(() => {}),
    error: mock(() => {}),
    info: mock(() => {}),
    debug: mock(() => {}),
    captureError: mock(() => {}),
    child: mock(() => createLogger()),
  };
}

describe("handleEntrypointInitialCommandFlow", () => {
  it("loads local runtime env before handing off the jobs surface", async () => {
    const loadLocalRuntimeEnv = mock(() => {});
    const handleJobsSubcommand = mock(async () => {});

    const handled = await handleEntrypointInitialCommandFlow(
      {
        command: "jobs",
        rest: ["list"],
        repoRoot: "/repo",
        renderTopLevelHelp: () => "help",
        entryLogger: createLogger() as never,
      },
      {
        handleLocalEntrypointSubcommand: mock(async () => false) as never,
        shouldLoadLocalRuntimeEnvForEntrypoint: mock(() => true) as never,
        loadLocalRuntimeEnv,
        handleJobsSubcommand,
        handleStaticPromptCommand: mock(async () => false) as never,
        handleBackgroundExec: mock(async () => false) as never,
        loadConfig: mock(() => ({ dataDir: "/tmp/data" })) as never,
        cliJobStatusSummary: mock(() => "summary") as never,
        getCliJob: mock(() => undefined) as never,
        renderCliJobReplay: mock(() => "") as never,
        attachCliJob: mock(async () => undefined) as never,
        cancelCliJob: mock(() => undefined) as never,
        renderCliTurnEvent: mock(() => "event") as never,
      },
    );

    expect(handled).toBe(true);
    expect(loadLocalRuntimeEnv).toHaveBeenCalledTimes(1);
    expect(handleJobsSubcommand).toHaveBeenCalledTimes(1);
  });

  it("shows exec usage before runtime boot when the prompt is missing", async () => {
    const writeStderrLine = mock(() => {});
    const exit = mock(() => {});
    const entryLogger = createLogger();

    const handled = await handleEntrypointInitialCommandFlow(
      {
        command: "exec",
        rest: [],
        repoRoot: "/repo",
        renderTopLevelHelp: () => "help",
        entryLogger: entryLogger as never,
        oneShot: {
          json: false,
          jsonStream: false,
          background: false,
        },
        writeStderrLine,
        exit,
      },
      {
        handleLocalEntrypointSubcommand: mock(async () => false) as never,
        shouldLoadLocalRuntimeEnvForEntrypoint: mock(() => false) as never,
        loadLocalRuntimeEnv: mock(() => {}) as never,
        handleJobsSubcommand: mock(async () => {}) as never,
        handleStaticPromptCommand: mock(async () => false) as never,
        handleBackgroundExec: mock(async () => false) as never,
        loadConfig: mock(() => ({ dataDir: "/tmp/data" })) as never,
        cliJobStatusSummary: mock(() => "summary") as never,
        getCliJob: mock(() => undefined) as never,
        renderCliJobReplay: mock(() => "") as never,
        attachCliJob: mock(async () => undefined) as never,
        cancelCliJob: mock(() => undefined) as never,
        renderCliTurnEvent: mock(() => "event") as never,
      },
    );

    expect(handled).toBe(true);
    expect(entryLogger.warn).toHaveBeenCalledWith("exec-usage");
    expect(writeStderrLine).toHaveBeenCalledWith(
      'Usage: doolittle exec --prompt "your request" [--json]',
    );
    expect(exit).toHaveBeenCalledWith(1);
  });
});
