import { describe, expect, it, vi } from "vitest";
import { handleEntrypointInitialCommandFlow } from "./initial-command-flow";

function createLogger() {
  return {
    warn: vi.fn(() => {}),
    error: vi.fn(() => {}),
    info: vi.fn(() => {}),
    debug: vi.fn(() => {}),
    captureError: vi.fn(() => {}),
    child: vi.fn(() => createLogger()),
  };
}

describe("handleEntrypointInitialCommandFlow", () => {
  it("loads local runtime env before handing off the jobs surface", async () => {
    const loadLocalRuntimeEnv = vi.fn(() => {});
    const handleJobsSubcommand = vi.fn(async () => {});

    const handled = await handleEntrypointInitialCommandFlow(
      {
        command: "jobs",
        rest: ["list"],
        repoRoot: "/repo",
        renderTopLevelHelp: () => "help",
        entryLogger: createLogger() as never,
      },
      {
        handleLocalEntrypointSubcommand: vi.fn(async () => false) as never,
        shouldLoadLocalRuntimeEnvForEntrypoint: vi.fn(() => true) as never,
        loadLocalRuntimeEnv,
        handleJobsSubcommand,
        handleStaticPromptCommand: vi.fn(async () => false) as never,
        handleBackgroundExec: vi.fn(async () => false) as never,
        loadConfig: vi.fn(() => ({ dataDir: "/tmp/data" })) as never,
        cliJobStatusSummary: vi.fn(() => "summary") as never,
        getCliJob: vi.fn(() => undefined) as never,
        renderCliJobReplay: vi.fn(() => "") as never,
        attachCliJob: vi.fn(async () => undefined) as never,
        cancelCliJob: vi.fn(() => undefined) as never,
        renderCliTurnEvent: vi.fn(() => "event") as never,
      },
    );

    expect(handled).toBe(true);
    expect(loadLocalRuntimeEnv).toHaveBeenCalledTimes(1);
    expect(handleJobsSubcommand).toHaveBeenCalledTimes(1);
  });

  it("shows exec usage before runtime boot when the prompt is missing", async () => {
    const writeStderrLine = vi.fn(() => {});
    const exit = vi.fn(() => {});
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
        handleLocalEntrypointSubcommand: vi.fn(async () => false) as never,
        shouldLoadLocalRuntimeEnvForEntrypoint: vi.fn(() => false) as never,
        loadLocalRuntimeEnv: vi.fn(() => {}) as never,
        handleJobsSubcommand: vi.fn(async () => {}) as never,
        handleStaticPromptCommand: vi.fn(async () => false) as never,
        handleBackgroundExec: vi.fn(async () => false) as never,
        loadConfig: vi.fn(() => ({ dataDir: "/tmp/data" })) as never,
        cliJobStatusSummary: vi.fn(() => "summary") as never,
        getCliJob: vi.fn(() => undefined) as never,
        renderCliJobReplay: vi.fn(() => "") as never,
        attachCliJob: vi.fn(async () => undefined) as never,
        cancelCliJob: vi.fn(() => undefined) as never,
        renderCliTurnEvent: vi.fn(() => "event") as never,
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
