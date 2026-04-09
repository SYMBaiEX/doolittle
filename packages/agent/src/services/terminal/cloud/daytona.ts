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
  buildDaytonaExecArgs,
  buildDaytonaInfoArgs,
} from "./planning";
import {
  createMissingCloudTargetRunResult,
  readCloudInfoSummary,
} from "./shared";
import type { CloudStateAccessor } from "./store";

class DaytonaExecutionBackend implements ExecutionBackend {
  readonly name = "daytona" as const;

  constructor(private readonly cloudState: CloudStateAccessor) {}

  preview(
    command: string,
    options: { cwd: string; timeoutMs: number; settings: RuntimeSettings },
  ): ExecutionBackendPreview {
    const cloud = buildCloudProfile("daytona", options.settings, options.cwd);
    const safeCommand = sanitizeCommand(command);
    const checks = buildCloudRuntimePreviewChecks(
      "daytona",
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
      argv: buildDaytonaExecArgs(
        options.settings,
        safeCommand,
        options.cwd,
        options.timeoutMs,
      ),
      ready: Boolean(cloud.target && cloud.workspacePath),
      detail: `Daytona execution uses a persistent sandbox target (${cloud.target || "TARGET"}) with snapshot-aware workspace execution.`,
      summary: `Daytona preview planned for ${cloud.target || "TARGET"} using ${cloud.workspaceLabel}.`,
      diagnostics: renderChecks(checks),
      checks,
      bootstrap: buildBootstrapHints(checks, [
        `Install the ${options.settings.execution.daytonaCommand || "daytona"} CLI and authenticate it locally.`,
        `Confirm access to the sandbox target ${cloud.target || "TARGET"}.`,
      ]),
    });
  }

  async health(
    settings: RuntimeSettings,
    workspaceDir: string,
  ): Promise<ExecutionBackendHealth> {
    const probeTimeoutMs = settings.execution.healthTimeoutMs ?? 5_000;
    const binary = settings.execution.daytonaCommand || "daytona";
    const runtimeAvailable = await commandExists(binary, probeTimeoutMs);
    const cloud = buildCloudProfile("daytona", settings, workspaceDir);
    if (!runtimeAvailable) {
      const failedChecks = buildCloudRuntimeChecks(
        "daytona",
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
        summary: `Daytona CLI ${binary} is not available for ${cloud.workspaceLabel}.`,
        detail: `${binary} command is not available.`,
        limits: buildHealthLimits(settings),
        diagnostics: renderChecks(failedChecks),
        checks: failedChecks,
        bootstrap: buildBootstrapHints(failedChecks, [
          `Install the ${binary} CLI and authenticate it locally.`,
          "Use daytona info to confirm the sandbox target is reachable.",
        ]),
      });
    }
    const cloudSession = touchCloudHealthSession(
      this.cloudState,
      cloud,
      Boolean(cloud.target),
    );

    const infoCommand = settings.execution.daytonaStatusCommand
      ? buildDaytonaExecArgs(
          settings,
          settings.execution.daytonaStatusCommand,
          workspaceDir,
          probeTimeoutMs,
        )
      : buildDaytonaInfoArgs(settings);
    const info = await runCommand(infoCommand, {
      timeoutMs: probeTimeoutMs,
    }).catch(() => ({
      exitCode: 1,
      stdout: "",
      stderr: "Daytona info probe failed.",
      timedOut: false,
      durationMs: 0,
    }));
    const execProbe = await runCommand(
      buildDaytonaExecArgs(
        settings,
        "printf eliza-daytona-ok",
        workspaceDir,
        probeTimeoutMs,
      ),
      { timeoutMs: probeTimeoutMs },
    ).catch(() => ({
      exitCode: 1,
      stdout: "",
      stderr: "Daytona sandbox probe failed.",
      timedOut: false,
      durationMs: 0,
    }));
    const infoOk = info.exitCode === 0;
    const execOk = execProbe.exitCode === 0;
    const checks = buildCloudRuntimeChecks(
      "daytona",
      settings,
      workspaceDir,
      runtimeAvailable,
      infoOk && execOk,
    );
    const cloudSnapshot = this.cloudState.capture(cloud, {
      event: "health",
      state: runtimeAvailable && infoOk && execOk ? "ready" : "failed",
      cwd: workspaceDir,
      summary:
        runtimeAvailable && infoOk && execOk
          ? `Daytona health probe succeeded for ${cloud.target || "TARGET"} (${cloud.workspaceLabel}).`
          : `Daytona health probe failed for ${cloud.target || "TARGET"} (${cloud.workspaceLabel}).`,
      commandId: infoCommand.join(" "),
      command: infoCommand.join(" "),
      lastExitCode: infoOk && execOk ? 0 : 1,
      lastStdout: `${info.stdout || ""}\n${execProbe.stdout || ""}`.trim(),
      lastStderr: `${info.stderr || ""}\n${execProbe.stderr || ""}`.trim(),
    });
    const refreshedSession = this.cloudState.get(cloud) ?? cloudSession;
    const infoSummary = readCloudInfoSummary(info.stdout);
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
      ready: runtimeAvailable && infoOk && execOk,
      detail:
        runtimeAvailable && infoOk && execOk
          ? `Daytona ready for target ${cloud.target} (${infoSummary}) with snapshot ${cloud.snapshot || "live"} and workspace ${workspaceDir}.`
          : !infoOk
            ? info.stderr || "Daytona info probe failed."
            : execProbe.stderr || "Daytona sandbox probe failed.",
      limits: buildHealthLimits(settings),
      diagnostics: renderChecks(checks),
      checks,
      bootstrap: buildBootstrapHints(checks, [
        `Use daytona info ${cloud.target || "TARGET"} --format json to inspect the sandbox state.`,
        cloud.snapshot
          ? `Confirm snapshot ${cloud.snapshot} is available for the sandbox target.`
          : "Add a Daytona snapshot reference if you want the backend anchored to a known image state.",
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
    const cloud = buildCloudProfile("daytona", options.settings, options.cwd);
    const safeCommand = sanitizeCommand(command);
    if (!cloud.target) {
      return createMissingCloudTargetRunResult(
        "Daytona",
        "execution.daytonaTarget",
      );
    }
    const result = normalizeBackendError(
      await runCommand(
        buildDaytonaExecArgs(
          options.settings,
          safeCommand,
          options.cwd,
          options.timeoutMs,
        ),
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
      successSummary: `Daytona command completed successfully for ${cloud.workspaceLabel}.`,
      failureSummary: `Daytona command failed for ${cloud.workspaceLabel} with exit code ${result.exitCode}.`,
    });
    return result;
  }
}

export function createDaytonaExecutionBackend(
  cloudState: CloudStateAccessor,
): ExecutionBackend {
  return new DaytonaExecutionBackend(cloudState);
}
