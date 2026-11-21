import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { AppLogger } from "@doolittle/agent/logging/logger";
import { writeStderrLine } from "./output";
import type { EntrypointSubcommand } from "./subcommand";

export async function handleLocalEntrypointSubcommand(input: {
  command: EntrypointSubcommand;
  rest: string[];
  repoRoot: string;
  entryLogger: AppLogger;
}): Promise<number | undefined> {
  const { command, rest, repoRoot } = input;
  switch (command) {
    case "setup":
    case "doctor": {
      const { runOnboardingWizard } = await import("../cli/startup");
      await runOnboardingWizard(
        command === "doctor" ? ["--check", ...rest] : rest,
      );
      return 0;
    }
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
    case "install": {
      const installScript = resolve(repoRoot, "scripts", "install.sh");
      if (!existsSync(installScript)) {
        input.entryLogger.error("install-script-missing", { installScript });
        writeStderrLine("Install script not found at scripts/install.sh.");
        return 1;
      }
      const { runInheritedTextProcess } = await import(
        "@doolittle/agent/services/process-execution"
      );
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
