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
  type TerminalRunResult,
} from "../execution/subprocess";
import {
  buildContainerChecks,
  buildContainerCommand,
  buildContainerPreviewChecks,
} from "../planning";

class DockerExecutionBackend implements ExecutionBackend {
  readonly name = "docker" as const;

  preview(
    command: string,
    options: { cwd: string; timeoutMs: number; settings: RuntimeSettings },
  ): ExecutionBackendPreview {
    const checks = buildContainerPreviewChecks(
      "docker",
      options.settings,
      options.cwd,
    );
    return {
      backend: this.name,
      mode: "container",
      engine: "docker",
      ready: false,
      detail:
        "Docker execution wraps the workspace in a container with hardened defaults.",
      cwd: options.cwd,
      timeoutMs: options.timeoutMs,
      command,
      argv: buildContainerCommand(
        "docker",
        command,
        options.cwd,
        options.settings,
      ),
      diagnostics: renderChecks(checks),
      checks,
      bootstrap: buildBootstrapHints(checks, [
        `Ensure docker is installed and the image ${options.settings.execution.dockerImage} is available.`,
        `Mount workspace ${options.cwd} at ${options.settings.execution.dockerWorkspacePath}.`,
      ]),
    };
  }

  async health(
    settings: RuntimeSettings,
    workspaceDir: string,
  ): Promise<ExecutionBackendHealth> {
    const probeTimeoutMs = settings.execution.healthTimeoutMs ?? 5_000;
    const runtimeAvailable = await commandExists("docker", probeTimeoutMs);
    const runtimeChecks = buildContainerChecks(
      "docker",
      settings,
      workspaceDir,
      runtimeAvailable,
      false,
    );
    if (!runtimeAvailable) {
      return {
        backend: this.name,
        mode: "container",
        engine: "docker",
        ready: false,
        detail: "Docker command not available.",
        limits: buildHealthLimits(settings),
        diagnostics: renderChecks(runtimeChecks),
        checks: runtimeChecks,
        bootstrap: buildBootstrapHints(runtimeChecks, [
          "Install Docker and make sure the daemon is running.",
          `Pull or build the image ${settings.execution.dockerImage}.`,
        ]),
      };
    }

    const version = await runCommand(
      ["docker", "version", "--format", "{{.Server.Version}}"],
      {
        timeoutMs: probeTimeoutMs,
      },
    ).catch(() => ({
      exitCode: 1,
      stdout: "",
      stderr: "Docker runtime unavailable.",
      timedOut: false,
      durationMs: 0,
    }));

    if (version.exitCode !== 0) {
      const failedChecks = buildContainerChecks(
        "docker",
        settings,
        workspaceDir,
        runtimeAvailable,
        false,
      );
      return {
        backend: this.name,
        mode: "container",
        engine: "docker",
        ready: false,
        detail: version.stderr || "Docker runtime unavailable.",
        limits: buildHealthLimits(settings),
        diagnostics: renderChecks(failedChecks),
        checks: failedChecks,
        bootstrap: buildBootstrapHints(failedChecks, [
          "Verify the Docker daemon is healthy and reachable from this host.",
          `Ensure the image ${settings.execution.dockerImage} exists locally.`,
        ]),
      };
    }

    const imageCheck = await runCommand(
      ["docker", "image", "inspect", settings.execution.dockerImage],
      { timeoutMs: probeTimeoutMs },
    ).catch(() => ({
      exitCode: 1,
      stdout: "",
      stderr: `Docker image ${settings.execution.dockerImage} is not available locally.`,
      timedOut: false,
      durationMs: 0,
    }));
    const imageAvailable = imageCheck.exitCode === 0;
    const checks = buildContainerChecks(
      "docker",
      settings,
      workspaceDir,
      runtimeAvailable,
      imageAvailable,
    );
    return {
      backend: this.name,
      mode: "container",
      engine: "docker",
      ready: imageAvailable,
      detail: imageAvailable
        ? `Docker ready (${version.stdout || "unknown version"}) with image ${settings.execution.dockerImage} for workspace ${workspaceDir}.`
        : imageCheck.stderr ||
          `Docker image ${settings.execution.dockerImage} is not available locally.`,
      limits: buildHealthLimits(settings),
      diagnostics: renderChecks(checks),
      checks,
      bootstrap: buildBootstrapHints(checks, [
        `Confirm workspace mount ${workspaceDir} -> ${settings.execution.dockerWorkspacePath}.`,
        `Use ${settings.execution.containerReadOnlyRoot ? "read-only" : "writable"} root filesystem.`,
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
    return normalizeBackendError(
      await runCommand(
        buildContainerCommand("docker", command, options.cwd, options.settings),
        {
          timeoutMs: options.timeoutMs,
          abortSignal: options.abortSignal,
        },
      ),
    );
  }
}

class PodmanExecutionBackend implements ExecutionBackend {
  readonly name = "podman" as const;

  preview(
    command: string,
    options: { cwd: string; timeoutMs: number; settings: RuntimeSettings },
  ): ExecutionBackendPreview {
    const checks = buildContainerPreviewChecks(
      "podman",
      options.settings,
      options.cwd,
    );
    return {
      backend: this.name,
      mode: "container",
      engine: "podman",
      ready: false,
      detail:
        "Podman execution mirrors the Docker path with rootless-friendly defaults.",
      cwd: options.cwd,
      timeoutMs: options.timeoutMs,
      command,
      argv: buildContainerCommand(
        "podman",
        command,
        options.cwd,
        options.settings,
      ),
      diagnostics: renderChecks(checks),
      checks,
      bootstrap: buildBootstrapHints(checks, [
        `Ensure podman is installed and the image ${options.settings.execution.dockerImage} is available.`,
        `Mount workspace ${options.cwd} at ${options.settings.execution.dockerWorkspacePath}.`,
      ]),
    };
  }

  async health(
    settings: RuntimeSettings,
    workspaceDir: string,
  ): Promise<ExecutionBackendHealth> {
    const probeTimeoutMs = settings.execution.healthTimeoutMs ?? 5_000;
    const runtimeAvailable = await commandExists("podman", probeTimeoutMs);
    const runtimeChecks = buildContainerChecks(
      "podman",
      settings,
      workspaceDir,
      runtimeAvailable,
      false,
    );
    if (!runtimeAvailable) {
      return {
        backend: this.name,
        mode: "container",
        engine: "podman",
        ready: false,
        detail: "Podman command not available.",
        limits: buildHealthLimits(settings),
        diagnostics: renderChecks(runtimeChecks),
        checks: runtimeChecks,
        bootstrap: buildBootstrapHints(runtimeChecks, [
          "Install Podman and make sure the rootless runtime is healthy.",
          `Pull or build the image ${settings.execution.dockerImage}.`,
        ]),
      };
    }

    const version = await runCommand(["podman", "--version"], {
      timeoutMs: probeTimeoutMs,
    }).catch(() => ({
      exitCode: 1,
      stdout: "",
      stderr: "Podman runtime unavailable.",
      timedOut: false,
      durationMs: 0,
    }));

    if (version.exitCode !== 0) {
      const failedChecks = buildContainerChecks(
        "podman",
        settings,
        workspaceDir,
        runtimeAvailable,
        false,
      );
      return {
        backend: this.name,
        mode: "container",
        engine: "podman",
        ready: false,
        detail: version.stderr || "Podman runtime unavailable.",
        limits: buildHealthLimits(settings),
        diagnostics: renderChecks(failedChecks),
        checks: failedChecks,
        bootstrap: buildBootstrapHints(failedChecks, [
          "Verify the Podman runtime is healthy and reachable from this host.",
          `Ensure the image ${settings.execution.dockerImage} exists locally.`,
        ]),
      };
    }

    const imageCheck = await runCommand(
      ["podman", "image", "inspect", settings.execution.dockerImage],
      { timeoutMs: probeTimeoutMs },
    ).catch(() => ({
      exitCode: 1,
      stdout: "",
      stderr: `Podman image ${settings.execution.dockerImage} is not available locally.`,
      timedOut: false,
      durationMs: 0,
    }));
    const imageAvailable = imageCheck.exitCode === 0;
    const checks = buildContainerChecks(
      "podman",
      settings,
      workspaceDir,
      runtimeAvailable,
      imageAvailable,
    );
    return {
      backend: this.name,
      mode: "container",
      engine: "podman",
      ready: imageAvailable,
      detail: imageAvailable
        ? `Podman ready (${version.stdout || "unknown version"}) with image ${settings.execution.dockerImage} for workspace ${workspaceDir}.`
        : imageCheck.stderr ||
          `Podman image ${settings.execution.dockerImage} is not available locally.`,
      limits: buildHealthLimits(settings),
      diagnostics: renderChecks(checks),
      checks,
      bootstrap: buildBootstrapHints(checks, [
        `Confirm workspace mount ${workspaceDir} -> ${settings.execution.dockerWorkspacePath}.`,
        `Use ${settings.execution.containerReadOnlyRoot ? "read-only" : "writable"} root filesystem.`,
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
    return normalizeBackendError(
      await runCommand(
        buildContainerCommand("podman", command, options.cwd, options.settings),
        {
          timeoutMs: options.timeoutMs,
          abortSignal: options.abortSignal,
        },
      ),
    );
  }
}

export function createContainerExecutionBackends(): ExecutionBackend[] {
  return [new DockerExecutionBackend(), new PodmanExecutionBackend()];
}
