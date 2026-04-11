import type { RuntimeSettings } from "../../settings/runtime-settings";
import type { CloudExecutionProvider, CloudSyncPlan } from "./types";

export function isValidEnvName(name: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name);
}

export function buildRemoteSyncPlan(
  provider: CloudExecutionProvider,
  settings: RuntimeSettings,
  localWorkspacePath: string,
  remoteWorkspacePath: string,
): CloudSyncPlan {
  const execution = settings.execution;
  const mode =
    provider === "daytona" && execution.daytonaSnapshot
      ? "snapshot"
      : execution.remoteSyncMode;
  const include =
    execution.remoteSyncInclude.length > 0
      ? execution.remoteSyncInclude
      : ["**/*"];
  const exclude =
    execution.remoteSyncExclude.length > 0
      ? execution.remoteSyncExclude
      : [
          ".git",
          ".doolittle",
          "node_modules",
          "dist",
          "coverage",
          ".cache",
          ".turbo",
          ".DS_Store",
        ];
  const artifactPaths =
    execution.remoteArtifactPaths.length > 0
      ? execution.remoteArtifactPaths
      : [
          ".doolittle/remote-artifacts",
          ".doolittle/trajectories",
          ".doolittle/cron-output",
        ];
  const workspaceLabel =
    execution.remoteWorkspaceLabel ||
    `${provider}:${execution.daytonaTarget || execution.modalTarget || "workspace"}`;
  return {
    mode,
    localWorkspacePath,
    remoteWorkspacePath,
    workspaceLabel,
    include,
    exclude,
    artifactPaths,
    artifactPolicy: execution.remoteArtifactPolicy,
    safetyNotes: [
      "Doolittle persists remote lifecycle snapshots as metadata only.",
      "No remote file contents are copied into local state by the execution control plane.",
      `Artifact paths are tracked for operator visibility under ${workspaceLabel}.`,
    ],
    generatedAt: new Date().toISOString(),
  };
}
