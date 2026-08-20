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
        runProcess: vi.fn(async () => ({ exitCode: 0 })) as never,
        renderCommandCatalog: vi.fn(() => "catalog"),
        runDesktopCommand: vi.fn(async () => ({ exitCode: 0 })),
        runNativeToolCommand: vi.fn(async () => ({ exitCode: 0 })),
        runAcpServer: vi.fn(async () => {}),
      },
    );

    expect(handled).toBe(true);
    expect(printLine).toHaveBeenCalledWith("help text");
  });

  it("prints the product version without booting the runtime", async () => {
    const printLine = vi.fn(() => {});

    const handled = await handleLocalEntrypointSubcommand(
      {
        command: "version",
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
        runProcess: vi.fn(async () => ({ exitCode: 0 })) as never,
        renderCommandCatalog: vi.fn(() => "catalog"),
        runDesktopCommand: vi.fn(async () => ({ exitCode: 0 })),
        runNativeToolCommand: vi.fn(async () => ({ exitCode: 0 })),
        runAcpServer: vi.fn(async () => {}),
      },
    );

    expect(handled).toBe(true);
    expect(printLine).toHaveBeenCalledWith("Doolittle 0.1.0");
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
        runProcess: vi.fn(async () => ({ exitCode: 0 })) as never,
        renderCommandCatalog: vi.fn(() => "catalog"),
        runDesktopCommand: vi.fn(async () => ({ exitCode: 0 })),
        runNativeToolCommand: vi.fn(async () => ({ exitCode: 0 })),
        runAcpServer: vi.fn(async () => {}),
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
        runProcess: vi.fn(async () => ({ exitCode: 0 })) as never,
        renderCommandCatalog: vi.fn(() => "catalog"),
        runDesktopCommand: vi.fn(async () => ({ exitCode: 0 })),
        runNativeToolCommand: vi.fn(async () => ({ exitCode: 0 })),
        runAcpServer: vi.fn(async () => {}),
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
    const runDesktopCommand = vi.fn(async () => ({ exitCode: 0 }));
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
        runProcess: vi.fn(async () => ({ exitCode: 0 })) as never,
        renderCommandCatalog: vi.fn(() => "catalog"),
        runDesktopCommand,
        runNativeToolCommand: vi.fn(async () => ({ exitCode: 0 })),
        runAcpServer: vi.fn(async () => {}),
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

  it("routes ACP through the protocol-only stdio entrypoint", async () => {
    const runAcpServer = vi.fn(async () => {});
    const handled = await handleLocalEntrypointSubcommand(
      {
        command: "acp",
        rest: [],
        repoRoot: "/repo",
        renderTopLevelHelp: () => "help text",
        entryLogger: createLogger() as never,
        runOnboardingWizard: async () => {},
      },
      {
        existsSync: vi.fn(() => true),
        resolve: ((...parts: string[]) => parts.join("/")) as never,
        runProcess: vi.fn(async () => ({ exitCode: 0 })) as never,
        renderCommandCatalog: vi.fn(() => "catalog"),
        runDesktopCommand: vi.fn(async () => ({ exitCode: 0 })),
        runNativeToolCommand: vi.fn(async () => ({ exitCode: 0 })),
        runAcpServer,
      },
    );

    expect(handled).toBe(true);
    expect(runAcpServer).toHaveBeenCalledOnce();
  });

  it("routes native tooling without booting the Eliza runtime", async () => {
    const exit = vi.fn(() => {});
    const runNativeToolCommand = vi.fn(async () => ({ exitCode: 0 }));
    const handled = await handleLocalEntrypointSubcommand(
      {
        command: "native",
        rest: ["coverage"],
        repoRoot: "/repo",
        renderTopLevelHelp: () => "help text",
        entryLogger: createLogger() as never,
        runOnboardingWizard: async () => {},
        exit,
      },
      {
        existsSync: vi.fn(() => true),
        resolve: ((...parts: string[]) => parts.join("/")) as never,
        runProcess: vi.fn(async () => ({ exitCode: 0 })) as never,
        renderCommandCatalog: vi.fn(() => "catalog"),
        runDesktopCommand: vi.fn(async () => ({ exitCode: 0 })),
        runNativeToolCommand,
        runAcpServer: vi.fn(async () => {}),
      },
    );

    expect(handled).toBe(true);
    expect(runNativeToolCommand).toHaveBeenCalledWith({
      repoRoot: "/repo",
      args: ["coverage"],
      printLine: console.log,
    });
    expect(exit).toHaveBeenCalledWith(0);
  });
});
