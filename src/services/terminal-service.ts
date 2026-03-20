import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type {
  DiagnosticCheck,
  ExecutionBackendHealth,
  ExecutionBackendLimits,
  ExecutionBackendName,
  ExecutionBackendPreview,
  TerminalCommandRecord,
} from "@/types";
import type { RuntimeSettings } from "./settings-service";

interface TerminalStore {
  commands: TerminalCommandRecord[];
}

interface TerminalRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  durationMs: number;
}

interface ExecutionBackend {
  readonly name: ExecutionBackendName;
  preview(
    command: string,
    options: { cwd: string; timeoutMs: number; settings: RuntimeSettings },
  ): ExecutionBackendPreview;
  health(settings: RuntimeSettings, workspaceDir: string): Promise<ExecutionBackendHealth>;
  run(
    command: string,
    options: { cwd: string; timeoutMs: number; settings: RuntimeSettings },
  ): Promise<TerminalRunResult>;
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function createCheck(
  id: string,
  status: DiagnosticCheck["status"],
  summary: string,
  detail: string,
): DiagnosticCheck {
  return { id, status, summary, detail };
}

function renderChecks(checks: DiagnosticCheck[]): string[] {
  return checks.map((check) => `[${check.status}] ${check.summary}: ${check.detail}`);
}

async function runCommand(
  cmd: string[],
  options: { cwd?: string; timeoutMs: number },
): Promise<TerminalRunResult> {
  const startedAt = Date.now();
  const proc = Bun.spawn({
    cmd,
    cwd: options.cwd,
    stdout: "pipe",
    stderr: "pipe",
  });

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    proc.kill();
  }, options.timeoutMs);

  try {
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    const durationMs = Date.now() - startedAt;

    return {
      exitCode: timedOut ? 124 : exitCode,
      stdout: stdout.trim(),
      stderr:
        stderr.trim() ||
        (timedOut
          ? `Command timed out after ${options.timeoutMs}ms (${durationMs}ms elapsed).`
          : ""),
      timedOut,
      durationMs,
    };
  } finally {
    clearTimeout(timer);
  }
}

function normalizeBackendError(result: TerminalRunResult): TerminalRunResult {
  return {
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr:
      result.stderr || (result.exitCode === 0 ? "" : "Command failed without stderr output."),
    timedOut: result.timedOut,
    durationMs: result.durationMs,
  };
}

async function commandExists(binary: string, timeoutMs = 5_000): Promise<boolean> {
  const result = await runCommand(["/bin/zsh", "-lc", `command -v ${shellQuote(binary)}`], {
    timeoutMs,
  }).catch(() => ({
    exitCode: 1,
    stdout: "",
    stderr: "",
    timedOut: false,
    durationMs: 0,
  }));
  return result.exitCode === 0;
}

function buildContainerCommand(
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
    .flatMap((name) => (process.env[name] ? ["-e", `${name}=${process.env[name]}`] : []));
  const readOnlyFlags = containerReadOnlyRoot
    ? [
        "--read-only",
        "--tmpfs",
        "/tmp:rw,mode=1777",
        "--tmpfs",
        "/run:rw,mode=755",
      ]
    : [];
  const engineFlags =
    engine === "podman"
      ? ["--userns", "keep-id"]
      : [];

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

function buildSingularityCommand(
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

function buildCliTargetCommand(
  binary: string,
  target: string,
  command: string,
  cwd: string,
): string[] {
  return [binary, "exec", target, "--cwd", cwd, "--", "/bin/sh", "-lc", command];
}

function buildSshBaseArgs(settings: RuntimeSettings): string[] {
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

function isValidEnvName(name: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name);
}

function buildHealthLimits(settings: RuntimeSettings): ExecutionBackendLimits {
  const execution = settings.execution;
  return {
    commandTimeoutMs: execution.commandTimeoutMs ?? 30_000,
    healthTimeoutMs: execution.healthTimeoutMs ?? 5_000,
    containerCpuLimit: execution.containerCpuLimit ?? "2",
    containerMemoryLimit: execution.containerMemoryLimit ?? "2g",
    containerPidsLimit: execution.containerPidsLimit ?? 256,
    containerReadOnlyRoot: execution.containerReadOnlyRoot ?? true,
  };
}

function buildBootstrapHints(checks: DiagnosticCheck[], fallback: string[]): string[] {
  const hints = checks
    .filter((check) => check.status !== "pass")
    .slice(0, 4)
    .map((check) => `${check.summary}: ${check.detail}`);
  return hints.length > 0 ? hints : fallback;
}

function buildContainerChecks(
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
  const invalidEnvNames = execution.dockerEnvPassthrough.filter((name) => !isValidEnvName(name));

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
      engine === "podman" ? "Podman will use keep-id user namespaces." : "Docker uses the default user namespace mapping.",
    ),
    createCheck(
      `${engine}.runtime.shell`,
      "pass",
      "Container shell",
      "Commands execute through /bin/sh -lc for portability.",
    ),
  ];
}

function buildContainerPreviewChecks(
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
      execution.containerReadOnlyRoot ?? true ? "pass" : "warn",
      "Root filesystem",
      execution.containerReadOnlyRoot ?? true
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

function buildSshChecks(settings: RuntimeSettings, runtimeAvailable: boolean, pathExists: boolean): DiagnosticCheck[] {
  const execution = settings.execution;
  const keyConfigured = Boolean(execution.sshKeyPath);
  const keyExists = !execution.sshKeyPath || existsSync(execution.sshKeyPath);
  return [
    createCheck(
      "ssh.runtime.binary",
      runtimeAvailable ? "pass" : "fail",
      "SSH client availability",
      runtimeAvailable ? "ssh command is available on this host." : "ssh command is not available on this host.",
    ),
    createCheck(
      "ssh.config.host",
      execution.sshHost ? "pass" : "fail",
      "SSH host",
      execution.sshHost ? `Host configured: ${execution.sshHost}.` : "SSH host is not configured.",
    ),
    createCheck(
      "ssh.config.user",
      execution.sshUser ? "pass" : "fail",
      "SSH user",
      execution.sshUser ? `User configured: ${execution.sshUser}.` : "SSH user is not configured.",
    ),
    createCheck(
      "ssh.config.path",
      execution.sshPath ? "pass" : "fail",
      "Remote workspace",
      execution.sshPath ? `Remote workspace path: ${execution.sshPath}.` : "Remote workspace path is not configured.",
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

function buildSshPreviewChecks(settings: RuntimeSettings): DiagnosticCheck[] {
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

function buildSingularityChecks(
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

function buildCliRemoteChecks(
  engine: "daytona" | "modal",
  settings: RuntimeSettings,
  workspaceDir: string,
  runtimeAvailable: boolean,
): DiagnosticCheck[] {
  const target =
    engine === "daytona"
      ? settings.execution.daytonaTarget
      : settings.execution.modalTarget;
  const command =
    engine === "daytona"
      ? settings.execution.daytonaCommand
      : settings.execution.modalCommand;

  return [
    createCheck(
      `${engine}.runtime.binary`,
      runtimeAvailable ? "pass" : "fail",
      `${engine} CLI availability`,
      runtimeAvailable
        ? `${engine} command is available on this host.`
        : `${engine} command is not available on this host.`,
    ),
    createCheck(
      `${engine}.config.target`,
      target ? "pass" : "fail",
      `${engine} target`,
      target
        ? `Execution target configured: ${target}.`
        : `${engine} target is not configured.`,
    ),
    createCheck(
      `${engine}.config.command`,
      command ? "pass" : "warn",
      `${engine} CLI command`,
      command
        ? `Using configured CLI command "${command}".`
        : `Defaulting to "${engine}" as the CLI command.`,
    ),
    createCheck(
      `${engine}.workspace.cwd`,
      existsSync(workspaceDir) ? "pass" : "warn",
      "Workspace path",
      existsSync(workspaceDir)
        ? `Workspace path ${workspaceDir} will be forwarded to ${engine}.`
        : `Workspace directory ${workspaceDir} is not present.`,
    ),
  ];
}

class LocalExecutionBackend implements ExecutionBackend {
  readonly name = "local" as const;

  preview(
    command: string,
    options: { cwd: string; timeoutMs: number; settings: RuntimeSettings },
  ): ExecutionBackendPreview {
    const checks = [
      createCheck(
        "local.shell",
        "pass",
        "Local shell",
        "Local commands execute through /bin/zsh -lc on the host.",
      ),
      createCheck(
        "local.workspace",
        existsSync(options.cwd) ? "pass" : "warn",
        "Workspace availability",
        existsSync(options.cwd)
          ? `Workspace ${options.cwd} is available.`
          : `Workspace ${options.cwd} is not present.`,
      ),
      createCheck(
        "local.timeout",
        "pass",
        "Command timeout",
        `Timeout budget set to ${options.timeoutMs}ms.`,
      ),
    ];
    return {
      backend: this.name,
      mode: "local",
      ready: true,
      detail: "Local Bun shell execution is available.",
      cwd: options.cwd,
      timeoutMs: options.timeoutMs,
      command,
      argv: ["/bin/zsh", "-lc", command],
      diagnostics: renderChecks(checks),
      checks,
      bootstrap: buildBootstrapHints(checks, ["No bootstrap required for local execution."]),
    };
  }

  async health(settings: RuntimeSettings): Promise<ExecutionBackendHealth> {
    const checks = [
      createCheck("local.shell", "pass", "Local shell", "Local Bun shell execution is available."),
      createCheck(
        "local.workspace",
        "pass",
        "Workspace availability",
        "Commands run inside the current workspace directory.",
      ),
      createCheck(
        "local.timeout",
        "pass",
        "Command timeout",
        `Default timeout budget is ${buildHealthLimits(settings).commandTimeoutMs}ms.`,
      ),
    ];
    return {
      backend: this.name,
      mode: "local",
      ready: true,
      detail: "Local Bun shell execution is available.",
      limits: buildHealthLimits(settings),
      diagnostics: renderChecks(checks),
      checks,
      bootstrap: buildBootstrapHints(checks, ["No bootstrap required."]),
    };
  }

  async run(
    command: string,
    options: { cwd: string; timeoutMs: number },
  ): Promise<TerminalRunResult> {
    return normalizeBackendError(await runCommand(["/bin/zsh", "-lc", command], options));
  }
}

class DockerExecutionBackend implements ExecutionBackend {
  readonly name = "docker" as const;

  preview(
    command: string,
    options: { cwd: string; timeoutMs: number; settings: RuntimeSettings },
  ): ExecutionBackendPreview {
    const checks = buildContainerPreviewChecks("docker", options.settings, options.cwd);
    return {
      backend: this.name,
      mode: "container",
      engine: "docker",
      ready: false,
      detail: "Docker execution wraps the workspace in a container with hardened defaults.",
      cwd: options.cwd,
      timeoutMs: options.timeoutMs,
      command,
      argv: buildContainerCommand("docker", command, options.cwd, options.settings),
      diagnostics: renderChecks(checks),
      checks,
      bootstrap: buildBootstrapHints(checks, [
        `Ensure docker is installed and the image ${options.settings.execution.dockerImage} is available.`,
        `Mount workspace ${options.cwd} at ${options.settings.execution.dockerWorkspacePath}.`,
      ]),
    };
  }

  async health(settings: RuntimeSettings, workspaceDir: string): Promise<ExecutionBackendHealth> {
    const probeTimeoutMs = settings.execution.healthTimeoutMs ?? 5_000;
    const runtimeAvailable = await commandExists("docker", probeTimeoutMs);
    const runtimeChecks = buildContainerChecks("docker", settings, workspaceDir, runtimeAvailable, false);
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

    const version = await runCommand(["docker", "version", "--format", "{{.Server.Version}}"], {
      timeoutMs: probeTimeoutMs,
    }).catch(() => ({
      exitCode: 1,
      stdout: "",
      stderr: "Docker runtime unavailable.",
      timedOut: false,
      durationMs: 0,
    }));

    if (version.exitCode !== 0) {
      const failedChecks = buildContainerChecks("docker", settings, workspaceDir, runtimeAvailable, false);
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
    const checks = buildContainerChecks("docker", settings, workspaceDir, runtimeAvailable, imageAvailable);
    return {
      backend: this.name,
      mode: "container",
      engine: "docker",
      ready: imageAvailable,
      detail:
        imageAvailable
          ? `Docker ready (${version.stdout || "unknown version"}) with image ${settings.execution.dockerImage} for workspace ${workspaceDir}.`
          : imageCheck.stderr || `Docker image ${settings.execution.dockerImage} is not available locally.`,
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
    options: { cwd: string; timeoutMs: number; settings: RuntimeSettings },
  ): Promise<TerminalRunResult> {
    return normalizeBackendError(
      await runCommand(buildContainerCommand("docker", command, options.cwd, options.settings), {
        timeoutMs: options.timeoutMs,
      }),
    );
  }
}

class PodmanExecutionBackend implements ExecutionBackend {
  readonly name = "podman" as const;

  preview(
    command: string,
    options: { cwd: string; timeoutMs: number; settings: RuntimeSettings },
  ): ExecutionBackendPreview {
    const checks = buildContainerPreviewChecks("podman", options.settings, options.cwd);
    return {
      backend: this.name,
      mode: "container",
      engine: "podman",
      ready: false,
      detail: "Podman execution mirrors the Docker path with rootless-friendly defaults.",
      cwd: options.cwd,
      timeoutMs: options.timeoutMs,
      command,
      argv: buildContainerCommand("podman", command, options.cwd, options.settings),
      diagnostics: renderChecks(checks),
      checks,
      bootstrap: buildBootstrapHints(checks, [
        `Ensure podman is installed and the image ${options.settings.execution.dockerImage} is available.`,
        `Mount workspace ${options.cwd} at ${options.settings.execution.dockerWorkspacePath}.`,
      ]),
    };
  }

  async health(settings: RuntimeSettings, workspaceDir: string): Promise<ExecutionBackendHealth> {
    const probeTimeoutMs = settings.execution.healthTimeoutMs ?? 5_000;
    const runtimeAvailable = await commandExists("podman", probeTimeoutMs);
    const runtimeChecks = buildContainerChecks("podman", settings, workspaceDir, runtimeAvailable, false);
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
      const failedChecks = buildContainerChecks("podman", settings, workspaceDir, runtimeAvailable, false);
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
    const checks = buildContainerChecks("podman", settings, workspaceDir, runtimeAvailable, imageAvailable);
    return {
      backend: this.name,
      mode: "container",
      engine: "podman",
      ready: imageAvailable,
      detail:
        imageAvailable
          ? `Podman ready (${version.stdout || "unknown version"}) with image ${settings.execution.dockerImage} for workspace ${workspaceDir}.`
          : imageCheck.stderr || `Podman image ${settings.execution.dockerImage} is not available locally.`,
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
    options: { cwd: string; timeoutMs: number; settings: RuntimeSettings },
  ): Promise<TerminalRunResult> {
    return normalizeBackendError(
      await runCommand(buildContainerCommand("podman", command, options.cwd, options.settings), {
        timeoutMs: options.timeoutMs,
      }),
    );
  }
}

class SshExecutionBackend implements ExecutionBackend {
  readonly name = "ssh" as const;

  preview(
    command: string,
    options: { cwd: string; timeoutMs: number; settings: RuntimeSettings },
  ): ExecutionBackendPreview {
    const execution = options.settings.execution;
    const checks = buildSshPreviewChecks(options.settings);
    return {
      backend: this.name,
      mode: "remote",
      engine: "ssh",
      ready: false,
      detail: "SSH execution runs the command on a remote host and workspace.",
      cwd: options.cwd,
      timeoutMs: options.timeoutMs,
      command,
      argv: [
        "ssh",
        ...buildSshBaseArgs(options.settings),
        `${execution.sshUser || "?"}@${execution.sshHost || "?"}`,
        `cd ${shellQuote(execution.sshPath || "UNKNOWN")} && exec sh -lc ${shellQuote(command)}`,
      ],
      diagnostics: renderChecks(checks),
      checks,
      bootstrap: buildBootstrapHints(checks, [
        `Ensure SSH access to ${execution.sshHost || "the remote host"} is working.`,
        `Ensure the remote workspace ${execution.sshPath || "UNKNOWN"} exists.`,
      ]),
    };
  }

  async health(settings: RuntimeSettings): Promise<ExecutionBackendHealth> {
    const probeTimeoutMs = settings.execution.healthTimeoutMs ?? 5_000;
    const runtimeAvailable = await commandExists("ssh", probeTimeoutMs);
    const execution = settings.execution;
    const baseChecks = buildSshChecks(settings, runtimeAvailable, false);
    if (!runtimeAvailable) {
      return {
        backend: this.name,
        mode: "remote",
        engine: "ssh",
        ready: false,
        detail: "SSH command not available.",
        limits: buildHealthLimits(settings),
        diagnostics: renderChecks(baseChecks),
        checks: baseChecks,
        bootstrap: buildBootstrapHints(baseChecks, ["Install the ssh client and verify key/host access."]),
      };
    }

    if (!execution.sshHost || !execution.sshUser || !execution.sshPath) {
      return {
        backend: this.name,
        mode: "remote",
        engine: "ssh",
        ready: false,
        detail:
          "SSH backend requires execution.sshHost, execution.sshUser, and execution.sshPath.",
        limits: buildHealthLimits(settings),
        diagnostics: renderChecks(baseChecks),
        checks: baseChecks,
        bootstrap: buildBootstrapHints(baseChecks, ["Set ssh host, user, and remote path in runtime settings."]),
      };
    }

    if (execution.sshKeyPath && !existsSync(execution.sshKeyPath)) {
      return {
        backend: this.name,
        mode: "remote",
        engine: "ssh",
        ready: false,
        detail: `SSH key path does not exist: ${execution.sshKeyPath}.`,
        limits: buildHealthLimits(settings),
        diagnostics: renderChecks(baseChecks),
        checks: baseChecks,
        bootstrap: buildBootstrapHints(baseChecks, [`Create or correct the SSH key path: ${execution.sshKeyPath}.`]),
      };
    }

    const probe = await runCommand(
      [
        "ssh",
        ...buildSshBaseArgs(settings),
        `${execution.sshUser}@${execution.sshHost}`,
        "test",
        "-d",
        execution.sshPath,
      ],
      { timeoutMs: settings.execution.healthTimeoutMs ?? 5_000 },
    ).catch(() => ({
      exitCode: 1,
      stdout: "",
      stderr: "SSH command unavailable or remote host unreachable.",
      timedOut: false,
      durationMs: 0,
    }));
    const ready = probe.exitCode === 0;
    const finalChecks = buildSshChecks(settings, runtimeAvailable, ready);

    return {
      backend: this.name,
      mode: "remote",
      engine: "ssh",
      ready,
      detail:
        ready
          ? `SSH backend ready for ${execution.sshUser}@${execution.sshHost}:${execution.sshPort} (${execution.sshPath}).`
          : probe.stderr ||
            `SSH backend could not reach ${execution.sshUser}@${execution.sshHost}:${execution.sshPort}.`,
      limits: buildHealthLimits(settings),
      diagnostics: renderChecks(finalChecks),
      checks: finalChecks,
      bootstrap: buildBootstrapHints(finalChecks, [
        `Verify remote path ${execution.sshPath} exists and is writable if needed.`,
        execution.sshStrictHostKeyChecking
          ? "Host key checking is enabled."
          : "Host key checking is disabled for this session.",
      ]),
    };
  }

  async run(
    command: string,
    options: { timeoutMs: number; settings: RuntimeSettings },
  ): Promise<TerminalRunResult> {
    const execution = options.settings.execution;
    if (!execution.sshHost || !execution.sshUser || !execution.sshPath) {
      return {
        exitCode: 1,
        stdout: "",
        stderr: "SSH backend requires execution.sshHost, execution.sshUser, and execution.sshPath.",
        timedOut: false,
        durationMs: 0,
      };
    }

    const remoteCommand = `cd ${shellQuote(execution.sshPath)} && exec sh -lc ${shellQuote(command)}`;
    return normalizeBackendError(
      await runCommand(
        [
          "ssh",
          ...buildSshBaseArgs(options.settings),
          `${execution.sshUser}@${execution.sshHost}`,
          remoteCommand,
        ],
        { timeoutMs: options.timeoutMs },
      ),
    );
  }
}

class SingularityExecutionBackend implements ExecutionBackend {
  readonly name = "singularity" as const;

  preview(
    command: string,
    options: { cwd: string; timeoutMs: number; settings: RuntimeSettings },
  ): ExecutionBackendPreview {
    const checks = buildSingularityChecks(options.settings, options.cwd, true, Boolean(options.settings.execution.singularityImage));
    return {
      backend: this.name,
      mode: "container",
      engine: "singularity",
      ready: false,
      detail: "Singularity execution binds the workspace into a configured image for hermetic runs.",
      cwd: options.cwd,
      timeoutMs: options.timeoutMs,
      command,
      argv: buildSingularityCommand(command, options.cwd, options.settings),
      diagnostics: renderChecks(checks),
      checks,
      bootstrap: buildBootstrapHints(checks, [
        "Install Singularity or Apptainer on the host.",
        "Set execution.singularityImage to a valid local image before using this backend.",
      ]),
    };
  }

  async health(settings: RuntimeSettings, workspaceDir: string): Promise<ExecutionBackendHealth> {
    const probeTimeoutMs = settings.execution.healthTimeoutMs ?? 5_000;
    const runtimeAvailable = await commandExists("singularity", probeTimeoutMs);
    const imageAvailable = Boolean(
      settings.execution.singularityImage &&
        (existsSync(settings.execution.singularityImage) ||
          settings.execution.singularityImage.includes("://")),
    );
    const checks = buildSingularityChecks(
      settings,
      workspaceDir,
      runtimeAvailable,
      imageAvailable,
    );

    return {
      backend: this.name,
      mode: "container",
      engine: "singularity",
      ready: runtimeAvailable && imageAvailable,
      detail:
        runtimeAvailable && imageAvailable
          ? `Singularity ready with image ${settings.execution.singularityImage}.`
          : !runtimeAvailable
            ? "singularity command is not available."
            : `Singularity image is not configured or missing: ${settings.execution.singularityImage || "n/a"}.`,
      limits: buildHealthLimits(settings),
      diagnostics: renderChecks(checks),
      checks,
      bootstrap: buildBootstrapHints(checks, [
        "Install Singularity or Apptainer and confirm the binary is on PATH.",
        "Provide a local SIF image path or supported remote image reference.",
      ]),
    };
  }

  async run(
    command: string,
    options: { cwd: string; timeoutMs: number; settings: RuntimeSettings },
  ): Promise<TerminalRunResult> {
    if (!options.settings.execution.singularityImage) {
      return {
        exitCode: 1,
        stdout: "",
        stderr: "Singularity backend requires execution.singularityImage.",
        timedOut: false,
        durationMs: 0,
      };
    }

    return normalizeBackendError(
      await runCommand(buildSingularityCommand(command, options.cwd, options.settings), {
        timeoutMs: options.timeoutMs,
      }),
    );
  }
}

class CliRemoteExecutionBackend implements ExecutionBackend {
  constructor(
    readonly name: "daytona" | "modal",
    private readonly getBinary: (settings: RuntimeSettings) => string,
    private readonly getTarget: (settings: RuntimeSettings) => string,
  ) {}

  preview(
    command: string,
    options: { cwd: string; timeoutMs: number; settings: RuntimeSettings },
  ): ExecutionBackendPreview {
    const binary = this.getBinary(options.settings);
    const target = this.getTarget(options.settings);
    const checks = buildCliRemoteChecks(this.name, options.settings, options.cwd, true);
    return {
      backend: this.name,
      mode: "remote",
      engine: this.name,
      ready: false,
      detail: `${this.name} execution uses a CLI-managed remote sandbox target.`,
      cwd: options.cwd,
      timeoutMs: options.timeoutMs,
      command,
      argv: buildCliTargetCommand(binary, target || "TARGET", command, options.cwd),
      diagnostics: renderChecks(checks),
      checks,
      bootstrap: buildBootstrapHints(checks, [
        `Install the ${binary} CLI and authenticate it locally.`,
        `Configure execution.${this.name}Target before selecting the ${this.name} backend.`,
      ]),
    };
  }

  async health(settings: RuntimeSettings, workspaceDir: string): Promise<ExecutionBackendHealth> {
    const binary = this.getBinary(settings);
    const target = this.getTarget(settings);
    const probeTimeoutMs = settings.execution.healthTimeoutMs ?? 5_000;
    const runtimeAvailable = await commandExists(binary, probeTimeoutMs);
    const checks = buildCliRemoteChecks(this.name, settings, workspaceDir, runtimeAvailable);
    return {
      backend: this.name,
      mode: "remote",
      engine: this.name,
      ready: runtimeAvailable && Boolean(target),
      detail:
        runtimeAvailable && target
          ? `${this.name} backend is configured for target ${target}.`
          : !runtimeAvailable
            ? `${binary} command is not available.`
            : `${this.name} target is not configured.`,
      limits: buildHealthLimits(settings),
      diagnostics: renderChecks(checks),
      checks,
      bootstrap: buildBootstrapHints(checks, [
        `Authenticate the ${binary} CLI and verify remote sandbox access.`,
        `Set execution.${this.name}Target to the desired persistent sandbox or environment.`,
      ]),
    };
  }

  async run(
    command: string,
    options: { cwd: string; timeoutMs: number; settings: RuntimeSettings },
  ): Promise<TerminalRunResult> {
    const binary = this.getBinary(options.settings);
    const target = this.getTarget(options.settings);
    if (!target) {
      return {
        exitCode: 1,
        stdout: "",
        stderr: `${this.name} backend requires a configured target.`,
        timedOut: false,
        durationMs: 0,
      };
    }
    return normalizeBackendError(
      await runCommand(buildCliTargetCommand(binary, target, command, options.cwd), {
        timeoutMs: options.timeoutMs,
      }),
    );
  }
}

export class TerminalService {
  private readonly filePath: string;
  private readonly backends = new Map<ExecutionBackendName, ExecutionBackend>([
    ["local", new LocalExecutionBackend()],
    ["docker", new DockerExecutionBackend()],
    ["podman", new PodmanExecutionBackend()],
    ["ssh", new SshExecutionBackend()],
    ["singularity", new SingularityExecutionBackend()],
    [
      "daytona",
      new CliRemoteExecutionBackend(
        "daytona",
        (settings) => settings.execution.daytonaCommand || "daytona",
        (settings) => settings.execution.daytonaTarget,
      ),
    ],
    [
      "modal",
      new CliRemoteExecutionBackend(
        "modal",
        (settings) => settings.execution.modalCommand || "modal",
        (settings) => settings.execution.modalTarget,
      ),
    ],
  ]);

  constructor(
    baseDir: string,
    private readonly workspaceDir: string,
    private readonly getSettings: () => RuntimeSettings,
  ) {
    mkdirSync(baseDir, { recursive: true });
    this.filePath = join(baseDir, "terminal-history.json");
    if (!existsSync(this.filePath)) {
      this.write({ commands: [] });
    }
  }

  async run(command: string, timeoutMs?: number): Promise<TerminalCommandRecord> {
    const settings = this.getSettings();
    const backendName = settings.execution.backend as ExecutionBackendName;
    const backend = this.backends.get(backendName) ?? this.backends.get("local");
    if (!backend) {
      throw new Error("No execution backend is available.");
    }
    const effectiveTimeoutMs = timeoutMs ?? settings.execution.commandTimeoutMs ?? 30_000;
    const preview = backend.preview(command, {
      cwd: this.workspaceDir,
      timeoutMs: effectiveTimeoutMs,
      settings,
    });

    const startedAt = new Date().toISOString();
    const result = await backend.run(command, {
      cwd: this.workspaceDir,
      timeoutMs: effectiveTimeoutMs,
      settings,
    });

    const record: TerminalCommandRecord = {
      id: randomUUID(),
      command,
      backend: backend.name,
      backendMode: preview.mode,
      backendEngine: preview.engine,
      cwd: this.workspaceDir,
      timeoutMs: effectiveTimeoutMs,
      timedOut: result.timedOut,
      durationMs: result.durationMs,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      startedAt,
      completedAt: new Date().toISOString(),
      preview,
    };

    const store = this.read();
    store.commands.push(record);
    if (store.commands.length > 100) {
      store.commands = store.commands.slice(-100);
    }
    this.write(store);
    return record;
  }

  async health(): Promise<ExecutionBackendHealth[]> {
    const settings = this.getSettings();
    return Promise.all(
      Array.from(this.backends.values()).map((backend) =>
        backend.health(settings, this.workspaceDir),
      ),
    );
  }

  preview(command: string, timeoutMs?: number): ExecutionBackendPreview {
    const settings = this.getSettings();
    const backendName = settings.execution.backend as ExecutionBackendName;
    const backend = this.backends.get(backendName) ?? this.backends.get("local");
    if (!backend) {
      throw new Error("No execution backend is available.");
    }

    return backend.preview(command, {
      cwd: this.workspaceDir,
      timeoutMs: timeoutMs ?? settings.execution.commandTimeoutMs ?? 30_000,
      settings,
    });
  }

  recent(limit = 10): TerminalCommandRecord[] {
    return this.read().commands.slice(-limit).reverse();
  }

  private read(): TerminalStore {
    return JSON.parse(readFileSync(this.filePath, "utf8")) as TerminalStore;
  }

  private write(store: TerminalStore): void {
    writeFileSync(this.filePath, JSON.stringify(store, null, 2), "utf8");
  }
}
