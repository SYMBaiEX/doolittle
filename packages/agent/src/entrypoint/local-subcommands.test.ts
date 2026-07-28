import { describe, expect, it, vi } from "vitest";
import { handleLocalEntrypointSubcommand } from "./local-subcommands";

function createLogger() {
  return {
    error: vi.fn(() => {}),
  };
}

describe("handleLocalEntrypointSubcommand", () => {
  it("prints top-level help for the help command", async () => {
    const printLine = vi.fn(() => {});

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
        existsSync: vi.fn(() => true) as never,
        resolve: ((...parts: string[]) => parts.join("/")) as never,
        spawnSync: vi.fn(() => ({ status: 0 })) as never,
        renderCommandCatalog: vi.fn(() => "catalog"),
        runDesktopCommand: vi.fn(() => ({ exitCode: 0 })),
      },
    );

    expect(handled).toBe(true);
    expect(printLine).toHaveBeenCalledWith("help text");
  });

  it("routes doctor through onboarding with the check flag", async () => {
    const runOnboardingWizard = vi.fn(async () => {});

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
        existsSync: vi.fn(() => true) as never,
        resolve: ((...parts: string[]) => parts.join("/")) as never,
        spawnSync: vi.fn(() => ({ status: 0 })) as never,
        renderCommandCatalog: vi.fn(() => "catalog"),
        runDesktopCommand: vi.fn(() => ({ exitCode: 0 })),
      },
    );

    expect(handled).toBe(true);
    expect(runOnboardingWizard).toHaveBeenCalledWith(["--check", "--verbose"]);
  });

  it("fails install cleanly when the install script is missing", async () => {
    const entryLogger = createLogger();
    const writeStderrLine = vi.fn(() => {});
    const exit = vi.fn(() => {});

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
        existsSync: vi.fn(() => false),
        resolve: ((...parts: string[]) => parts.join("/")) as never,
        spawnSync: vi.fn(() => ({ status: 0 })) as never,
        renderCommandCatalog: vi.fn(() => "catalog"),
        runDesktopCommand: vi.fn(() => ({ exitCode: 0 })),
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

  it("routes desktop launches before runtime startup", async () => {
    const exit = vi.fn(() => {});
    const runDesktopCommand = vi.fn(() => ({ exitCode: 0 }));
    const handled = await handleLocalEntrypointSubcommand(
      {
        command: "desktop",
        rest: ["--skip-build"],
        repoRoot: "/repo",
        renderTopLevelHelp: () => "help text",
        entryLogger: createLogger() as never,
        runOnboardingWizard: async () => {},
        exit,
      },
      {
        existsSync: vi.fn(() => true),
        resolve: ((...parts: string[]) => parts.join("/")) as never,
        spawnSync: vi.fn(() => ({ status: 0 })) as never,
        renderCommandCatalog: vi.fn(() => "catalog"),
        runDesktopCommand,
      },
    );

    expect(handled).toBe(true);
    expect(runDesktopCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        repoRoot: "/repo",
        args: ["--skip-build"],
      }),
    );
    expect(exit).toHaveBeenCalledWith(0);
  });
});
