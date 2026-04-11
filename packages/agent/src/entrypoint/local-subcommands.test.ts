import { describe, expect, it, mock } from "bun:test";
import { handleLocalEntrypointSubcommand } from "./local-subcommands";

function createLogger() {
  return {
    error: mock(() => {}),
  };
}

describe("handleLocalEntrypointSubcommand", () => {
  it("prints top-level help for the help command", async () => {
    const printLine = mock(() => {});

    const handled = await handleLocalEntrypointSubcommand(
      {
        command: "help",
        rest: [],
        repoRoot: "/repo",
        renderTopLevelHelp: () => "help text",
        entryLogger: createLogger() as never,
        runOnboardingWizard: async () => {},
        printLine,
      },
      {
        existsSync: mock(() => true) as never,
        resolve: ((...parts: string[]) => parts.join("/")) as never,
        spawnSync: mock(() => ({ status: 0 })) as never,
        renderCommandCatalog: mock(() => "catalog"),
      },
    );

    expect(handled).toBe(true);
    expect(printLine).toHaveBeenCalledWith("help text");
  });

  it("routes doctor through onboarding with the check flag", async () => {
    const runOnboardingWizard = mock(async () => {});

    const handled = await handleLocalEntrypointSubcommand(
      {
        command: "doctor",
        rest: ["--verbose"],
        repoRoot: "/repo",
        renderTopLevelHelp: () => "help text",
        entryLogger: createLogger() as never,
        runOnboardingWizard,
      },
      {
        existsSync: mock(() => true) as never,
        resolve: ((...parts: string[]) => parts.join("/")) as never,
        spawnSync: mock(() => ({ status: 0 })) as never,
        renderCommandCatalog: mock(() => "catalog"),
      },
    );

    expect(handled).toBe(true);
    expect(runOnboardingWizard).toHaveBeenCalledWith(["--check", "--verbose"]);
  });

  it("fails install cleanly when the install script is missing", async () => {
    const entryLogger = createLogger();
    const writeStderrLine = mock(() => {});
    const exit = mock(() => {});

    const handled = await handleLocalEntrypointSubcommand(
      {
        command: "install",
        rest: [],
        repoRoot: "/repo",
        renderTopLevelHelp: () => "help text",
        entryLogger: entryLogger as never,
        runOnboardingWizard: async () => {},
        writeStderrLine,
        exit,
      },
      {
        existsSync: mock(() => false),
        resolve: ((...parts: string[]) => parts.join("/")) as never,
        spawnSync: mock(() => ({ status: 0 })) as never,
        renderCommandCatalog: mock(() => "catalog"),
      },
    );

    expect(handled).toBe(true);
    expect(entryLogger.error).toHaveBeenCalledWith("install-script-missing", {
      installScript: "/repo/scripts/install.sh",
    });
    expect(writeStderrLine).toHaveBeenCalledWith(
      "Install script not found at scripts/install.sh.",
    );
    expect(exit).toHaveBeenCalledWith(1);
  });
});
