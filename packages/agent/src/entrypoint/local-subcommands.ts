import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { AppLogger } from "@/logging/logger";
import { renderCommandCatalog } from "@/runtime/command-catalog";
import type { EntrypointSubcommand } from "./subcommand";

interface LocalSubcommandDeps {
  existsSync: typeof existsSync;
  resolve: typeof resolve;
  spawnSync: typeof spawnSync;
  renderCommandCatalog: typeof renderCommandCatalog;
}

const localSubcommandDeps: LocalSubcommandDeps = {
  existsSync,
  resolve,
  spawnSync,
  renderCommandCatalog,
};

export async function handleLocalEntrypointSubcommand(
  input: {
    command: EntrypointSubcommand;
    rest: string[];
    repoRoot: string;
    renderTopLevelHelp: () => string;
    entryLogger: AppLogger;
    runOnboardingWizard: (args: string[]) => Promise<void>;
    printLine?: (message: string) => void;
    writeStderrLine?: (message: string) => void;
    exit?: (code: number) => void;
  },
  deps: LocalSubcommandDeps = localSubcommandDeps,
): Promise<boolean> {
  const printLine = input.printLine ?? console.log;
  const writeStderrLine =
    input.writeStderrLine ??
    ((message) => process.stderr.write(`${message}\n`));
  const exit = input.exit ?? process.exit;

  if (input.command === "help") {
    printLine(input.renderTopLevelHelp());
    return true;
  }

  if (input.command === "commands") {
    printLine(
      deps.renderCommandCatalog(
        input.rest.join(" ").trim() || undefined,
        80,
        input.repoRoot,
      ),
    );
    return true;
  }

  if (input.command === "setup") {
    await input.runOnboardingWizard(input.rest);
    return true;
  }

  if (input.command === "doctor") {
    await input.runOnboardingWizard(["--check", ...input.rest]);
    return true;
  }

  if (input.command === "install") {
    const installScript = deps.resolve(input.repoRoot, "scripts", "install.sh");
    if (!deps.existsSync(installScript)) {
      input.entryLogger.error("install-script-missing", {
        installScript,
      });
      writeStderrLine("Install script not found at scripts/install.sh.");
      exit(1);
      return true;
    }

    const result = deps.spawnSync("bash", [installScript, ...input.rest], {
      stdio: "inherit",
      cwd: input.repoRoot,
    });
    exit(result.status ?? 0);
    return true;
  }

  return false;
}
