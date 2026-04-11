import { existsSync } from "node:fs";
import type { DiagnosticCheck } from "@/types/execution";
import type { RuntimeSettings } from "../../settings/runtime-settings";
import { isValidEnvName } from "../cloud/planning/index";
import { createCheck } from "../execution/diagnostics";

export function buildContainerChecks(
  engine: "docker" | "podman",
  settings: RuntimeSettings,
  workspaceDir: string,
  runtimeAvailable: boolean,
  imageAvailable: boolean,
): DiagnosticCheck[] {
  const execution = settings.execution;
  const envNames = execution.dockerEnvPassthrough.filter(isValidEnvName);
  const envCount = envNames.filter((name) => Boolean(process.env[name])).length;
  const workspaceMountOk = existsSync(workspaceDir);
  const containerRootfs = execution.containerReadOnlyRoot ?? true;
  const invalidEnvNames = execution.dockerEnvPassthrough.filter(
    (name) => !isValidEnvName(name),
  );

  return [
    createCheck(
      `${engine}.runtime.binary`,
      runtimeAvailable ? "pass" : "fail",
      `${engine} runtime binary`,
      runtimeAvailable
        ? `${engine} command is available on this host.`
        : `${engine} command is not available on this host.`,
    ),
    createCheck(
      `${engine}.runtime.image`,
      imageAvailable ? "pass" : "fail",
      `${engine} image availability`,
      imageAvailable
        ? `Image ${execution.dockerImage} is available locally.`
        : `Image ${execution.dockerImage} is not available locally.`,
    ),
    createCheck(
      `${engine}.workspace.mount`,
      workspaceMountOk ? "pass" : "warn",
      "Workspace mount",
      workspaceMountOk
        ? `${workspaceDir} can be mounted at ${execution.dockerWorkspacePath}.`
        : `Workspace directory ${workspaceDir} is not present.`,
    ),
    createCheck(
      `${engine}.sandbox.rootfs`,
      containerRootfs ? "pass" : "warn",
      "Read-only container root",
      containerRootfs
        ? "Container root filesystem will be read-only."
        : "Container root filesystem is writable.",
    ),
    createCheck(
      `${engine}.sandbox.limits`,
      "pass",
      "Container resource limits",
      `cpus=${execution.containerCpuLimit ?? "2"} memory=${execution.containerMemoryLimit ?? "2g"} pids=${execution.containerPidsLimit ?? 256}`,
    ),
    createCheck(
      `${engine}.sandbox.env`,
      invalidEnvNames.length === 0 && envNames.length > 0 ? "pass" : "warn",
      "Environment passthrough",
      invalidEnvNames.length === 0
        ? `Forwarding ${envCount}/${execution.dockerEnvPassthrough.length} configured env vars.`
        : `Ignoring invalid env names: ${invalidEnvNames.join(", ")}.`,
    ),
    createCheck(
      `${engine}.runtime.userns`,
      engine === "podman" ? "pass" : "warn",
      "Container user namespace",
      engine === "podman"
        ? "Podman will use keep-id user namespaces."
        : "Docker uses the default user namespace mapping.",
    ),
    createCheck(
      `${engine}.runtime.shell`,
      "pass",
      "Container shell",
      "Commands execute through /bin/sh -lc for portability.",
    ),
  ];
}

export function buildContainerPreviewChecks(
  engine: "docker" | "podman",
  settings: RuntimeSettings,
  workspaceDir: string,
): DiagnosticCheck[] {
  const execution = settings.execution;
  const workspaceMountOk = existsSync(workspaceDir);
  return [
    createCheck(
      `${engine}.preview.generated`,
      "pass",
      `${engine} preview`,
      `Execution will run with the ${engine} backend using ${execution.dockerImage}.`,
    ),
    createCheck(
      `${engine}.preview.command`,
      "pass",
      "Container command",
      "Commands execute through /bin/sh -lc inside the container.",
    ),
    createCheck(
      `${engine}.preview.workspace`,
      workspaceMountOk ? "pass" : "warn",
      "Workspace mount",
      workspaceMountOk
        ? `${workspaceDir} will mount at ${execution.dockerWorkspacePath}.`
        : `Workspace directory ${workspaceDir} is not present.`,
    ),
    createCheck(
      `${engine}.preview.rootfs`,
      (execution.containerReadOnlyRoot ?? true) ? "pass" : "warn",
      "Root filesystem",
      (execution.containerReadOnlyRoot ?? true)
        ? "Root filesystem is planned as read-only."
        : "Root filesystem is planned as writable.",
    ),
    createCheck(
      `${engine}.preview.limits`,
      "pass",
      "Resource limits",
      `cpus=${execution.containerCpuLimit ?? "2"} memory=${execution.containerMemoryLimit ?? "2g"} pids=${execution.containerPidsLimit ?? 256}`,
    ),
  ];
}

export function buildSshChecks(
  settings: RuntimeSettings,
  runtimeAvailable: boolean,
  pathExists: boolean,
): DiagnosticCheck[] {
  const execution = settings.execution;
  const keyConfigured = Boolean(execution.sshKeyPath);
  const keyExists = !execution.sshKeyPath || existsSync(execution.sshKeyPath);
  return [
    createCheck(
      "ssh.runtime.binary",
      runtimeAvailable ? "pass" : "fail",
      "SSH client availability",
      runtimeAvailable
        ? "ssh command is available on this host."
        : "ssh command is not available on this host.",
    ),
    createCheck(
      "ssh.config.host",
      execution.sshHost ? "pass" : "fail",
      "SSH host",
      execution.sshHost
        ? `Host configured: ${execution.sshHost}.`
        : "SSH host is not configured.",
    ),
    createCheck(
      "ssh.config.user",
      execution.sshUser ? "pass" : "fail",
      "SSH user",
      execution.sshUser
        ? `User configured: ${execution.sshUser}.`
        : "SSH user is not configured.",
    ),
    createCheck(
      "ssh.config.path",
      execution.sshPath ? "pass" : "fail",
      "Remote workspace",
      execution.sshPath
        ? `Remote workspace path: ${execution.sshPath}.`
        : "Remote workspace path is not configured.",
    ),
    createCheck(
      "ssh.config.key",
      keyConfigured && keyExists ? "pass" : keyConfigured ? "fail" : "warn",
      "SSH key",
      keyConfigured
        ? keyExists
          ? `SSH key found at ${execution.sshKeyPath}.`
          : `SSH key path does not exist: ${execution.sshKeyPath}.`
        : "No SSH private key configured.",
    ),
    createCheck(
      "ssh.runtime.probe",
      pathExists ? "pass" : "fail",
      "Remote workspace probe",
      pathExists
        ? `Remote workspace ${execution.sshPath} is reachable.`
        : `Remote workspace ${execution.sshPath || "?"} is not reachable.`,
    ),
    createCheck(
      "ssh.runtime.shell",
      "pass",
      "Remote shell",
      "Commands execute through sh -lc for portability on the remote host.",
    ),
    createCheck(
      "ssh.runtime.strictHostKeyChecking",
      execution.sshStrictHostKeyChecking ? "pass" : "warn",
      "Host key verification",
      execution.sshStrictHostKeyChecking
        ? "Strict host key checking is enabled."
        : "Strict host key checking is disabled for this session.",
    ),
  ];
}

export function buildSshPreviewChecks(
  settings: RuntimeSettings,
): DiagnosticCheck[] {
  const execution = settings.execution;
  return [
    createCheck(
      "ssh.preview.generated",
      "pass",
      "SSH preview",
      `Execution will run against ${execution.sshUser || "?"}@${execution.sshHost || "?"}.`,
    ),
    createCheck(
      "ssh.preview.shell",
      "pass",
      "Remote shell",
      "Commands execute through sh -lc on the remote host.",
    ),
    createCheck(
      "ssh.preview.path",
      execution.sshPath ? "pass" : "warn",
      "Remote workspace",
      execution.sshPath
        ? `Remote workspace ${execution.sshPath} will be used.`
        : "Remote workspace path is not configured.",
    ),
    createCheck(
      "ssh.preview.key",
      execution.sshKeyPath ? "pass" : "warn",
      "SSH key",
      execution.sshKeyPath
        ? `SSH key path ${execution.sshKeyPath} will be used when available.`
        : "No SSH key path configured.",
    ),
  ];
}

export function buildSingularityChecks(
  settings: RuntimeSettings,
  workspaceDir: string,
  runtimeAvailable: boolean,
  imageAvailable: boolean,
): DiagnosticCheck[] {
  const execution = settings.execution;
  return [
    createCheck(
      "singularity.runtime.binary",
      runtimeAvailable ? "pass" : "fail",
      "Singularity availability",
      runtimeAvailable
        ? "singularity command is available on this host."
        : "singularity command is not available on this host.",
    ),
    createCheck(
      "singularity.config.image",
      execution.singularityImage ? (imageAvailable ? "pass" : "warn") : "fail",
      "Singularity image",
      execution.singularityImage
        ? imageAvailable
          ? `Image configured: ${execution.singularityImage}.`
          : `Configured image was not found locally: ${execution.singularityImage}.`
        : "execution.singularityImage is not configured.",
    ),
    createCheck(
      "singularity.workspace.mount",
      existsSync(workspaceDir) ? "pass" : "warn",
      "Workspace bind mount",
      existsSync(workspaceDir)
        ? `${workspaceDir} will bind to ${execution.dockerWorkspacePath}.`
        : `Workspace directory ${workspaceDir} is not present.`,
    ),
    createCheck(
      "singularity.runtime.shell",
      "pass",
      "Container shell",
      "Commands execute through /bin/sh -lc inside the Singularity image.",
    ),
  ];
}
