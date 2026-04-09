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
  sanitizeCommand,
  type TerminalRunResult,
} from "../execution/subprocess";
import {
  buildCloudPreviewLifecycle,
  buildUnavailableCloudHealth,
  recordCloudRunLifecycle,
  touchCloudHealthSession,
} from "./lifecycle";
import {
  buildCloudProfile,
  buildCloudRuntimeChecks,
  buildCloudRuntimePreviewChecks,
  buildModalShellArgs,
} from "./planning";
import { createMissingCloudTargetRunResult } from "./shared";
import type { CloudStateAccessor } from "./store";

class ModalExecutionBackend implements ExecutionBackend {
  readonly name = "modal" as const;

  constructor(private readonly cloudState: CloudStateAccessor) {}

  preview(
    command: string,
    options: { cwd: string; timeoutMs: number; settings: RuntimeSettings },
  ): ExecutionBackendPreview {
    const cloud = buildCloudProfile("modal", options.settings, options.cwd);
    const safeCommand = sanitizeCommand(command);
    const checks = buildCloudRuntimePreviewChecks(
      "modal",
      options.settings,
      options.cwd,
    );
    return buildCloudPreviewLifecycle({
      backend: this.name,
      cloudState: this.cloudState,
      cloud,
      command: safeCommand,
      cwd: options.cwd,
      timeoutMs: options.timeoutMs,
      argv: buildModalShellArgs(options.settings, safeCommand, options.cwd),
      ready: Boolean(cloud.target && cloud.workspacePath),
      detail: `Modal execution uses a shell session against target ${cloud.target || "REF"} with explicit environment selection${cloud.environment ? ` (${cloud.environment})` : ""}.`,
      summary: `Modal preview planned for ${cloud.target || "REF"} using ${cloud.workspaceLabel}.`,
      diagnostics: renderChecks(checks),
      checks,
      bootstrap: buildBootstrapHints(checks, [
        `Install the ${options.settings.execution.modalCommand || "modal"} CLI and authenticate it locally.`,
        cloud.environment
          ? `Confirm Modal environment ${cloud.environment} is available for shell sessions.`
          : "Set a Modal environment if your workspace has multiple environments.",
      ]),
    });
  }

  async health(
    settings: RuntimeSettings,
    workspaceDir: string,
  ): Promise<ExecutionBackendHealth> {
    const probeTimeoutMs = settings.execution.healthTimeoutMs ?? 5_000;
    const binary = settings.execution.modalCommand || "modal";
    const runtimeAvailable = await commandExists(binary, probeTimeoutMs);
    const cloud = buildCloudProfile("modal", settings, workspaceDir);
    if (!runtimeAvailable) {
      const failedChecks = buildCloudRuntimeChecks(
        "modal",
        settings,
        workspaceDir,
        false,
        false,
      );
      return buildUnavailableCloudHealth({
        backend: this.name,
        cloudState: this.cloudState,
        cloud,
        workspaceDir,
        binary,
        summary: `Modal CLI ${binary} is not available for ${cloud.workspaceLabel}.`,
        detail: `${binary} command is not available.`,
        limits: buildHealthLimits(settings),
        diagnostics: renderChecks(failedChecks),
        checks: failedChecks,
        bootstrap: buildBootstrapHints(failedChecks, [
          `Install the ${binary} CLI and authenticate it locally.`,
          "Use modal shell to confirm the target is reachable.",
        ]),
      });
    }
    const cloudSession = touchCloudHealthSession(
      this.cloudState,
      cloud,
      Boolean(cloud.target),
    );

    const shellProbeCommand = settings.execution.modalStatusCommand
      ? buildModalShellArgs(
          settings,
          settings.execution.modalStatusCommand,
          workspaceDir,
        )
      : buildModalShellArgs(settings, "printf eliza-modal-ok", workspaceDir);
    const shellProbe = await runCommand(shellProbeCommand, {
      timeoutMs: probeTimeoutMs,
    }).catch(() => ({
      exitCode: 1,
      stdout: "",
      stderr: "Modal shell probe failed.",
      timedOut: false,
      durationMs: 0,
    }));
    const shellOk = shellProbe.exitCode === 0;
    const checks = buildCloudRuntimeChecks(
      "modal",
      settings,
      workspaceDir,
      runtimeAvailable,
      shellOk,
    );
    const cloudSnapshot = this.cloudState.capture(cloud, {
      event: "health",
      state: runtimeAvailable && shellOk ? "ready" : "failed",
      cwd: workspaceDir,
      summary:
        runtimeAvailable && shellOk
          ? `Modal health probe succeeded for ${cloud.target || "REF"} (${cloud.workspaceLabel}).`
          : `Modal health probe failed for ${cloud.target || "REF"} (${cloud.workspaceLabel}).`,
      commandId: shellProbeCommand.join(" "),
      command: shellProbeCommand.join(" "),
      lastExitCode: shellOk ? 0 : 1,
      lastStdout: shellProbe.stdout,
      lastStderr: shellProbe.stderr,
    });
    const refreshedSession = this.cloudState.get(cloud) ?? cloudSession;
    return {
      backend: this.name,
      mode: "remote",
      engine: this.name,
      cloud,
      cloudSession: refreshedSession,
      cloudSnapshot,
      cloudArtifacts: cloudSnapshot.artifacts,
      cloudSyncPlan: cloud.syncPlan,
      target: cloud.target,
      ready: runtimeAvailable && shellOk,
      detail:
        runtimeAvailable && shellOk
          ? `Modal ready for target ${cloud.target} using ${cloud.shell} and environment ${cloud.environment || "default profile"}.`
          : shellProbe.stderr || "Modal shell probe failed.",
      limits: buildHealthLimits(settings),
      diagnostics: renderChecks(checks),
      checks,
      bootstrap: buildBootstrapHints(checks, [
        `Use modal shell ${cloud.target || "REF"} --cmd ${cloud.shell} to verify the remote shell.`,
        cloud.environment
          ? `Bind the shell to Modal environment ${cloud.environment}.`
          : "Set a Modal environment if the workspace has multiple environments.",
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
    const cloud = buildCloudProfile("modal", options.settings, options.cwd);
    const safeCommand = sanitizeCommand(command);
    if (!cloud.target) {
      return createMissingCloudTargetRunResult(
        "Modal",
        "execution.modalTarget",
      );
    }
    const result = normalizeBackendError(
      await runCommand(
        buildModalShellArgs(options.settings, safeCommand, options.cwd),
        {
          timeoutMs: options.timeoutMs,
          abortSignal: options.abortSignal,
        },
      ),
    );
    recordCloudRunLifecycle({
      cloudState: this.cloudState,
      cloud,
      command: safeCommand,
      cwd: options.cwd,
      result,
      successSummary: `Modal command completed successfully for ${cloud.workspaceLabel}.`,
      failureSummary: `Modal command failed for ${cloud.workspaceLabel} with exit code ${result.exitCode}.`,
    });
    return result;
  }
}

export function createModalExecutionBackend(
  cloudState: CloudStateAccessor,
): ExecutionBackend {
  return new ModalExecutionBackend(cloudState);
}
