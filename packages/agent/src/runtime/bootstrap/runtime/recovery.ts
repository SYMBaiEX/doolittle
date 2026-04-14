import { existsSync } from "node:fs";
import { join } from "node:path";
import type { AgentRuntime } from "@elizaos/core";
import { getEntrypointLogger } from "@/logging/entrypoint-logger";
import { getPgliteRecoveryAction } from "@/runtime/bootstrap/recovery/actions";
import { formatError } from "@/runtime/bootstrap/recovery/error-format";
import {
  createActivePgliteLockError,
  createPgliteRecoveryMessage,
  createPgliteRetryFailureError,
} from "@/runtime/bootstrap/recovery/messaging";
import { reconcilePglitePidFile } from "@/runtime/bootstrap/recovery/pid-file";
import {
  resetPgliteDataDir,
  resetPluginSqlPgliteSingleton,
} from "@/runtime/bootstrap/recovery/storage";
import { appendBootstrapTrace } from "@/runtime/bootstrap/trace";
import type { AppServices } from "@/services";
import type { EnvConfig } from "@/types/runtime";
import { validateCriticalRuntimeServices } from "./critical";
import { registerMemoryStorage } from "./memory-service-registration";

export async function initializeRuntimeWithRecovery(
  createRuntime: () => AgentRuntime,
  services: AppServices,
  config: EnvConfig,
  pgliteRecoveryAttempted = false,
): Promise<AgentRuntime> {
  let runtime = createRuntime();

  await registerMemoryStorage(runtime, services);
  try {
    appendBootstrapTrace("phase:runtime.initialize:call");
    await runtime.initialize();
    appendBootstrapTrace("phase:runtime.initialize:done");
    appendBootstrapTrace("phase:memoryStorage:load:start");
    await runtime.getServiceLoadPromise("memoryStorage");
    appendBootstrapTrace("phase:memoryStorage:load:done");
    await validateCriticalRuntimeServices(runtime);
    return runtime;
  } catch (err) {
    appendBootstrapTrace("phase:runtime.initialize:error", formatError(err));
    const pgliteDataDir = join(config.dataDir, "pglite");
    const recoveryAction =
      !pgliteRecoveryAttempted && existsSync(pgliteDataDir)
        ? getPgliteRecoveryAction(err, pgliteDataDir)
        : "none";

    if (recoveryAction === "none") {
      throw err;
    }

    if (recoveryAction === "fail-active-lock") {
      await disposeRuntime(runtime);
      throw createActivePgliteLockError(pgliteDataDir, err);
    }

    const recoveryMessage = createPgliteRecoveryMessage(
      recoveryAction,
      pgliteDataDir,
      err,
    );
    getEntrypointLogger("bootstrap", {
      dataDir: config.dataDir,
    }).warn("pglite-startup-recovery", {
      action: recoveryAction,
      dataDir: pgliteDataDir,
      error: formatError(err),
    });
    process.stderr.write(`${recoveryMessage}\n`);

    process.env.PGLITE_DATA_DIR = pgliteDataDir;
    await disposeRuntime(runtime);
    await resetPluginSqlPgliteSingleton();
    reconcilePglitePidFile(pgliteDataDir);

    if (recoveryAction === "reset-data-dir") {
      await resetPgliteDataDir(pgliteDataDir);
    }

    runtime = createRuntime();
    await registerMemoryStorage(runtime, services);
    try {
      appendBootstrapTrace("phase:runtime.initialize:retry-call");
      await runtime.initialize();
      appendBootstrapTrace("phase:runtime.initialize:retry-done");
      appendBootstrapTrace("phase:memoryStorage:retry-load:start");
      await runtime.getServiceLoadPromise("memoryStorage");
      appendBootstrapTrace("phase:memoryStorage:retry-load:done");
      await validateCriticalRuntimeServices(runtime);
      return runtime;
    } catch (retryErr) {
      appendBootstrapTrace(
        "phase:runtime.initialize:retry-error",
        formatError(retryErr),
      );
      throw createPgliteRetryFailureError(pgliteDataDir, retryErr);
    }
  }
}

export async function disposeRuntime(
  currentRuntime: AgentRuntime,
): Promise<void> {
  try {
    await currentRuntime.stop();
  } catch {
    // Best effort only.
  }
  try {
    await currentRuntime.close();
  } catch {
    // Best effort only.
  }
}
