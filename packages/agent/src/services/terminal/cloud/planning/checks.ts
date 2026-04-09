import { existsSync } from "node:fs";
import type { DiagnosticCheck } from "@/types/execution";
import type { RuntimeSettings } from "../../../settings/runtime-settings";
import { createCheck } from "../../execution/diagnostics";
import type { CloudExecutionProvider } from "../types";
import { buildCloudPlanningSummary } from "./summary";

export function buildCloudRuntimeChecks(
  provider: CloudExecutionProvider,
  settings: RuntimeSettings,
  workspaceDir: string,
  runtimeAvailable: boolean,
  targetReachable: boolean,
): DiagnosticCheck[] {
  const execution = settings.execution;
  const summary = buildCloudPlanningSummary(provider, settings, workspaceDir);
  const cloudProfile = summary.profile;
  const environment =
    provider === "daytona"
      ? execution.daytonaSnapshot
      : execution.modalEnvironment;
  const syncPlan = cloudProfile.syncPlan;

  return [
    createCheck(
      `${provider}.runtime.binary`,
      runtimeAvailable ? "pass" : "fail",
      `${provider} CLI availability`,
      runtimeAvailable
        ? `${provider} command is available on this host.`
        : `${provider} command is not available on this host.`,
    ),
    createCheck(
      `${provider}.config.target`,
      summary.target ? "pass" : "fail",
      `${provider} target`,
      summary.target
        ? `Execution target configured: ${summary.target}.`
        : `${provider} target is not configured.`,
    ),
    createCheck(
      `${provider}.config.shell`,
      summary.shell ? "pass" : "warn",
      `${provider} shell`,
      summary.shell
        ? `Remote shell configured as ${summary.shell}.`
        : `No explicit shell configured; using ${provider === "daytona" ? "/bin/sh" : "/bin/bash"}.`,
    ),
    createCheck(
      `${provider}.config.workspace`,
      cloudProfile.workspacePath ? "pass" : "fail",
      `${provider} workspace`,
      cloudProfile.workspacePath
        ? `Remote workspace path configured as ${cloudProfile.workspacePath}.`
        : "Remote workspace path is not configured.",
    ),
    createCheck(
      `${provider}.config.bootstrap`,
      summary.bootstrapCommand ? "pass" : "warn",
      `${provider} bootstrap`,
      summary.bootstrapCommand
        ? `Bootstrap command configured: ${summary.bootstrapCommand}.`
        : `No bootstrap command configured; commands will execute directly.`,
    ),
    createCheck(
      `${provider}.config.status`,
      summary.statusCommand ? "pass" : "warn",
      `${provider} status probe`,
      summary.statusCommand
        ? `Status command configured: ${summary.statusCommand}.`
        : `No explicit status command configured; ${provider === "daytona" ? "daytona info" : "modal shell"} will be used as the probe.`,
    ),
    createCheck(
      `${provider}.config.inspect`,
      summary.inspectCommand ? "pass" : "warn",
      `${provider} inspect command`,
      summary.inspectCommand
        ? `Inspect command configured: ${summary.inspectCommand}.`
        : `No explicit inspect command configured; the backend will synthesize one against ${cloudProfile.workspacePath}.`,
    ),
    createCheck(
      `${provider}.config.environment`,
      environment ? "pass" : "warn",
      `${provider} environment`,
      provider === "daytona"
        ? environment
          ? `Daytona snapshot configured: ${environment}.`
          : "No Daytona snapshot configured; live sandbox state will be used."
        : environment
          ? `Modal environment configured: ${environment}.`
          : "No explicit Modal environment configured; the active profile will be used.",
    ),
    createCheck(
      `${provider}.config.sync.plan`,
      syncPlan.include.length > 0 ? "pass" : "warn",
      `${provider} sync planning`,
      `Mode=${syncPlan.mode}; include=${syncPlan.include.join(", ")}; exclude=${syncPlan.exclude.join(", ")}; workspace label=${syncPlan.workspaceLabel}.`,
    ),
    createCheck(
      `${provider}.config.artifacts`,
      syncPlan.artifactPaths.length > 0 ? "pass" : "warn",
      `${provider} artifact policy`,
      `Artifact policy=${syncPlan.artifactPolicy}; remote snapshots are metadata-only and track ${syncPlan.artifactPaths.join(", ")}.`,
    ),
    createCheck(
      `${provider}.workspace.cwd`,
      existsSync(workspaceDir) ? "pass" : "warn",
      "Workspace path",
      existsSync(workspaceDir)
        ? `Workspace path ${workspaceDir} will be forwarded to ${provider} and staged at ${cloudProfile.workspacePath}.`
        : `Workspace directory ${workspaceDir} is not present.`,
    ),
    createCheck(
      `${provider}.runtime.probe`,
      targetReachable ? "pass" : "fail",
      "Sandbox probe",
      targetReachable
        ? `${provider} sandbox probe completed successfully.`
        : `${provider} sandbox probe did not complete successfully.`,
    ),
  ];
}

export function buildCloudRuntimePreviewChecks(
  provider: CloudExecutionProvider,
  settings: RuntimeSettings,
  workspaceDir: string,
): DiagnosticCheck[] {
  const summary = buildCloudPlanningSummary(provider, settings, workspaceDir);
  const cloudProfile = summary.profile;

  return [
    createCheck(
      `${provider}.preview.generated`,
      "pass",
      `${provider} preview`,
      `${provider} will run as a ${cloudProfile.state} using ${summary.target}.`,
    ),
    createCheck(
      `${provider}.preview.shell`,
      "pass",
      "Remote shell",
      `Commands execute through ${cloudProfile.shell} inside the remote sandbox.`,
    ),
    createCheck(
      `${provider}.preview.workspace.path`,
      cloudProfile.workspacePath ? "pass" : "warn",
      "Remote workspace",
      cloudProfile.workspacePath
        ? `Remote workspace path configured as ${cloudProfile.workspacePath}.`
        : "Remote workspace path is not configured.",
    ),
    createCheck(
      `${provider}.preview.bootstrap`,
      cloudProfile.bootstrapCommand ? "pass" : "warn",
      "Bootstrap command",
      cloudProfile.bootstrapCommand
        ? `A bootstrap command will run before the user command.`
        : "No bootstrap command configured.",
    ),
    createCheck(
      `${provider}.preview.environment`,
      cloudProfile.environment ? "pass" : "warn",
      "Cloud environment",
      cloudProfile.environment
        ? `${provider === "daytona" ? "Daytona snapshot" : "Modal environment"} configured as ${cloudProfile.environment}.`
        : "No explicit cloud environment configured.",
    ),
    createCheck(
      `${provider}.preview.sync.plan`,
      cloudProfile.syncPlan.include.length > 0 ? "pass" : "warn",
      "Remote sync plan",
      `Mode=${cloudProfile.syncPlan.mode}; local=${cloudProfile.syncPlan.localWorkspacePath}; remote=${cloudProfile.syncPlan.remoteWorkspacePath}; label=${cloudProfile.workspaceLabel}.`,
    ),
    createCheck(
      `${provider}.preview.artifacts`,
      cloudProfile.syncPlan.artifactPaths.length > 0 ? "pass" : "warn",
      "Artifact policy",
      `Artifact policy=${cloudProfile.syncPlan.artifactPolicy}; artifacts=${cloudProfile.syncPlan.artifactPaths.join(", ")}.`,
    ),
    createCheck(
      `${provider}.preview.inspect`,
      cloudProfile.inspectCommand ? "pass" : "warn",
      "Inspect command",
      cloudProfile.inspectCommand
        ? `Inspect command configured as ${cloudProfile.inspectCommand}.`
        : "No inspect command configured.",
    ),
    createCheck(
      `${provider}.preview.workspace.mount`,
      existsSync(workspaceDir) ? "pass" : "warn",
      "Workspace mount",
      existsSync(workspaceDir)
        ? `${workspaceDir} will be staged into ${cloudProfile.workspacePath} inside the remote sandbox.`
        : `Workspace directory ${workspaceDir} is not present.`,
    ),
  ];
}
