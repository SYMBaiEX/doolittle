import type {
  ExecutionBackendHealth,
  ExecutionBackendPreview,
} from "@/types/execution";
import type { RuntimeSettings } from "../../settings/runtime-settings";
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
import {
  buildContainerChecks,
  buildContainerCommand,
  buildContainerPreviewChecks,
} from "../planning";
import type { ContainerBackendSpec } from "./container-types";

interface ContainerBackendRunOptions {
  cwd: string;
  timeoutMs: number;
  settings: RuntimeSettings;
  abortSignal?: AbortSignal;
}

function probeFailure(detail: string): TerminalRunResult {
  return {
    exitCode: 1,
    stdout: "",
    stderr: detail,
    timedOut: false,
    durationMs: 0,
  };
}

export function previewContainerExecutionBackend(
  spec: ContainerBackendSpec,
  command: string,
  options: Omit<ContainerBackendRunOptions, "abortSignal">,
): ExecutionBackendPreview {
  const checks = buildContainerPreviewChecks(
    spec.name,
    options.settings,
    options.cwd,
  );
  return {
    backend: spec.name,
    mode: "container",
    engine: spec.name,
    ready: false,
    detail: spec.previewDetail,
    cwd: options.cwd,
    timeoutMs: options.timeoutMs,
    command,
    argv: buildContainerCommand(
      spec.name,
      command,
      options.cwd,
      options.settings,
    ),
    diagnostics: renderChecks(checks),
    checks,
    bootstrap: buildBootstrapHints(checks, [
      `Ensure ${spec.name} is installed and the image ${options.settings.execution.dockerImage} is available.`,
      `Mount workspace ${options.cwd} at ${options.settings.execution.dockerWorkspacePath}.`,
    ]),
  };
}

export async function getContainerExecutionBackendHealth(
  spec: ContainerBackendSpec,
  settings: RuntimeSettings,
  workspaceDir: string,
): Promise<ExecutionBackendHealth> {
  const { label, name } = spec;
  const image = settings.execution.dockerImage;
  const probeTimeoutMs = settings.execution.healthTimeoutMs ?? 5_000;
  const runtimeAvailable = await commandExists(name, probeTimeoutMs);

  if (!runtimeAvailable) {
    const checks = buildContainerChecks(
      name,
      settings,
      workspaceDir,
      false,
      false,
    );
    return {
      backend: name,
      mode: "container",
      engine: name,
      ready: false,
      detail: `${label} command not available.`,
      limits: buildHealthLimits(settings),
      diagnostics: renderChecks(checks),
      checks,
      bootstrap: buildBootstrapHints(checks, [
        spec.installHint,
        `Pull or build the image ${image}.`,
      ]),
    };
  }

  const version = await runCommand(spec.versionCommand, {
    timeoutMs: probeTimeoutMs,
  }).catch(() => probeFailure(`${label} runtime unavailable.`));

  if (version.exitCode !== 0) {
    const checks = buildContainerChecks(
      name,
      settings,
      workspaceDir,
      true,
      false,
    );
    return {
      backend: name,
      mode: "container",
      engine: name,
      ready: false,
      detail: version.stderr || `${label} runtime unavailable.`,
      limits: buildHealthLimits(settings),
      diagnostics: renderChecks(checks),
      checks,
      bootstrap: buildBootstrapHints(checks, [
        spec.verifyHint,
        `Ensure the image ${image} exists locally.`,
      ]),
    };
  }

  const imageCheck = await runCommand([name, "image", "inspect", image], {
    timeoutMs: probeTimeoutMs,
  }).catch(() =>
    probeFailure(`${label} image ${image} is not available locally.`),
  );
  const imageAvailable = imageCheck.exitCode === 0;
  const checks = buildContainerChecks(
    name,
    settings,
    workspaceDir,
    true,
    imageAvailable,
  );

  return {
    backend: name,
    mode: "container",
    engine: name,
    ready: imageAvailable,
    detail: imageAvailable
      ? `${label} ready (${version.stdout || "unknown version"}) with image ${image} for workspace ${workspaceDir}.`
      : imageCheck.stderr ||
        `${label} image ${image} is not available locally.`,
    limits: buildHealthLimits(settings),
    diagnostics: renderChecks(checks),
    checks,
    bootstrap: buildBootstrapHints(checks, [
      `Confirm workspace mount ${workspaceDir} -> ${settings.execution.dockerWorkspacePath}.`,
      `Use ${settings.execution.containerReadOnlyRoot ? "read-only" : "writable"} root filesystem.`,
    ]),
  };
}

export async function runContainerExecutionBackend(
  spec: ContainerBackendSpec,
  command: string,
  options: ContainerBackendRunOptions,
): Promise<TerminalRunResult> {
  return normalizeBackendError(
    await runCommand(
      buildContainerCommand(spec.name, command, options.cwd, options.settings),
      { timeoutMs: options.timeoutMs, abortSignal: options.abortSignal },
    ),
  );
}
