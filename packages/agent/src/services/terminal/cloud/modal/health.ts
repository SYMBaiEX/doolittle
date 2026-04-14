import type { ExecutionBackendHealth } from "@/types/execution";
import type { RuntimeSettings } from "../../../settings/runtime-settings";
import {
  buildBootstrapHints,
  buildHealthLimits,
  renderChecks,
} from "../../execution/diagnostics";
import { commandExists, runCommand } from "../../execution/subprocess";
import {
  buildUnavailableCloudHealth,
  touchCloudHealthSession,
} from "../lifecycle";
import {
  buildCloudProfile,
  buildCloudRuntimeChecks,
  buildModalShellArgs,
} from "../planning";
import type { CloudStateAccessor } from "../store";

export async function buildModalHealth(
  cloudState: CloudStateAccessor,
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
      backend: "modal",
      cloudState,
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
    cloudState,
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
  const cloudSnapshot = cloudState.capture(cloud, {
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
  const refreshedSession = cloudState.get(cloud) ?? cloudSession;
  return {
    backend: "modal",
    mode: "remote",
    engine: "modal",
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
