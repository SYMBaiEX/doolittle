#!/usr/bin/env bun
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startCli } from "@/cli";
import { showBootSplash } from "@/cli/splash";
import {
  ensureOnboarded,
  loadLocalRuntimeEnv,
  runOnboardingWizard,
} from "@/cli/startup";
import { getAppContext } from "@/runtime/bootstrap";
import { startApiServer } from "@/server";

function repoRoot(): string {
  return fileURLToPath(new URL("../../../../", import.meta.url));
}

// ---------------------------------------------------------------------------
// Subcommand routing — previously handled by the bash wrapper
// ---------------------------------------------------------------------------

type Subcommand =
  | "start"
  | "setup"
  | "install"
  | "doctor"
  | "dev"
  | "api"
  | "gateway"
  | "plain";

function resolveSubcommand(): { command: Subcommand; rest: string[] } {
  // The first non-flag argument after the script path is the subcommand.
  // Bun.argv = [bunPath, scriptPath, ...userArgs]
  const userArgs = Bun.argv.slice(2);

  // Legacy flag-based invocation from the old bash wrapper
  if (userArgs.includes("--cli")) {
    return {
      command: "start",
      rest: userArgs.filter((a) => a !== "--cli"),
    };
  }
  if (userArgs.includes("--plain-cli")) {
    return {
      command: "plain",
      rest: userArgs.filter((a) => a !== "--plain-cli"),
    };
  }
  if (userArgs.includes("--api-only")) {
    return {
      command: "api",
      rest: userArgs.filter((a) => a !== "--api-only"),
    };
  }
  if (userArgs.includes("--gateway")) {
    return {
      command: "gateway",
      rest: userArgs.filter((a) => a !== "--gateway"),
    };
  }

  const first = userArgs[0] ?? "start";
  const rest = userArgs.slice(1);

  const aliases: Record<string, Subcommand> = {
    start: "start",
    setup: "setup",
    onboard: "setup",
    bootstrap: "setup",
    install: "install",
    doctor: "doctor",
    check: "doctor",
    dev: "dev",
    api: "api",
    gateway: "gateway",
    plain: "plain",
    "plain-cli": "plain",
  };

  return {
    command: aliases[first] ?? "start",
    rest: aliases[first] ? rest : userArgs,
  };
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const { command, rest: _rest } = resolveSubcommand();

  // ----- Delegated subcommands that don't need the full runtime -----

  if (command === "setup") {
    await runOnboardingWizard(_rest);
    return;
  }

  if (command === "doctor") {
    await runOnboardingWizard(["--check", ..._rest]);
    return;
  }

  if (command === "install") {
    const root = repoRoot();
    const installScript = resolve(root, "scripts", "install.sh");
    if (!existsSync(installScript)) {
      console.error("Install script not found at scripts/install.sh.");
      process.exit(1);
    }
    const { spawnSync } = await import("node:child_process");
    const result = spawnSync("bash", [installScript, ..._rest], {
      stdio: "inherit",
      cwd: root,
    });
    process.exit(result.status ?? 0);
  }

  // ----- Runtime subcommands need env + onboarding -----

  await ensureOnboarded();
  loadLocalRuntimeEnv();

  // Show splash for interactive CLI modes
  if (command === "start" || command === "dev" || command === "plain") {
    await showBootSplash();
  }

  // Ensure ELIZA_AGENT_MODE is set for the runtime
  if (command === "start" || command === "dev" || command === "plain") {
    process.env.ELIZA_AGENT_MODE ??= "cli";
  }

  const context = await getAppContext();
  const wantsCli =
    context.config.mode === "cli" || context.config.mode === "both";
  const wantsApi =
    context.config.mode === "api" || context.config.mode === "both";

  if (wantsApi || command === "api" || command === "gateway") {
    try {
      startApiServer(context);
      console.log(
        `${context.config.agentName} API listening on http://${context.config.host}:${context.config.port}`,
      );
    } catch (error) {
      const code =
        error instanceof Error && "code" in error ? String(error.code) : "";
      if (code === "EADDRINUSE" && command !== "api" && command !== "gateway") {
        console.warn(
          `API port ${context.config.port} is already in use. Continuing with local CLI only.`,
        );
      } else {
        throw error;
      }
    }
  }

  if (command === "gateway") {
    await context.gateway.start();
    console.log(`${context.config.agentName} gateway started.`);
  }

  const shouldStartCli =
    command === "start" ||
    command === "dev" ||
    command === "plain" ||
    (wantsCli && process.stdin.isTTY);

  if (shouldStartCli) {
    if (command === "plain") {
      Bun.argv.push("--plain-cli");
    }
    await startCli(context);
  } else if (!wantsApi && command !== "api") {
    console.log(
      `${context.config.agentName} initialized. Set ELIZA_AGENT_MODE=cli|api|both or use --cli.`,
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
