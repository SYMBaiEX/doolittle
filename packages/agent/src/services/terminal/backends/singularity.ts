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
  renderChecks,
} from "../execution/diagnostics";
import {
  commandExists,
  normalizeBackendError,
  runCommand,
  type TerminalRunResult,
} from "../execution/subprocess";
import { buildSingularityChecks, buildSingularityCommand } from "../planning";

class SingularityExecutionBackend implements ExecutionBackend {
  readonly name = "singularity" as const;

  preview(
    command: string,
    options: { cwd: string; timeoutMs: number; settings: RuntimeSettings },
  ): ExecutionBackendPreview {
    const checks = buildSingularityChecks(
      options.settings,
      options.cwd,
      true,
      Boolean(options.settings.execution.singularityImage),
    );
    return {
      backend: this.name,
      mode: "container",
      engine: "singularity",
      ready: false,
      detail:
        "Singularity execution binds the workspace into a configured image for hermetic runs.",
      cwd: options.cwd,
      timeoutMs: options.timeoutMs,
      command,
      argv: buildSingularityCommand(command, options.cwd, options.settings),
      diagnostics: renderChecks(checks),
      checks,
      bootstrap: buildBootstrapHints(checks, [
        "Install Singularity or Apptainer on the host.",
        "Set execution.singularityImage to a valid local image before using this backend.",
      ]),
    };
  }

  async health(
    settings: RuntimeSettings,
    workspaceDir: string,
  ): Promise<ExecutionBackendHealth> {
    const probeTimeoutMs = settings.execution.healthTimeoutMs ?? 5_000;
    const runtimeAvailable = await commandExists("singularity", probeTimeoutMs);
    const imageAvailable = Boolean(
      settings.execution.singularityImage &&
        (existsSync(settings.execution.singularityImage) ||
          settings.execution.singularityImage.includes("://")),
    );
    const checks = buildSingularityChecks(
      settings,
      workspaceDir,
      runtimeAvailable,
      imageAvailable,
    );

    return {
      backend: this.name,
      mode: "container",
      engine: "singularity",
      ready: runtimeAvailable && imageAvailable,
      detail:
        runtimeAvailable && imageAvailable
          ? `Singularity ready with image ${settings.execution.singularityImage}.`
          : !runtimeAvailable
            ? "singularity command is not available."
            : `Singularity image is not configured or missing: ${settings.execution.singularityImage || "n/a"}.`,
      limits: buildHealthLimits(settings),
      diagnostics: renderChecks(checks),
      checks,
      bootstrap: buildBootstrapHints(checks, [
        "Install Singularity or Apptainer and confirm the binary is on PATH.",
        "Provide a local SIF image path or supported remote image reference.",
      ]),
    };
  }

  async run(
    command: string,
    options: {
      cwd: string;
      timeoutMs: number;
      settings: RuntimeSettings;
      abortSignal?: AbortSignal;
    },
  ): Promise<TerminalRunResult> {
    if (!options.settings.execution.singularityImage) {
      return {
        exitCode: 1,
        stdout: "",
        stderr: "Singularity backend requires execution.singularityImage.",
        timedOut: false,
        durationMs: 0,
      };
    }

    return normalizeBackendError(
      await runCommand(
        buildSingularityCommand(command, options.cwd, options.settings),
        {
          timeoutMs: options.timeoutMs,
          abortSignal: options.abortSignal,
        },
      ),
    );
  }
}

export function createSingularityExecutionBackend(): ExecutionBackend {
  return new SingularityExecutionBackend();
}
