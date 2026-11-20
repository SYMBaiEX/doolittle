import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { AppLogger } from "@doolittle/agent/logging/logger";
import { renderCommandCatalog } from "@doolittle/agent/runtime/command-catalog";
import { runInheritedTextProcess } from "@doolittle/agent/services/process-execution";
import { DOOLITTLE_VERSION } from "@doolittle/agent/version";
import type { EntrypointSubcommand } from "./subcommand";

export async function handleLocalEntrypointSubcommand(input: {
  command: EntrypointSubcommand;
  rest: string[];
  repoRoot: string;
  renderTopLevelHelp: () => string;
  entryLogger: AppLogger;
  runOnboardingWizard: (args: string[]) => Promise<void>;
  writeStderrLine: (message: string) => void;
}): Promise<number | undefined> {
  const { command, rest, repoRoot, writeStderrLine } = input;
  switch (command) {
    case "help":
      console.log(input.renderTopLevelHelp());
      return 0;
    case "version":
      console.log(`Doolittle ${DOOLITTLE_VERSION}`);
      return 0;
    case "commands":
      console.log(
        renderCommandCatalog(rest.join(" ").trim() || undefined, 80, repoRoot),
      );
      return 0;
    case "setup":
    case "doctor":
      await input.runOnboardingWizard(
        command === "doctor" ? ["--check", ...rest] : rest,
      );
      return 0;
    case "desktop":
    case "native": {
      const args = { repoRoot, args: rest };
      const result =
        command === "desktop"
          ? await (await import("./desktop-command")).runDesktopCommand(args)
          : await (await import("./native-tool-command")).runNativeToolCommand(
              args,
            );
      if (result.message) writeStderrLine(result.message);
      return result.exitCode;
    }
    case "acp":
      await (await import("./acp-server")).startAcpServer();
      return 0;
    case "native-api":
      if (rest.length) {
        writeStderrLine("Native API takes no command arguments.");
        return 1;
      }
      await (await import("./native-api")).runNativeApi();
      // SDK background retry timers may outlive the disposed runtime.
      return process.exit(0);
    case "install": {
      const installScript = resolve(repoRoot, "scripts", "install.sh");
      if (!existsSync(installScript)) {
        input.entryLogger.error("install-script-missing", { installScript });
        writeStderrLine("Install script not found at scripts/install.sh.");
        return 1;
      }
      const result = await runInheritedTextProcess(
        "bash",
        [installScript, ...rest],
        { cwd: repoRoot, toolName: "doolittle.cli.install" },
      );
      return result.exitCode;
    }
    default:
      return undefined;
  }
}
