import { existsSync } from "node:fs";
import type {
  ExecutionBackendHealth,
  ExecutionBackendPreview,
} from "@/types/execution";
import type { RuntimeSettings } from "../../settings/runtime-settings";
import type { ExecutionBackend } from "../contracts/backend";
import {
  buildBootstrapHints,
  buildHealthLimits,
  createCheck,
  renderChecks,
} from "../execution/diagnostics";
import {
  LOCAL_SHELL,
  normalizeBackendError,
  runCommand,
  type TerminalRunResult,
} from "../execution/subprocess";

class LocalExecutionBackend implements ExecutionBackend {
  readonly name = "local" as const;

  preview(
    command: string,
    options: { cwd: string; timeoutMs: number; settings: RuntimeSettings },
  ): ExecutionBackendPreview {
    const checks = [
      createCheck(
        "local.shell",
        existsSync(LOCAL_SHELL) ? "pass" : "warn",
        "Local shell",
        `Local commands execute through ${LOCAL_SHELL} -lc on the host.`,
      ),
      createCheck(
        "local.workspace",
        existsSync(options.cwd) ? "pass" : "warn",
        "Workspace availability",
        existsSync(options.cwd)
          ? `Workspace ${options.cwd} is available.`
          : `Workspace ${options.cwd} is not present.`,
      ),
      createCheck(
        "local.timeout",
        "pass",
        "Command timeout",
        `Timeout budget set to ${options.timeoutMs}ms.`,
      ),
    ];
    return {
      backend: this.name,
      mode: "local",
      ready: true,
      detail: "Local Bun shell execution is available.",
      cwd: options.cwd,
      timeoutMs: options.timeoutMs,
      command,
      argv: [LOCAL_SHELL, "-lc", command],
      diagnostics: renderChecks(checks),
      checks,
      bootstrap: buildBootstrapHints(checks, [
        "No bootstrap required for local execution.",
      ]),
    };
  }

  async health(settings: RuntimeSettings): Promise<ExecutionBackendHealth> {
    const checks = [
      createCheck(
        "local.shell",
        existsSync(LOCAL_SHELL) ? "pass" : "warn",
        "Local shell",
        `Local shell execution is available through ${LOCAL_SHELL}.`,
      ),
      createCheck(
        "local.workspace",
        "pass",
        "Workspace availability",
        "Commands run inside the current workspace directory.",
      ),
      createCheck(
        "local.timeout",
        "pass",
        "Command timeout",
        `Default timeout budget is ${buildHealthLimits(settings).commandTimeoutMs}ms.`,
      ),
    ];
    return {
      backend: this.name,
      mode: "local",
      ready: true,
      detail: "Local Bun shell execution is available.",
      limits: buildHealthLimits(settings),
      diagnostics: renderChecks(checks),
      checks,
      bootstrap: buildBootstrapHints(checks, ["No bootstrap required."]),
    };
  }

  async run(
    command: string,
    options: { cwd: string; timeoutMs: number; abortSignal?: AbortSignal },
  ): Promise<TerminalRunResult> {
    return normalizeBackendError(
      await runCommand([LOCAL_SHELL, "-lc", command], options),
    );
  }
}

export function createLocalExecutionBackend(): ExecutionBackend {
  return new LocalExecutionBackend();
}
