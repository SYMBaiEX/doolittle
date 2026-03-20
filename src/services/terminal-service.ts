import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type {
  ExecutionBackendHealth,
  ExecutionBackendName,
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
}

interface ExecutionBackend {
  readonly name: ExecutionBackendName;
  health(settings: RuntimeSettings, workspaceDir: string): Promise<ExecutionBackendHealth>;
  run(
    command: string,
    options: { cwd: string; timeoutMs: number; settings: RuntimeSettings },
  ): Promise<TerminalRunResult>;
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

async function runCommand(
  cmd: string[],
  options: { cwd?: string; timeoutMs: number },
): Promise<TerminalRunResult> {
  const proc = Bun.spawn({
    cmd,
    cwd: options.cwd,
    stdout: "pipe",
    stderr: "pipe",
  });

  const timer = setTimeout(() => {
    proc.kill();
  }, options.timeoutMs);

  return Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
    .then(([stdout, stderr, exitCode]) => ({
      exitCode,
      stdout: stdout.trim(),
      stderr: stderr.trim(),
    }))
    .finally(() => clearTimeout(timer));
}

function normalizeBackendError(result: TerminalRunResult): TerminalRunResult {
  return {
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr:
      result.stderr || (result.exitCode === 0 ? "" : "Command failed without stderr output."),
  };
}

async function commandExists(binary: string): Promise<boolean> {
  const result = await runCommand(["/bin/zsh", "-lc", `command -v ${shellQuote(binary)}`], {
    timeoutMs: 5_000,
  }).catch(() => ({
    exitCode: 1,
    stdout: "",
    stderr: "",
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
  const passthroughFlags = execution.dockerEnvPassthrough.flatMap((name) =>
    process.env[name] ? ["-e", `${name}=${process.env[name]}`] : [],
  );

  return [
    engine,
    "run",
    "--rm",
    "--init",
    "--network",
    execution.dockerNetwork,
    "-w",
    execution.dockerWorkspacePath,
    "-v",
    `${cwd}:${execution.dockerWorkspacePath}`,
    ...passthroughFlags,
    execution.dockerImage,
    "/bin/zsh",
    "-lc",
    command,
  ];
}

function buildSshBaseArgs(settings: RuntimeSettings): string[] {
  const execution = settings.execution;
  return [
    "-o",
    "BatchMode=yes",
    "-o",
    "ConnectTimeout=5",
    "-o",
    `StrictHostKeyChecking=${execution.sshStrictHostKeyChecking ? "yes" : "no"}`,
    "-p",
    String(execution.sshPort),
    ...(execution.sshKeyPath ? ["-i", execution.sshKeyPath] : []),
  ];
}

class LocalExecutionBackend implements ExecutionBackend {
  readonly name = "local" as const;

  async health(): Promise<ExecutionBackendHealth> {
    return {
      backend: this.name,
      mode: "local",
      ready: true,
      detail: "Local Bun shell execution is available.",
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

  async health(settings: RuntimeSettings, workspaceDir: string): Promise<ExecutionBackendHealth> {
    if (!(await commandExists("docker"))) {
      return {
        backend: this.name,
        mode: "container",
        engine: "docker",
        ready: false,
        detail: "Docker command not available.",
      };
    }

    const version = await runCommand(["docker", "version", "--format", "{{.Server.Version}}"], {
      timeoutMs: 5_000,
    }).catch(() => ({
      exitCode: 1,
      stdout: "",
      stderr: "Docker runtime unavailable.",
    }));

    if (version.exitCode !== 0) {
      return {
        backend: this.name,
        mode: "container",
        engine: "docker",
        ready: false,
        detail: version.stderr || "Docker runtime unavailable.",
      };
    }

    const imageCheck = await runCommand(
      ["docker", "image", "inspect", settings.execution.dockerImage],
      { timeoutMs: 5_000 },
    ).catch(() => ({
      exitCode: 1,
      stdout: "",
      stderr: `Docker image ${settings.execution.dockerImage} is not available locally.`,
    }));

    return {
      backend: this.name,
      mode: "container",
      engine: "docker",
      ready: imageCheck.exitCode === 0,
      detail:
        imageCheck.exitCode === 0
          ? `Docker ready (${version.stdout || "unknown version"}) with image ${settings.execution.dockerImage} for workspace ${workspaceDir}.`
          : imageCheck.stderr || `Docker image ${settings.execution.dockerImage} is not available locally.`,
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

  async health(settings: RuntimeSettings, workspaceDir: string): Promise<ExecutionBackendHealth> {
    if (!(await commandExists("podman"))) {
      return {
        backend: this.name,
        mode: "container",
        engine: "podman",
        ready: false,
        detail: "Podman command not available.",
      };
    }

    const version = await runCommand(["podman", "--version"], {
      timeoutMs: 5_000,
    }).catch(() => ({
      exitCode: 1,
      stdout: "",
      stderr: "Podman runtime unavailable.",
    }));

    if (version.exitCode !== 0) {
      return {
        backend: this.name,
        mode: "container",
        engine: "podman",
        ready: false,
        detail: version.stderr || "Podman runtime unavailable.",
      };
    }

    const imageCheck = await runCommand(
      ["podman", "image", "inspect", settings.execution.dockerImage],
      { timeoutMs: 5_000 },
    ).catch(() => ({
      exitCode: 1,
      stdout: "",
      stderr: `Podman image ${settings.execution.dockerImage} is not available locally.`,
    }));

    return {
      backend: this.name,
      mode: "container",
      engine: "podman",
      ready: imageCheck.exitCode === 0,
      detail:
        imageCheck.exitCode === 0
          ? `Podman ready (${version.stdout || "unknown version"}) with image ${settings.execution.dockerImage} for workspace ${workspaceDir}.`
          : imageCheck.stderr || `Podman image ${settings.execution.dockerImage} is not available locally.`,
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

  async health(settings: RuntimeSettings): Promise<ExecutionBackendHealth> {
    if (!(await commandExists("ssh"))) {
      return {
        backend: this.name,
        mode: "remote",
        engine: "ssh",
        ready: false,
        detail: "SSH command not available.",
      };
    }

    const execution = settings.execution;
    if (!execution.sshHost || !execution.sshUser || !execution.sshPath) {
      return {
        backend: this.name,
        mode: "remote",
        engine: "ssh",
        ready: false,
        detail:
          "SSH backend requires execution.sshHost, execution.sshUser, and execution.sshPath.",
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
      { timeoutMs: 5_000 },
    ).catch(() => ({
      exitCode: 1,
      stdout: "",
      stderr: "SSH command unavailable or remote host unreachable.",
    }));

    return {
      backend: this.name,
      mode: "remote",
      engine: "ssh",
      ready: probe.exitCode === 0,
      detail:
        probe.exitCode === 0
          ? `SSH backend ready for ${execution.sshUser}@${execution.sshHost}:${execution.sshPort} (${execution.sshPath}).`
          : probe.stderr ||
            `SSH backend could not reach ${execution.sshUser}@${execution.sshHost}:${execution.sshPort}.`,
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
      };
    }

    const remoteCommand = `cd ${shellQuote(execution.sshPath)} && /bin/zsh -lc ${shellQuote(command)}`;
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

export class TerminalService {
  private readonly filePath: string;
  private readonly backends = new Map<ExecutionBackendName, ExecutionBackend>([
    ["local", new LocalExecutionBackend()],
    ["docker", new DockerExecutionBackend()],
    ["podman", new PodmanExecutionBackend()],
    ["ssh", new SshExecutionBackend()],
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

  async run(command: string, timeoutMs = 30_000): Promise<TerminalCommandRecord> {
    const settings = this.getSettings();
    const backendName = settings.execution.backend as ExecutionBackendName;
    const backend = this.backends.get(backendName) ?? this.backends.get("local");
    if (!backend) {
      throw new Error("No execution backend is available.");
    }

    const startedAt = new Date().toISOString();
    const result = await backend.run(command, {
      cwd: this.workspaceDir,
      timeoutMs,
      settings,
    });

    const record: TerminalCommandRecord = {
      id: randomUUID(),
      command,
      backend: backend.name,
      cwd: this.workspaceDir,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      startedAt,
      completedAt: new Date().toISOString(),
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
