/**
 * Pre-boot startup logic.
 *
 * Consolidates the environment setup and onboarding checks that were
 * previously scattered across the former bash `bin/doolittle` wrapper.
 * This lets the entire startup flow live in TypeScript.
 */

import { existsSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { loadApplicationEnv } from "@doolittle/agent/config/env";
import { getDefaultRepoRoot } from "@doolittle/agent/config/env/paths";
import { getEntrypointLogger } from "@doolittle/agent/logging/entrypoint-logger";

export class CliStartupExitError extends Error {
  readonly exitCode: number;

  constructor(exitCode: number) {
    super(`CLI startup requested exit ${exitCode}`);
    this.name = "CliStartupExitError";
    this.exitCode = exitCode;
  }
}

export function isCliStartupExitError(
  error: unknown,
): error is CliStartupExitError {
  return error instanceof CliStartupExitError;
}

function repoRoot(): string {
  return getDefaultRepoRoot();
}

function runtimeDataDir(root: string): string {
  const configuredDataDir = process.env.DOOLITTLE_DATA_DIR?.trim();
  if (!configuredDataDir) {
    return resolve(root, ".doolittle");
  }
  return isAbsolute(configuredDataDir)
    ? configuredDataDir
    : resolve(root, configuredDataDir);
}

/**
 * Set up the local runtime environment variables that the bash wrapper
 * previously handled in `load_local_runtime_env()`.
 *
 * - Sets the default path for the SDK-owned PGlite database
 * - Sets LOG_LEVEL / DEFAULT_LOG_LEVEL defaults
 * - Unsets DATABASE_URL / POSTGRES_URL if they aren't explicitly declared
 *   in the project .env file (prevents PGLite from being bypassed by a
 *   stale shell export).
 */
export function loadLocalRuntimeEnv(): void {
  const declaresDatabaseUrl = loadApplicationEnv();
  const root = repoRoot();
  const dataDir = runtimeDataDir(root);

  process.env.PGLITE_DATA_DIR ??= resolve(dataDir, "pglite");
  process.env.LOG_LEVEL ??= "error";
  process.env.DEFAULT_LOG_LEVEL ??= process.env.LOG_LEVEL;

  // A worker may never attach to an inherited external Postgres connection.
  if (process.env.DOOLITTLE_BOT_RUNTIME === "worker" || !declaresDatabaseUrl) {
    delete process.env.DATABASE_URL;
    delete process.env.POSTGRES_URL;
  }
}

/**
 * Check whether the onboarding wizard has been completed.
 * Returns true if onboarded, false if setup is still needed.
 */
export function isOnboarded(): boolean {
  loadApplicationEnv();
  const root = repoRoot();
  return existsSync(resolve(runtimeDataDir(root), "onboarding.json"));
}

/**
 * Run the onboarding bootstrap wizard. Dynamically imports the
 * bootstrap script so it's only loaded when needed.
 */
export async function runOnboardingWizard(args: string[] = []): Promise<void> {
  const root = repoRoot();
  const bootstrapPath = resolve(root, "scripts", "bootstrap.ts");
  const logger = getEntrypointLogger("cli.startup", {
    dataDir: runtimeDataDir(root),
  });

  if (!existsSync(bootstrapPath)) {
    logger.error("bootstrap-script-missing", {
      bootstrapPath,
    });
    console.error(
      "Onboarding script not found at scripts/bootstrap.ts. Run 'nub install' first.",
    );
    throw new CliStartupExitError(1);
  }

  const localNub = resolve(
    root,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "nub.cmd" : "nub",
  );
  const { runInheritedTextProcess } = await import(
    "@doolittle/agent/services/process-execution"
  );
  const result = await runInheritedTextProcess(
    existsSync(localNub) ? localNub : "nub",
    [bootstrapPath, ...args],
    {
      cwd: root,
      toolName: "doolittle.cli.onboarding",
    },
  );
  if (result.exitCode !== 0) {
    logger.warn("bootstrap-wizard-exited-nonzero", {
      status: result.exitCode,
      args,
    });
    throw new CliStartupExitError(result.exitCode);
  }
}

/**
 * Ensure the agent has been onboarded. If not, either runs the wizard
 * interactively or exits with guidance.
 */
export async function ensureOnboarded(): Promise<void> {
  if (isOnboarded()) {
    return;
  }

  const logger = getEntrypointLogger("cli.startup", {
    dataDir: runtimeDataDir(repoRoot()),
  });
  if (process.stdin.isTTY && process.stdout.isTTY) {
    logger.info("onboarding-missing-starting-wizard");
    console.log(
      "No onboarding state found. Beginning first contact so I can finish setup.",
    );
    await runOnboardingWizard();
    // The wizard runs in a child process and can create the repository .env.
    loadApplicationEnv({ reload: true });
  } else {
    logger.warn("onboarding-missing-noninteractive");
    console.error(
      "No onboarding state found. Run 'doolittle setup' to finish onboarding, or 'doolittle doctor' to inspect readiness first.",
    );
    throw new CliStartupExitError(1);
  }
}
