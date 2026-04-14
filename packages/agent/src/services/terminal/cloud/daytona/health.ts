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
  buildDaytonaExecArgs,
  buildDaytonaInfoArgs,
} from "../planning";
import { readCloudInfoSummary } from "../shared";
import type { CloudStateAccessor } from "../store";

interface BuildDaytonaHealthInput {
  cloudState: CloudStateAccessor;
  settings: RuntimeSettings;
  workspaceDir: string;
}

const DAYTONA_OK = "printf eliza-daytona-ok";

function fallbackHealthResult(error: string) {
  return {
    exitCode: 1,
    stdout: "",
    stderr: error,
    timedOut: false,
    durationMs: 0,
  };
}

function buildDaytonaHealthInfoCommand(
  settings: RuntimeSettings,
  workspaceDir: string,
  probeTimeoutMs: number,
): string[] {
  return settings.execution.daytonaStatusCommand
    ? buildDaytonaExecArgs(
        settings,
        settings.execution.daytonaStatusCommand,
        workspaceDir,
        probeTimeoutMs,
      )
    : buildDaytonaInfoArgs(settings);
}

async function runDaytonaInfoProbe(
  settings: RuntimeSettings,
  workspaceDir: string,
  probeTimeoutMs: number,
) {
  return runCommand(
    buildDaytonaHealthInfoCommand(settings, workspaceDir, probeTimeoutMs),
    { timeoutMs: probeTimeoutMs },
  ).catch(() => fallbackHealthResult("Daytona info probe failed."));
}

async function runDaytonaExecProbe(
  settings: RuntimeSettings,
  workspaceDir: string,
  probeTimeoutMs: number,
) {
  return runCommand(
    buildDaytonaExecArgs(settings, DAYTONA_OK, workspaceDir, probeTimeoutMs),
    { timeoutMs: probeTimeoutMs },
  ).catch(() => fallbackHealthResult("Daytona sandbox probe failed."));
}

export async function buildDaytonaHealth({
  cloudState,
  settings,
  workspaceDir,
}: BuildDaytonaHealthInput): Promise<ExecutionBackendHealth> {
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
      backend: "daytona",
      cloudState,
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
    cloudState,
    cloud,
    Boolean(cloud.target),
  );

  const info = await runDaytonaInfoProbe(
    settings,
    workspaceDir,
    probeTimeoutMs,
  );
  const execProbe = await runDaytonaExecProbe(
    settings,
    workspaceDir,
    probeTimeoutMs,
  );
  const infoOk = info.exitCode === 0;
  const execOk = execProbe.exitCode === 0;
  const checks = buildCloudRuntimeChecks(
    "daytona",
    settings,
    workspaceDir,
    runtimeAvailable,
    infoOk && execOk,
  );
  const infoCommand = buildDaytonaHealthInfoCommand(
    settings,
    workspaceDir,
    probeTimeoutMs,
  );
  const commandId = infoCommand.join(" ");
  const healthSnapshot = cloudState.capture(cloud, {
    event: "health",
    state: runtimeAvailable && infoOk && execOk ? "ready" : "failed",
    cwd: workspaceDir,
    summary:
      runtimeAvailable && infoOk && execOk
        ? `Daytona health probe succeeded for ${cloud.target || "TARGET"} (${cloud.workspaceLabel}).`
        : `Daytona health probe failed for ${cloud.target || "TARGET"} (${cloud.workspaceLabel}).`,
    commandId,
    command: commandId,
    lastExitCode: infoOk && execOk ? 0 : 1,
    lastStdout: `${info.stdout || ""}\n${execProbe.stdout || ""}`.trim(),
    lastStderr: `${info.stderr || ""}\n${execProbe.stderr || ""}`.trim(),
  });
  const refreshedSession = cloudState.get(cloud) ?? cloudSession;
  const infoSummary = readCloudInfoSummary(info.stdout);

  return {
    backend: "daytona",
    mode: "remote",
    engine: "daytona",
    cloud,
    cloudSession: refreshedSession,
    cloudSnapshot: healthSnapshot,
    cloudArtifacts: healthSnapshot.artifacts,
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
