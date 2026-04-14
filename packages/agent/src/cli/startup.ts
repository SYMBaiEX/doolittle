/**
 * Pre-boot startup logic.
 *
 * Consolidates the environment setup and onboarding checks that were
 * previously scattered across the former bash `bin/doolittle` wrapper.
 * This lets the entire startup flow live in TypeScript.
 */

import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getEntrypointLogger } from "@/logging/entrypoint-logger";

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
  // packages/agent/src/cli/startup.ts → ../../../../ = repo root
  return fileURLToPath(new URL("../../../../", import.meta.url));
}

/**
 * Set up the local runtime environment variables that the bash wrapper
 * previously handled in `load_local_runtime_env()`.
 *
 * - Ensures PGLITE_DATA_DIR exists
 * - Sets LOG_LEVEL / DEFAULT_LOG_LEVEL defaults
 * - Unsets DATABASE_URL / POSTGRES_URL if they aren't explicitly declared
 *   in the project .env file (prevents PGLite from being bypassed by a
 *   stale shell export).
 */
export function loadLocalRuntimeEnv(): void {
  const root = repoRoot();
  const dataDir = resolve(root, ".doolittle");

  process.env.PGLITE_DATA_DIR ??= resolve(dataDir, "pglite");
  process.env.LOG_LEVEL ??= "error";
  process.env.DEFAULT_LOG_LEVEL ??= process.env.LOG_LEVEL;

  mkdirSync(process.env.PGLITE_DATA_DIR, { recursive: true });

  const envFile = resolve(root, ".env");
  if (existsSync(envFile)) {
    try {
      const content = readFileSync(envFile, "utf-8");
      const hasDatabaseUrl = /^\s*(DATABASE_URL|POSTGRES_URL)\s*=/m.test(
        content,
      );
      if (!hasDatabaseUrl) {
        delete process.env.DATABASE_URL;
        delete process.env.POSTGRES_URL;
      }
    } catch {
      // If we can't read .env, clean up stale vars to be safe
      delete process.env.DATABASE_URL;
      delete process.env.POSTGRES_URL;
    }
  } else {
    delete process.env.DATABASE_URL;
    delete process.env.POSTGRES_URL;
  }
}

/**
 * Check whether the onboarding wizard has been completed.
 * Returns true if onboarded, false if setup is still needed.
 */
export function isOnboarded(): boolean {
  const root = repoRoot();
  return existsSync(resolve(root, ".doolittle", "onboarding.json"));
}

/**
 * Run the onboarding bootstrap wizard. Dynamically imports the
 * bootstrap script so it's only loaded when needed.
 */
export async function runOnboardingWizard(args: string[] = []): Promise<void> {
  const root = repoRoot();
  const bootstrapPath = resolve(root, "scripts", "bootstrap.ts");
  const logger = getEntrypointLogger("cli.startup", {
    dataDir: resolve(root, ".doolittle"),
  });

  if (!existsSync(bootstrapPath)) {
    logger.error("bootstrap-script-missing", {
      bootstrapPath,
    });
    console.error(
      "Onboarding script not found at scripts/bootstrap.ts. Run 'bun install' first.",
    );
    throw new CliStartupExitError(1);
  }

  const { spawnSync } = await import("node:child_process");
  const result = spawnSync("bun", ["run", bootstrapPath, ...args], {
    stdio: "inherit",
    cwd: root,
  });
  if (result.status !== 0) {
    logger.warn("bootstrap-wizard-exited-nonzero", {
      status: result.status ?? 1,
      args,
    });
    throw new CliStartupExitError(result.status ?? 1);
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
    dataDir: resolve(repoRoot(), ".doolittle"),
  });
  if (process.stdin.isTTY && process.stdout.isTTY) {
    logger.info("onboarding-missing-starting-wizard");
    console.log(
      "No onboarding state found. Beginning first contact so I can finish setup.",
    );
    await runOnboardingWizard();
  } else {
    logger.warn("onboarding-missing-noninteractive");
    console.error(
      "No onboarding state found. Run 'doolittle setup' to finish onboarding, or 'doolittle doctor' to inspect readiness first.",
    );
    throw new CliStartupExitError(1);
  }
}
