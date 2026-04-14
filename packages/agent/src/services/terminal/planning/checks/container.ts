import type { DiagnosticCheck } from "@/types/execution";
import type { RuntimeSettings } from "../../../settings/runtime-settings";
import { isValidEnvName } from "../../cloud/planning/index";
import {
  buildContainerRootfsCheck,
  buildLimitsCheck,
  buildShellCheck,
  buildWorkspaceCheck,
} from "./shared";
import type { ContainerEngine } from "./types";

function resolveEnvDiagnostics(settings: RuntimeSettings): {
  configuredNames: string[];
  invalidNames: string[];
  availableCount: number;
} {
  const configuredNames =
    settings.execution.dockerEnvPassthrough.filter(isValidEnvName);
  return {
    configuredNames,
    invalidNames: settings.execution.dockerEnvPassthrough.filter(
      (name) => !isValidEnvName(name),
    ),
    availableCount: configuredNames.filter((name) => Boolean(process.env[name]))
      .length,
  };
}

function buildContainerEnvCheck(
  engine: ContainerEngine,
  settings: RuntimeSettings,
): DiagnosticCheck {
  const { configuredNames, invalidNames, availableCount } =
    resolveEnvDiagnostics(settings);

  return {
    ...buildShellCheck(
      `${engine}.sandbox.env`,
      "Environment passthrough",
      invalidNames.length === 0
        ? `Forwarding ${availableCount}/${settings.execution.dockerEnvPassthrough.length} configured env vars.`
        : `Ignoring invalid env names: ${invalidNames.join(", ")}.`,
    ),
    status:
      invalidNames.length === 0 && configuredNames.length > 0 ? "pass" : "warn",
  };
}

function buildContainerUserNamespaceCheck(
  engine: ContainerEngine,
): DiagnosticCheck {
  return {
    ...buildShellCheck(
      `${engine}.runtime.userns`,
      "Container user namespace",
      engine === "podman"
        ? "Podman will use keep-id user namespaces."
        : "Docker uses the default user namespace mapping.",
    ),
    status: engine === "podman" ? "pass" : "warn",
  };
}

export function buildContainerChecks(
  engine: ContainerEngine,
  settings: RuntimeSettings,
  workspaceDir: string,
  runtimeAvailable: boolean,
  imageAvailable: boolean,
): DiagnosticCheck[] {
  const execution = settings.execution;

  return [
    {
      ...buildShellCheck(
        `${engine}.runtime.binary`,
        `${engine} runtime binary`,
        runtimeAvailable
          ? `${engine} command is available on this host.`
          : `${engine} command is not available on this host.`,
      ),
      status: runtimeAvailable ? "pass" : "fail",
    },
    {
      ...buildShellCheck(
        `${engine}.runtime.image`,
        `${engine} image availability`,
        imageAvailable
          ? `Image ${execution.dockerImage} is available locally.`
          : `Image ${execution.dockerImage} is not available locally.`,
      ),
      status: imageAvailable ? "pass" : "fail",
    },
    buildWorkspaceCheck(
      `${engine}.workspace.mount`,
      "Workspace mount",
      workspaceDir,
      `${workspaceDir} can be mounted at ${execution.dockerWorkspacePath}.`,
    ),
    buildContainerRootfsCheck(
      `${engine}.sandbox.rootfs`,
      "Read-only container root",
      execution.containerReadOnlyRoot ?? true,
      "Container root filesystem will be read-only.",
      "Container root filesystem is writable.",
    ),
    buildLimitsCheck(
      `${engine}.sandbox.limits`,
      "Container resource limits",
      execution.containerCpuLimit,
      execution.containerMemoryLimit,
      execution.containerPidsLimit,
    ),
    buildContainerEnvCheck(engine, settings),
    buildContainerUserNamespaceCheck(engine),
    buildShellCheck(
      `${engine}.runtime.shell`,
      "Container shell",
      "Commands execute through /bin/sh -lc for portability.",
    ),
  ];
}

export function buildContainerPreviewChecks(
  engine: ContainerEngine,
  settings: RuntimeSettings,
  workspaceDir: string,
): DiagnosticCheck[] {
  const execution = settings.execution;

  return [
    buildShellCheck(
      `${engine}.preview.generated`,
      `${engine} preview`,
      `Execution will run with the ${engine} backend using ${execution.dockerImage}.`,
    ),
    buildShellCheck(
      `${engine}.preview.command`,
      "Container command",
      "Commands execute through /bin/sh -lc inside the container.",
    ),
    buildWorkspaceCheck(
      `${engine}.preview.workspace`,
      "Workspace mount",
      workspaceDir,
      `${workspaceDir} will mount at ${execution.dockerWorkspacePath}.`,
    ),
    buildContainerRootfsCheck(
      `${engine}.preview.rootfs`,
      "Root filesystem",
      execution.containerReadOnlyRoot ?? true,
      "Root filesystem is planned as read-only.",
      "Root filesystem is planned as writable.",
    ),
    buildLimitsCheck(
      `${engine}.preview.limits`,
      "Resource limits",
      execution.containerCpuLimit,
      execution.containerMemoryLimit,
      execution.containerPidsLimit,
    ),
  ];
}
