import { existsSync } from "node:fs";
import type { RuntimeSettings } from "../../settings/runtime-settings";
import {
  buildCloudProfile,
  buildCloudRuntimeChecks,
  buildCloudRuntimePreviewChecks,
  buildDaytonaExecArgs,
  buildDaytonaInfoArgs,
  buildModalShellArgs,
  buildRemoteSyncPlan,
  isValidEnvName,
} from "../cloud/planning/index";
import {
  buildBootstrapHints as buildSharedBootstrapHints,
  buildHealthLimits as buildSharedHealthLimits,
} from "../execution/diagnostics";
import {
  buildContainerChecks,
  buildContainerPreviewChecks,
  buildSingularityChecks,
  buildSshChecks,
  buildSshPreviewChecks,
} from "./checks";

export const buildBootstrapHints = buildSharedBootstrapHints;
export const buildHealthLimits = buildSharedHealthLimits;
export {
  buildCloudProfile,
  buildCloudRuntimeChecks,
  buildCloudRuntimePreviewChecks,
  buildContainerChecks,
  buildContainerPreviewChecks,
  buildDaytonaExecArgs,
  buildDaytonaInfoArgs,
  buildModalShellArgs,
  buildRemoteSyncPlan,
  buildSingularityChecks,
  buildSshChecks,
  buildSshPreviewChecks,
  isValidEnvName,
};

export function buildContainerCommand(
  engine: "docker" | "podman",
  command: string,
  cwd: string,
  settings: RuntimeSettings,
): string[] {
  const execution = settings.execution;
  const containerReadOnlyRoot = execution.containerReadOnlyRoot ?? true;
  const containerPidsLimit = execution.containerPidsLimit ?? 256;
  const containerMemoryLimit = execution.containerMemoryLimit ?? "2g";
  const containerCpuLimit = execution.containerCpuLimit ?? "2";
  const passthroughFlags = execution.dockerEnvPassthrough
    .filter(isValidEnvName)
    .flatMap((name) =>
      process.env[name] ? ["-e", `${name}=${process.env[name]}`] : [],
    );
  const readOnlyFlags = containerReadOnlyRoot
    ? [
        "--read-only",
        "--tmpfs",
        "/tmp:rw,mode=1777",
        "--tmpfs",
        "/run:rw,mode=755",
      ]
    : [];
  const engineFlags = engine === "podman" ? ["--userns", "keep-id"] : [];

  return [
    engine,
    "run",
    "--rm",
    "--init",
    "--security-opt",
    "no-new-privileges",
    "--cap-drop",
    "ALL",
    "--pids-limit",
    String(containerPidsLimit),
    "--memory",
    containerMemoryLimit,
    "--cpus",
    containerCpuLimit,
    "--network",
    execution.dockerNetwork,
    "-w",
    execution.dockerWorkspacePath,
    "-v",
    `${cwd}:${execution.dockerWorkspacePath}`,
    ...readOnlyFlags,
    ...engineFlags,
    ...passthroughFlags,
    execution.dockerImage,
    "/bin/sh",
    "-lc",
    command,
  ];
}

export function buildSingularityCommand(
  command: string,
  cwd: string,
  settings: RuntimeSettings,
): string[] {
  const execution = settings.execution;
  return [
    "singularity",
    "exec",
    "--bind",
    `${cwd}:${execution.dockerWorkspacePath}`,
    execution.singularityImage,
    "/bin/sh",
    "-lc",
    command,
  ];
}

export function buildSshBaseArgs(settings: RuntimeSettings): string[] {
  const execution = settings.execution;
  const keyFlags =
    execution.sshKeyPath && existsSync(execution.sshKeyPath)
      ? [
          "-i",
          execution.sshKeyPath,
          "-o",
          "IdentitiesOnly=yes",
          "-o",
          "PreferredAuthentications=publickey",
        ]
      : [];
  return [
    "-o",
    "BatchMode=yes",
    "-o",
    "ConnectTimeout=5",
    "-o",
    "ServerAliveInterval=15",
    "-o",
    "ServerAliveCountMax=2",
    "-o",
    "RequestTTY=no",
    "-o",
    "LogLevel=ERROR",
    "-o",
    `StrictHostKeyChecking=${execution.sshStrictHostKeyChecking ? "yes" : "no"}`,
    "-p",
    String(execution.sshPort),
    ...keyFlags,
  ];
}
