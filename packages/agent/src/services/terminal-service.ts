import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type {
  DiagnosticCheck,
  ExecutionBackendHealth,
  ExecutionBackendLimits,
  ExecutionBackendName,
  ExecutionBackendPreview,
  ExecutionCloudArtifactRecord,
  ExecutionCloudProfile,
  ExecutionCloudSession,
  ExecutionCloudSnapshotRecord,
  ExecutionRemoteSyncPlan,
  RemoteLifecycleEvent,
  TerminalCommandRecord,
} from "@/types";
import type { RuntimeSettings } from "./settings-service";

interface TerminalStore {
  commands: TerminalCommandRecord[];
}

interface CloudStore {
  sessions: ExecutionCloudSession[];
  snapshots: ExecutionCloudSnapshotRecord[];
  artifacts: ExecutionCloudArtifactRecord[];
}

class CloudStoreManager {
  constructor(private readonly filePath: string) {
    if (!existsSync(filePath)) {
      this.write({ sessions: [], snapshots: [], artifacts: [] });
    }
  }

  touch(
    profile: ExecutionCloudProfile,
    patch: Partial<ExecutionCloudSession> = {},
  ): ExecutionCloudSession {
    const store = this.readStore();
    const session = this.upsertSession(store, profile, patch);
    this.write(store);
    return session;
  }

  capture(
    profile: ExecutionCloudProfile,
    patch: {
      event: RemoteLifecycleEvent;
      state: ExecutionCloudSession["state"];
      cwd: string;
      summary: string;
      commandId?: string;
      command?: string;
      lastExitCode?: number;
      lastStdout?: string;
      lastStderr?: string;
    },
  ): ExecutionCloudSnapshotRecord {
    const store = this.readStore();
    const now = new Date().toISOString();
    const existing = this.findSession(store, profile);
    const sessionState = patch.state === "planned" ? "idle" : patch.state;
    this.upsertSession(store, profile, {
      ...patch,
      state: sessionState,
      syncState:
        patch.state === "failed" ? "error" : (existing?.syncState ?? "planned"),
      lastCommandId: patch.commandId ?? existing?.lastCommandId,
      lastCommand: patch.command ?? existing?.lastCommand,
      lastSnapshotAt: now,
      lastSnapshotId: patch.commandId ?? existing?.lastSnapshotId,
      lastSnapshotSummary: patch.summary,
    });
    const snapshot: ExecutionCloudSnapshotRecord = {
      snapshotId: randomUUID(),
      provider: profile.provider,
      target: profile.target,
      workspaceLabel: profile.workspaceLabel,
      event: patch.event,
      state: patch.state,
      summary: patch.summary,
      commandId: patch.commandId,
      command: patch.command,
      cwd: patch.cwd,
      workspacePath: profile.workspacePath,
      syncPlan: profile.syncPlan,
      artifacts: this.buildArtifactManifest(profile, now),
      createdAt: now,
      updatedAt: now,
      lastExitCode: patch.lastExitCode,
      lastStdout: patch.lastStdout,
      lastStderr: patch.lastStderr,
    };
    store.snapshots.push(snapshot);
    if (store.snapshots.length > 40) {
      store.snapshots = store.snapshots.slice(-40);
    }
    store.artifacts.push(...snapshot.artifacts);
    if (store.artifacts.length > 100) {
      store.artifacts = store.artifacts.slice(-100);
    }
    const refreshed = this.findSession(store, profile);
    if (refreshed) {
      refreshed.snapshotCount = (refreshed.snapshotCount ?? 0) + 1;
      refreshed.artifactCount =
        (refreshed.artifactCount ?? 0) + snapshot.artifacts.length;
      refreshed.syncState = patch.state === "failed" ? "error" : "synced";
      refreshed.lastSnapshotAt = now;
      refreshed.lastSnapshotId = snapshot.snapshotId;
      refreshed.lastSnapshotSummary = snapshot.summary;
      refreshed.updatedAt = now;
    }
    this.write(store);
    return snapshot;
  }

  get(profile: ExecutionCloudProfile): ExecutionCloudSession | undefined {
    return this.findSession(this.readStore(), profile);
  }

  listSnapshots(limit = 10): ExecutionCloudSnapshotRecord[] {
    return this.readStore().snapshots.slice(-limit).reverse();
  }

  listSnapshotsFor(
    profile: ExecutionCloudProfile,
    limit = 10,
  ): ExecutionCloudSnapshotRecord[] {
    return this.readStore()
      .snapshots.filter(
        (snapshot) =>
          snapshot.provider === profile.provider &&
          snapshot.target === profile.target,
      )
      .slice(-limit)
      .reverse();
  }

  latestSnapshot(
    profile: ExecutionCloudProfile,
  ): ExecutionCloudSnapshotRecord | undefined {
    return this.listSnapshotsFor(profile, 1)[0];
  }

  listArtifacts(limit = 10): ExecutionCloudArtifactRecord[] {
    return this.readStore().artifacts.slice(-limit).reverse();
  }

  private readStore(): CloudStore {
    const store = JSON.parse(
      readFileSync(this.filePath, "utf8"),
    ) as Partial<CloudStore>;
    return {
      sessions: store.sessions ?? [],
      snapshots: store.snapshots ?? [],
      artifacts: store.artifacts ?? [],
    };
  }

  private write(store: CloudStore): void {
    writeFileSync(this.filePath, JSON.stringify(store, null, 2), "utf8");
  }

  private findSession(
    store: CloudStore,
    profile: ExecutionCloudProfile,
  ): ExecutionCloudSession | undefined {
    return store.sessions.find(
      (session) =>
        session.provider === profile.provider &&
        session.target === profile.target,
    );
  }

  private upsertSession(
    store: CloudStore,
    profile: ExecutionCloudProfile,
    patch: Partial<ExecutionCloudSession> = {},
  ): ExecutionCloudSession {
    const now = new Date().toISOString();
    const existingIndex = store.sessions.findIndex(
      (session) =>
        session.provider === profile.provider &&
        session.target === profile.target,
    );
    const existing =
      existingIndex >= 0 ? store.sessions[existingIndex] : undefined;
    const session: ExecutionCloudSession = {
      sessionId: existing?.sessionId ?? randomUUID(),
      provider: profile.provider,
      target: profile.target,
      profile,
      state: patch.state ?? existing?.state ?? "idle",
      syncState: patch.syncState ?? existing?.syncState ?? "planned",
      workspaceLabel: profile.workspaceLabel,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      lastHealthAt: patch.lastHealthAt ?? existing?.lastHealthAt,
      lastPreviewAt: patch.lastPreviewAt ?? existing?.lastPreviewAt,
      lastRunAt: patch.lastRunAt ?? existing?.lastRunAt,
      lastCommandId: patch.lastCommandId ?? existing?.lastCommandId,
      lastCommand: patch.lastCommand ?? existing?.lastCommand,
      lastExitCode: patch.lastExitCode ?? existing?.lastExitCode,
      lastStdout: patch.lastStdout ?? existing?.lastStdout,
      lastStderr: patch.lastStderr ?? existing?.lastStderr,
      lastSnapshotAt: patch.lastSnapshotAt ?? existing?.lastSnapshotAt,
      lastSnapshotId: patch.lastSnapshotId ?? existing?.lastSnapshotId,
      lastSnapshotSummary:
        patch.lastSnapshotSummary ?? existing?.lastSnapshotSummary,
      snapshotCount: patch.snapshotCount ?? existing?.snapshotCount ?? 0,
      artifactCount: patch.artifactCount ?? existing?.artifactCount ?? 0,
      syncPlan: profile.syncPlan,
    };
    if (existingIndex >= 0) {
      store.sessions[existingIndex] = session;
    } else {
      store.sessions.push(session);
    }
    if (store.sessions.length > 20) {
      store.sessions = store.sessions.slice(-20);
    }
    return session;
  }

  private buildArtifactManifest(
    profile: ExecutionCloudProfile,
    now: string,
  ): ExecutionCloudArtifactRecord[] {
    return profile.artifactPaths.map((path, index) => ({
      artifactId: randomUUID(),
      provider: profile.provider,
      target: profile.target,
      workspaceLabel: profile.workspaceLabel,
      path,
      kind: index === 0 ? "manifest" : "report",
      status: "planned",
      detail:
        profile.artifactPolicy === "metadata-only"
          ? "Metadata-only remote artifact reference. No file contents are copied or persisted."
          : "Allowlisted remote artifact reference. The runtime only persists metadata and references.",
      createdAt: now,
      updatedAt: now,
    }));
  }
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
  health(
    settings: RuntimeSettings,
    workspaceDir: string,
  ): Promise<ExecutionBackendHealth>;
  run(
    command: string,
    options: { cwd: string; timeoutMs: number; settings: RuntimeSettings },
  ): Promise<TerminalRunResult>;
}

interface CloudStateAccessor {
  touch(
    profile: ExecutionCloudProfile,
    patch?: Partial<ExecutionCloudSession>,
  ): ExecutionCloudSession;
  get(profile: ExecutionCloudProfile): ExecutionCloudSession | undefined;
  capture(
    profile: ExecutionCloudProfile,
    patch: {
      event: RemoteLifecycleEvent;
      state: ExecutionCloudSession["state"];
      cwd: string;
      summary: string;
      commandId?: string;
      command?: string;
      lastExitCode?: number;
      lastStdout?: string;
      lastStderr?: string;
    },
  ): ExecutionCloudSnapshotRecord;
  listSnapshots(limit?: number): ExecutionCloudSnapshotRecord[];
  listArtifacts(limit?: number): ExecutionCloudArtifactRecord[];
  latestSnapshot(
    profile: ExecutionCloudProfile,
  ): ExecutionCloudSnapshotRecord | undefined;
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
  return checks.map(
    (check) => `[${check.status}] ${check.summary}: ${check.detail}`,
  );
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

async function runCommandStreaming(
  cmd: string[],
  options: {
    cwd?: string;
    timeoutMs: number;
    onStdout?: (chunk: string) => void;
    onStderr?: (chunk: string) => void;
  },
): Promise<TerminalRunResult> {
  const startedAt = Date.now();
  const proc = Bun.spawn({
    cmd,
    cwd: options.cwd,
    stdout: "pipe",
    stderr: "pipe",
  });

  let timedOut = false;
  let stdout = "";
  let stderr = "";
  const timer = setTimeout(() => {
    timedOut = true;
    proc.kill();
  }, options.timeoutMs);

  const readStream = async (
    stream: ReadableStream<Uint8Array> | null,
    onChunk?: (chunk: string) => void,
    sink?: (chunk: string) => void,
  ): Promise<void> => {
    if (!stream) {
      return;
    }
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        const chunk = decoder.decode(value, { stream: true });
        if (!chunk) {
          continue;
        }
        sink?.(chunk);
        onChunk?.(chunk);
      }
      const finalChunk = decoder.decode();
      if (finalChunk) {
        sink?.(finalChunk);
        onChunk?.(finalChunk);
      }
    } finally {
      reader.releaseLock();
    }
  };

  try {
    const [exitCode] = await Promise.all([
      proc.exited,
      readStream(proc.stdout, options.onStdout, (chunk) => {
        stdout += chunk;
      }),
      readStream(proc.stderr, options.onStderr, (chunk) => {
        stderr += chunk;
      }),
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
      result.stderr ||
      (result.exitCode === 0 ? "" : "Command failed without stderr output."),
    timedOut: result.timedOut,
    durationMs: result.durationMs,
  };
}

function sanitizeCommand(command: string): string {
  const trimmed = command.trim();
  if (!trimmed) {
    throw new Error("Command must not be empty.");
  }
  if (trimmed.includes("\u0000")) {
    throw new Error("Command contains unsupported NUL bytes.");
  }
  return trimmed;
}

async function commandExists(
  binary: string,
  timeoutMs = 5_000,
): Promise<boolean> {
  const result = await runCommand(
    ["/bin/zsh", "-lc", `command -v ${shellQuote(binary)}`],
    {
      timeoutMs,
    },
  ).catch(() => ({
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

function _buildCliTargetCommand(
  binary: string,
  target: string,
  command: string,
  cwd: string,
  shell = "/bin/sh",
): string[] {
  return [binary, "exec", target, "--cwd", cwd, "--", shell, "-lc", command];
}

function buildCloudCommandScript(
  command: string,
  workspacePath: string,
  settings: RuntimeSettings,
  options: {
    shell: string;
    bootstrapCommand?: string;
  },
): string {
  const execution = settings.execution;
  const envAssignments = execution.dockerEnvPassthrough
    .filter(isValidEnvName)
    .filter((name) => process.env[name] !== undefined)
    .map((name) => `${name}=${shellQuote(process.env[name] ?? "")}`);
  const parts = [
    "set -eu",
    `cd ${shellQuote(workspacePath)}`,
    envAssignments.length > 0 ? `export ${envAssignments.join(" ")}` : "",
    options.bootstrapCommand ? options.bootstrapCommand : "",
    command,
  ].filter(Boolean);
  return parts.join(" && ");
}

function buildRemoteSyncPlan(
  provider: "daytona" | "modal",
  settings: RuntimeSettings,
  localWorkspacePath: string,
  remoteWorkspacePath: string,
): ExecutionRemoteSyncPlan {
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
          ".eliza-agent",
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
          ".eliza-agent/remote-artifacts",
          ".eliza-agent/trajectories",
          ".eliza-agent/cron-output",
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
      "Eliza Agent persists remote lifecycle snapshots as metadata only.",
      "No remote file contents are copied into local state by the execution control plane.",
      `Artifact paths are tracked for operator visibility under ${workspaceLabel}.`,
    ],
    generatedAt: new Date().toISOString(),
  };
}

function buildCloudProfile(
  provider: "daytona" | "modal",
  settings: RuntimeSettings,
  workspacePath: string,
): ExecutionCloudProfile {
  const execution = settings.execution;
  const remoteWorkspacePath =
    provider === "daytona"
      ? execution.daytonaWorkspacePath || workspacePath
      : execution.modalWorkspacePath || workspacePath;
  const syncPlan = buildRemoteSyncPlan(
    provider,
    settings,
    workspacePath,
    remoteWorkspacePath,
  );
  return provider === "daytona"
    ? {
        provider,
        target: execution.daytonaTarget,
        shell: execution.daytonaShell || "/bin/sh",
        workspacePath: remoteWorkspacePath,
        state: "persistent-sandbox",
        commandStyle: "exec",
        envPassthrough: execution.dockerEnvPassthrough.filter(isValidEnvName),
        workspaceLabel: syncPlan.workspaceLabel,
        syncPlan,
        artifactPolicy: execution.remoteArtifactPolicy,
        artifactPaths: syncPlan.artifactPaths,
        snapshot: execution.daytonaSnapshot || undefined,
        bootstrapCommand: execution.daytonaBootstrapCommand || undefined,
        statusCommand: execution.daytonaStatusCommand || undefined,
        inspectCommand:
          execution.daytonaInspectCommand ||
          `daytona info ${execution.daytonaTarget || "TARGET"} --format json`,
      }
    : {
        provider,
        target: execution.modalTarget,
        shell: execution.modalShell || "/bin/bash",
        workspacePath: remoteWorkspacePath,
        state: "interactive-shell",
        commandStyle: "shell",
        envPassthrough: execution.dockerEnvPassthrough.filter(isValidEnvName),
        workspaceLabel: syncPlan.workspaceLabel,
        syncPlan,
        artifactPolicy: execution.remoteArtifactPolicy,
        artifactPaths: syncPlan.artifactPaths,
        environment: execution.modalEnvironment || undefined,
        bootstrapCommand: execution.modalBootstrapCommand || undefined,
        statusCommand: execution.modalStatusCommand || undefined,
        inspectCommand:
          execution.modalInspectCommand ||
          `modal shell ${execution.modalTarget || "REF"}${
            execution.modalEnvironment
              ? ` -e ${execution.modalEnvironment}`
              : ""
          } --cmd ${execution.modalShell || "/bin/bash"} -lc "pwd"`,
      };
}

function buildCloudRuntimeChecks(
  provider: "daytona" | "modal",
  settings: RuntimeSettings,
  workspaceDir: string,
  runtimeAvailable: boolean,
  targetReachable: boolean,
): DiagnosticCheck[] {
  const execution = settings.execution;
  const cloudProfile = buildCloudProfile(provider, settings, workspaceDir);
  const target =
    provider === "daytona" ? execution.daytonaTarget : execution.modalTarget;
  const shell =
    provider === "daytona" ? execution.daytonaShell : execution.modalShell;
  const bootstrap =
    provider === "daytona"
      ? execution.daytonaBootstrapCommand
      : execution.modalBootstrapCommand;
  const environment =
    provider === "daytona"
      ? execution.daytonaSnapshot
      : execution.modalEnvironment;
  const syncPlan = cloudProfile.syncPlan;
  const statusCommand =
    provider === "daytona"
      ? execution.daytonaStatusCommand
      : execution.modalStatusCommand;
  const inspectCommand =
    provider === "daytona"
      ? execution.daytonaInspectCommand
      : execution.modalInspectCommand;

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
      target ? "pass" : "fail",
      `${provider} target`,
      target
        ? `Execution target configured: ${target}.`
        : `${provider} target is not configured.`,
    ),
    createCheck(
      `${provider}.config.shell`,
      shell ? "pass" : "warn",
      `${provider} shell`,
      shell
        ? `Remote shell configured as ${shell}.`
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
      bootstrap ? "pass" : "warn",
      `${provider} bootstrap`,
      bootstrap
        ? `Bootstrap command configured: ${bootstrap}.`
        : `No bootstrap command configured; commands will execute directly.`,
    ),
    createCheck(
      `${provider}.config.status`,
      statusCommand ? "pass" : "warn",
      `${provider} status probe`,
      statusCommand
        ? `Status command configured: ${statusCommand}.`
        : `No explicit status command configured; ${provider === "daytona" ? "daytona info" : "modal shell"} will be used as the probe.`,
    ),
    createCheck(
      `${provider}.config.inspect`,
      inspectCommand ? "pass" : "warn",
      `${provider} inspect command`,
      inspectCommand
        ? `Inspect command configured: ${inspectCommand}.`
        : `No explicit inspect command configured; the backend will synthesize one against ${cloudProfile.workspacePath}.`,
    ),
    createCheck(
      `${provider}.config.environment`,
      provider === "daytona"
        ? environment
          ? "pass"
          : "warn"
        : environment
          ? "pass"
          : "warn",
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

function buildCloudRuntimePreviewChecks(
  provider: "daytona" | "modal",
  settings: RuntimeSettings,
  workspaceDir: string,
): DiagnosticCheck[] {
  const execution = settings.execution;
  const cloudProfile = buildCloudProfile(provider, settings, workspaceDir);
  return [
    createCheck(
      `${provider}.preview.generated`,
      "pass",
      `${provider} preview`,
      `${provider} will run as a ${cloudProfile.state} using ${provider === "daytona" ? execution.daytonaTarget : execution.modalTarget}.`,
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

function buildBootstrapHints(
  checks: DiagnosticCheck[],
  fallback: string[],
): string[] {
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

function buildSshChecks(
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

function _buildCliRemoteChecks(
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
      bootstrap: buildBootstrapHints(checks, [
        "No bootstrap required for local execution.",
      ]),
    };
  }

  async health(settings: RuntimeSettings): Promise<ExecutionBackendHealth> {
    const checks = [
      createCheck(
        "local.shell",
        "pass",
        "Local shell",
        "Local Bun shell execution is available.",
      ),
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
    return normalizeBackendError(
      await runCommand(["/bin/zsh", "-lc", command], options),
    );
  }
}

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
    options: { cwd: string; timeoutMs: number; settings: RuntimeSettings },
  ): Promise<TerminalRunResult> {
    return normalizeBackendError(
      await runCommand(
        buildContainerCommand("docker", command, options.cwd, options.settings),
        {
          timeoutMs: options.timeoutMs,
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
    options: { cwd: string; timeoutMs: number; settings: RuntimeSettings },
  ): Promise<TerminalRunResult> {
    return normalizeBackendError(
      await runCommand(
        buildContainerCommand("podman", command, options.cwd, options.settings),
        {
          timeoutMs: options.timeoutMs,
        },
      ),
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
        bootstrap: buildBootstrapHints(baseChecks, [
          "Install the ssh client and verify key/host access.",
        ]),
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
        bootstrap: buildBootstrapHints(baseChecks, [
          "Set ssh host, user, and remote path in runtime settings.",
        ]),
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
        bootstrap: buildBootstrapHints(baseChecks, [
          `Create or correct the SSH key path: ${execution.sshKeyPath}.`,
        ]),
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
      detail: ready
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
        stderr:
          "SSH backend requires execution.sshHost, execution.sshUser, and execution.sshPath.",
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
    const checks = buildSingularityChecks(
      options.settings,
      options.cwd,
      true,
      Boolean(options.settings.execution.singularityImage),
    );
    return {
      backend: this.name,
      mode: "container",
      engine: "singularity",
      ready: false,
      detail:
        "Singularity execution binds the workspace into a configured image for hermetic runs.",
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

  async health(
    settings: RuntimeSettings,
    workspaceDir: string,
  ): Promise<ExecutionBackendHealth> {
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
      await runCommand(
        buildSingularityCommand(command, options.cwd, options.settings),
        {
          timeoutMs: options.timeoutMs,
        },
      ),
    );
  }
}

function buildDaytonaExecArgs(
  settings: RuntimeSettings,
  command: string,
  cwd: string,
  timeoutMs: number,
): string[] {
  const execution = settings.execution;
  const binary = execution.daytonaCommand || "daytona";
  const shell = execution.daytonaShell || "/bin/sh";
  const workspacePath = execution.daytonaWorkspacePath || cwd || "/workspace";
  const script = buildCloudCommandScript(command, workspacePath, settings, {
    shell,
    bootstrapCommand: execution.daytonaBootstrapCommand || undefined,
  });
  const timeoutSeconds = Math.max(1, Math.ceil(timeoutMs / 1000));
  return [
    binary,
    "exec",
    execution.daytonaTarget || "TARGET",
    "--cwd",
    workspacePath,
    "--timeout",
    String(timeoutSeconds),
    "--",
    shell,
    "-lc",
    script,
  ];
}

function buildDaytonaInfoArgs(settings: RuntimeSettings): string[] {
  const execution = settings.execution;
  const binary = execution.daytonaCommand || "daytona";
  return [
    binary,
    "info",
    execution.daytonaTarget || "TARGET",
    "--format",
    "json",
  ];
}

function buildModalShellArgs(
  settings: RuntimeSettings,
  command: string,
  cwd: string,
): string[] {
  const execution = settings.execution;
  const binary = execution.modalCommand || "modal";
  const shell = execution.modalShell || "/bin/bash";
  const workspacePath = execution.modalWorkspacePath || cwd || "/workspace";
  const script = buildCloudCommandScript(command, workspacePath, settings, {
    shell,
    bootstrapCommand: execution.modalBootstrapCommand || undefined,
  });
  const args = [binary, "shell", execution.modalTarget || "REF"];
  if (execution.modalEnvironment) {
    args.push("-e", execution.modalEnvironment);
  }
  args.push("--cmd", `${shell} -lc ${shellQuote(script)}`);
  return args;
}

class DaytonaExecutionBackend implements ExecutionBackend {
  readonly name = "daytona" as const;

  constructor(private readonly cloudState: CloudStateAccessor) {}

  preview(
    command: string,
    options: { cwd: string; timeoutMs: number; settings: RuntimeSettings },
  ): ExecutionBackendPreview {
    const cloud = buildCloudProfile("daytona", options.settings, options.cwd);
    const cloudSession = this.cloudState.touch(cloud, {
      state: "idle",
      lastPreviewAt: new Date().toISOString(),
      lastCommand: sanitizeCommand(command),
    });
    const checks = buildCloudRuntimePreviewChecks(
      "daytona",
      options.settings,
      options.cwd,
    );
    const cloudSnapshot = this.cloudState.capture(cloud, {
      event: "preview",
      state: "planned",
      cwd: options.cwd,
      summary: `Daytona preview planned for ${cloud.target || "TARGET"} using ${cloud.workspaceLabel}.`,
      command: sanitizeCommand(command),
    });
    const refreshedSession = this.cloudState.get(cloud) ?? cloudSession;
    return {
      backend: this.name,
      mode: "remote",
      engine: this.name,
      cloud,
      cloudSession: refreshedSession,
      cloudSnapshot,
      cloudArtifacts: cloudSnapshot.artifacts,
      cloudSyncPlan: cloud.syncPlan,
      target: cloud.target,
      ready: Boolean(cloud.target && cloud.workspacePath),
      detail: `Daytona execution uses a persistent sandbox target (${cloud.target || "TARGET"}) with snapshot-aware workspace execution.`,
      cwd: options.cwd,
      timeoutMs: options.timeoutMs,
      command: sanitizeCommand(command),
      argv: buildDaytonaExecArgs(
        options.settings,
        command,
        options.cwd,
        options.timeoutMs,
      ),
      diagnostics: renderChecks(checks),
      checks,
      bootstrap: buildBootstrapHints(checks, [
        `Install the ${options.settings.execution.daytonaCommand || "daytona"} CLI and authenticate it locally.`,
        `Confirm access to the sandbox target ${cloud.target || "TARGET"}.`,
      ]),
    };
  }

  async health(
    settings: RuntimeSettings,
    workspaceDir: string,
  ): Promise<ExecutionBackendHealth> {
    const probeTimeoutMs = settings.execution.healthTimeoutMs ?? 5_000;
    const binary = settings.execution.daytonaCommand || "daytona";
    const runtimeAvailable = await commandExists(binary, probeTimeoutMs);
    const cloud = buildCloudProfile("daytona", settings, workspaceDir);
    const cloudSession = this.cloudState.touch(cloud, {
      state: runtimeAvailable && Boolean(cloud.target) ? "ready" : "failed",
      lastHealthAt: new Date().toISOString(),
    });
    if (!runtimeAvailable) {
      const failedChecks = buildCloudRuntimeChecks(
        "daytona",
        settings,
        workspaceDir,
        false,
        false,
      );
      const cloudSnapshot = this.cloudState.capture(cloud, {
        event: "health",
        state: "failed",
        cwd: workspaceDir,
        summary: `Daytona CLI ${binary} is not available for ${cloud.workspaceLabel}.`,
        commandId: binary,
        command: binary,
        lastExitCode: 1,
        lastStderr: `${binary} command is not available.`,
      });
      const refreshedSession = this.cloudState.get(cloud) ?? cloudSession;
      return {
        backend: this.name,
        mode: "remote",
        engine: this.name,
        cloud,
        cloudSession: refreshedSession,
        cloudSnapshot,
        cloudArtifacts: cloudSnapshot.artifacts,
        cloudSyncPlan: cloud.syncPlan,
        target: cloud.target,
        ready: false,
        detail: `${binary} command is not available.`,
        limits: buildHealthLimits(settings),
        diagnostics: renderChecks(failedChecks),
        checks: failedChecks,
        bootstrap: buildBootstrapHints(failedChecks, [
          `Install the ${binary} CLI and authenticate it locally.`,
          "Use daytona info to confirm the sandbox target is reachable.",
        ]),
      };
    }

    const infoCommand = settings.execution.daytonaStatusCommand
      ? buildDaytonaExecArgs(
          settings,
          settings.execution.daytonaStatusCommand,
          workspaceDir,
          probeTimeoutMs,
        )
      : buildDaytonaInfoArgs(settings);
    const info = await runCommand(infoCommand, {
      timeoutMs: probeTimeoutMs,
    }).catch(() => ({
      exitCode: 1,
      stdout: "",
      stderr: "Daytona info probe failed.",
      timedOut: false,
      durationMs: 0,
    }));
    const execProbe = await runCommand(
      buildDaytonaExecArgs(
        settings,
        "printf eliza-daytona-ok",
        workspaceDir,
        probeTimeoutMs,
      ),
      { timeoutMs: probeTimeoutMs },
    ).catch(() => ({
      exitCode: 1,
      stdout: "",
      stderr: "Daytona sandbox probe failed.",
      timedOut: false,
      durationMs: 0,
    }));
    const infoOk = info.exitCode === 0;
    const execOk = execProbe.exitCode === 0;
    const checks = buildCloudRuntimeChecks(
      "daytona",
      settings,
      workspaceDir,
      runtimeAvailable,
      infoOk && execOk,
    );
    const cloudSnapshot = this.cloudState.capture(cloud, {
      event: "health",
      state: runtimeAvailable && infoOk && execOk ? "ready" : "failed",
      cwd: workspaceDir,
      summary:
        runtimeAvailable && infoOk && execOk
          ? `Daytona health probe succeeded for ${cloud.target || "TARGET"} (${cloud.workspaceLabel}).`
          : `Daytona health probe failed for ${cloud.target || "TARGET"} (${cloud.workspaceLabel}).`,
      commandId: infoCommand.join(" "),
      command: infoCommand.join(" "),
      lastExitCode: infoOk && execOk ? 0 : 1,
      lastStdout: `${info.stdout || ""}\n${execProbe.stdout || ""}`.trim(),
      lastStderr: `${info.stderr || ""}\n${execProbe.stderr || ""}`.trim(),
    });
    const refreshedSession = this.cloudState.get(cloud) ?? cloudSession;
    let infoSummary = "available";
    if (info.stdout) {
      try {
        const parsed = JSON.parse(info.stdout) as Record<string, unknown>;
        infoSummary =
          typeof parsed.name === "string"
            ? parsed.name
            : typeof parsed.id === "string"
              ? parsed.id
              : typeof parsed.status === "string"
                ? parsed.status
                : infoSummary;
      } catch {
        infoSummary = "available";
      }
    }
    return {
      backend: this.name,
      mode: "remote",
      engine: this.name,
      cloud,
      cloudSession: refreshedSession,
      cloudSnapshot,
      cloudArtifacts: cloudSnapshot.artifacts,
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

  async run(
    command: string,
    options: { cwd: string; timeoutMs: number; settings: RuntimeSettings },
  ): Promise<TerminalRunResult> {
    const cloud = buildCloudProfile("daytona", options.settings, options.cwd);
    const safeCommand = sanitizeCommand(command);
    if (!cloud.target) {
      return {
        exitCode: 1,
        stdout: "",
        stderr: "Daytona backend requires execution.daytonaTarget.",
        timedOut: false,
        durationMs: 0,
      };
    }
    const cloudSession = this.cloudState.touch(cloud, {
      state: "running",
      lastRunAt: new Date().toISOString(),
      lastCommand: safeCommand,
    });
    const result = normalizeBackendError(
      await runCommand(
        buildDaytonaExecArgs(
          options.settings,
          safeCommand,
          options.cwd,
          options.timeoutMs,
        ),
        {
          timeoutMs: options.timeoutMs,
        },
      ),
    );
    const cloudSnapshot = this.cloudState.capture(cloud, {
      event: "run",
      state: result.exitCode === 0 ? "ready" : "failed",
      cwd: options.cwd,
      summary:
        result.exitCode === 0
          ? `Daytona command completed successfully for ${cloud.workspaceLabel}.`
          : `Daytona command failed for ${cloud.workspaceLabel} with exit code ${result.exitCode}.`,
      command: safeCommand,
      commandId: cloudSession.lastCommandId,
      lastExitCode: result.exitCode,
      lastStdout: result.stdout,
      lastStderr: result.stderr,
    });
    this.cloudState.touch(cloud, {
      state: result.exitCode === 0 ? "ready" : "failed",
      lastRunAt: new Date().toISOString(),
      lastCommandId: cloudSession.lastCommandId,
      lastCommand: safeCommand,
      lastExitCode: result.exitCode,
      lastStdout: result.stdout,
      lastStderr: result.stderr,
    });
    void cloudSnapshot;
    return result;
  }
}

class ModalExecutionBackend implements ExecutionBackend {
  readonly name = "modal" as const;

  constructor(private readonly cloudState: CloudStateAccessor) {}

  preview(
    command: string,
    options: { cwd: string; timeoutMs: number; settings: RuntimeSettings },
  ): ExecutionBackendPreview {
    const cloud = buildCloudProfile("modal", options.settings, options.cwd);
    const cloudSession = this.cloudState.touch(cloud, {
      state: "idle",
      lastPreviewAt: new Date().toISOString(),
      lastCommand: sanitizeCommand(command),
    });
    const checks = buildCloudRuntimePreviewChecks(
      "modal",
      options.settings,
      options.cwd,
    );
    const cloudSnapshot = this.cloudState.capture(cloud, {
      event: "preview",
      state: "planned",
      cwd: options.cwd,
      summary: `Modal preview planned for ${cloud.target || "REF"} using ${cloud.workspaceLabel}.`,
      command: sanitizeCommand(command),
    });
    const refreshedSession = this.cloudState.get(cloud) ?? cloudSession;
    return {
      backend: this.name,
      mode: "remote",
      engine: this.name,
      cloud,
      cloudSession: refreshedSession,
      cloudSnapshot,
      cloudArtifacts: cloudSnapshot.artifacts,
      cloudSyncPlan: cloud.syncPlan,
      target: cloud.target,
      ready: Boolean(cloud.target && cloud.workspacePath),
      detail: `Modal execution uses a shell session against target ${cloud.target || "REF"} with explicit environment selection${cloud.environment ? ` (${cloud.environment})` : ""}.`,
      cwd: options.cwd,
      timeoutMs: options.timeoutMs,
      command: sanitizeCommand(command),
      argv: buildModalShellArgs(
        options.settings,
        sanitizeCommand(command),
        options.cwd,
      ),
      diagnostics: renderChecks(checks),
      checks,
      bootstrap: buildBootstrapHints(checks, [
        `Install the ${options.settings.execution.modalCommand || "modal"} CLI and authenticate it locally.`,
        cloud.environment
          ? `Confirm Modal environment ${cloud.environment} is available for shell sessions.`
          : "Set a Modal environment if your workspace has multiple environments.",
      ]),
    };
  }

  async health(
    settings: RuntimeSettings,
    workspaceDir: string,
  ): Promise<ExecutionBackendHealth> {
    const probeTimeoutMs = settings.execution.healthTimeoutMs ?? 5_000;
    const binary = settings.execution.modalCommand || "modal";
    const runtimeAvailable = await commandExists(binary, probeTimeoutMs);
    const cloud = buildCloudProfile("modal", settings, workspaceDir);
    const cloudSession = this.cloudState.touch(cloud, {
      state: runtimeAvailable && Boolean(cloud.target) ? "ready" : "failed",
      lastHealthAt: new Date().toISOString(),
    });
    if (!runtimeAvailable) {
      const failedChecks = buildCloudRuntimeChecks(
        "modal",
        settings,
        workspaceDir,
        false,
        false,
      );
      const cloudSnapshot = this.cloudState.capture(cloud, {
        event: "health",
        state: "failed",
        cwd: workspaceDir,
        summary: `Modal CLI ${binary} is not available for ${cloud.workspaceLabel}.`,
        commandId: binary,
        command: binary,
        lastExitCode: 1,
        lastStderr: `${binary} command is not available.`,
      });
      const refreshedSession = this.cloudState.get(cloud) ?? cloudSession;
      return {
        backend: this.name,
        mode: "remote",
        engine: this.name,
        cloud,
        cloudSession: refreshedSession,
        cloudSnapshot,
        cloudArtifacts: cloudSnapshot.artifacts,
        cloudSyncPlan: cloud.syncPlan,
        target: cloud.target,
        ready: false,
        detail: `${binary} command is not available.`,
        limits: buildHealthLimits(settings),
        diagnostics: renderChecks(failedChecks),
        checks: failedChecks,
        bootstrap: buildBootstrapHints(failedChecks, [
          `Install the ${binary} CLI and authenticate it locally.`,
          "Use modal shell to confirm the target is reachable.",
        ]),
      };
    }

    const shellProbeCommand = settings.execution.modalStatusCommand
      ? buildModalShellArgs(
          settings,
          settings.execution.modalStatusCommand,
          workspaceDir,
        )
      : buildModalShellArgs(settings, "printf eliza-modal-ok", workspaceDir);
    const shellProbe = await runCommand(shellProbeCommand, {
      timeoutMs: probeTimeoutMs,
    }).catch(() => ({
      exitCode: 1,
      stdout: "",
      stderr: "Modal shell probe failed.",
      timedOut: false,
      durationMs: 0,
    }));
    const shellOk = shellProbe.exitCode === 0;
    const checks = buildCloudRuntimeChecks(
      "modal",
      settings,
      workspaceDir,
      runtimeAvailable,
      shellOk,
    );
    const cloudSnapshot = this.cloudState.capture(cloud, {
      event: "health",
      state: runtimeAvailable && shellOk ? "ready" : "failed",
      cwd: workspaceDir,
      summary:
        runtimeAvailable && shellOk
          ? `Modal health probe succeeded for ${cloud.target || "REF"} (${cloud.workspaceLabel}).`
          : `Modal health probe failed for ${cloud.target || "REF"} (${cloud.workspaceLabel}).`,
      commandId: shellProbeCommand.join(" "),
      command: shellProbeCommand.join(" "),
      lastExitCode: shellOk ? 0 : 1,
      lastStdout: shellProbe.stdout,
      lastStderr: shellProbe.stderr,
    });
    const refreshedSession = this.cloudState.get(cloud) ?? cloudSession;
    return {
      backend: this.name,
      mode: "remote",
      engine: this.name,
      cloud,
      cloudSession: refreshedSession,
      cloudSnapshot,
      cloudArtifacts: cloudSnapshot.artifacts,
      cloudSyncPlan: cloud.syncPlan,
      target: cloud.target,
      ready: runtimeAvailable && shellOk,
      detail:
        runtimeAvailable && shellOk
          ? `Modal ready for target ${cloud.target} using ${cloud.shell} and environment ${cloud.environment || "default profile"}.`
          : shellProbe.stderr || "Modal shell probe failed.",
      limits: buildHealthLimits(settings),
      diagnostics: renderChecks(checks),
      checks,
      bootstrap: buildBootstrapHints(checks, [
        `Use modal shell ${cloud.target || "REF"} --cmd ${cloud.shell} to verify the remote shell.`,
        cloud.environment
          ? `Bind the shell to Modal environment ${cloud.environment}.`
          : "Set a Modal environment if the workspace has multiple environments.",
      ]),
    };
  }

  async run(
    command: string,
    options: { cwd: string; timeoutMs: number; settings: RuntimeSettings },
  ): Promise<TerminalRunResult> {
    const cloud = buildCloudProfile("modal", options.settings, options.cwd);
    const safeCommand = sanitizeCommand(command);
    if (!cloud.target) {
      return {
        exitCode: 1,
        stdout: "",
        stderr: "Modal backend requires execution.modalTarget.",
        timedOut: false,
        durationMs: 0,
      };
    }
    const cloudSession = this.cloudState.touch(cloud, {
      state: "running",
      lastRunAt: new Date().toISOString(),
      lastCommand: safeCommand,
    });
    const result = normalizeBackendError(
      await runCommand(
        buildModalShellArgs(options.settings, safeCommand, options.cwd),
        {
          timeoutMs: options.timeoutMs,
        },
      ),
    );
    const cloudSnapshot = this.cloudState.capture(cloud, {
      event: "run",
      state: result.exitCode === 0 ? "ready" : "failed",
      cwd: options.cwd,
      summary:
        result.exitCode === 0
          ? `Modal command completed successfully for ${cloud.workspaceLabel}.`
          : `Modal command failed for ${cloud.workspaceLabel} with exit code ${result.exitCode}.`,
      command: safeCommand,
      commandId: cloudSession.lastCommandId,
      lastExitCode: result.exitCode,
      lastStdout: result.stdout,
      lastStderr: result.stderr,
    });
    this.cloudState.touch(cloud, {
      state: result.exitCode === 0 ? "ready" : "failed",
      lastRunAt: new Date().toISOString(),
      lastCommandId: cloudSession.lastCommandId,
      lastCommand: safeCommand,
      lastExitCode: result.exitCode,
      lastStdout: result.stdout,
      lastStderr: result.stderr,
    });
    void cloudSnapshot;
    return result;
  }
}

export class TerminalService {
  private readonly events = new EventEmitter();
  private readonly filePath: string;
  private readonly cloudState: CloudStoreManager;
  private readonly backends: Map<ExecutionBackendName, ExecutionBackend>;
  private healthCache?: {
    capturedAt: number;
    value: ExecutionBackendHealth[];
  };

  constructor(
    baseDir: string,
    private readonly workspaceDir: string,
    private readonly getSettings: () => RuntimeSettings,
  ) {
    mkdirSync(baseDir, { recursive: true });
    this.filePath = join(baseDir, "terminal-history.json");
    this.cloudState = new CloudStoreManager(
      join(baseDir, "cloud-sessions.json"),
    );
    this.backends = new Map<ExecutionBackendName, ExecutionBackend>([
      ["local", new LocalExecutionBackend()],
      ["docker", new DockerExecutionBackend()],
      ["podman", new PodmanExecutionBackend()],
      ["ssh", new SshExecutionBackend()],
      ["singularity", new SingularityExecutionBackend()],
      ["daytona", new DaytonaExecutionBackend(this.cloudState)],
      ["modal", new ModalExecutionBackend(this.cloudState)],
    ]);
    if (!existsSync(this.filePath)) {
      this.write({ commands: [] });
    }
  }

  async run(
    command: string,
    timeoutMs?: number,
  ): Promise<TerminalCommandRecord> {
    this.healthCache = undefined;
    const settings = this.getSettings();
    const backendName = settings.execution.backend as ExecutionBackendName;
    const backend =
      this.backends.get(backendName) ?? this.backends.get("local");
    if (!backend) {
      throw new Error("No execution backend is available.");
    }
    const safeCommand = sanitizeCommand(command);
    const effectiveTimeoutMs =
      timeoutMs ?? settings.execution.commandTimeoutMs ?? 30_000;
    const preview = backend.preview(safeCommand, {
      cwd: this.workspaceDir,
      timeoutMs: effectiveTimeoutMs,
      settings,
    });

    const startedAt = new Date().toISOString();
    const result = await backend.run(safeCommand, {
      cwd: this.workspaceDir,
      timeoutMs: effectiveTimeoutMs,
      settings,
    });
    const latestCloudSnapshot = preview.cloud
      ? (this.cloudState.latestSnapshot(preview.cloud) ?? preview.cloudSnapshot)
      : preview.cloudSnapshot;
    const latestCloudSession = preview.cloud
      ? (this.cloudState.get(preview.cloud) ?? preview.cloudSession)
      : preview.cloudSession;

    const record: TerminalCommandRecord = {
      id: randomUUID(),
      command: safeCommand,
      backend: backend.name,
      backendMode: preview.mode,
      backendEngine: preview.engine,
      cloud: preview.cloud,
      cloudSession: latestCloudSession,
      cloudSnapshot: latestCloudSnapshot,
      cloudArtifacts: latestCloudSnapshot?.artifacts ?? preview.cloudArtifacts,
      cloudSyncPlan: preview.cloudSyncPlan,
      executionTarget: preview.target ?? preview.cloud?.target,
      executionSessionId: preview.cloudSession?.sessionId,
      executionProfile: preview.cloud,
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
    if (record.cloud?.provider && record.cloudSession) {
      this.cloudState.touch(record.cloud, {
        state: record.exitCode === 0 ? "ready" : "failed",
        lastCommandId: record.id,
        lastRunAt: record.completedAt,
        lastCommand: record.command,
        lastExitCode: record.exitCode,
        lastStdout: record.stdout,
        lastStderr: record.stderr,
        lastSnapshotId: latestCloudSnapshot?.snapshotId,
        lastSnapshotAt: latestCloudSnapshot?.createdAt,
        lastSnapshotSummary: latestCloudSnapshot?.summary,
      });
    }

    const store = this.read();
    store.commands.push(record);
    if (store.commands.length > 100) {
      store.commands = store.commands.slice(-100);
    }
    this.write(store);
    this.events.emit("update", {
      kind: "command",
      commandId: record.id,
      backend: record.backend,
      exitCode: record.exitCode,
      detail: `${record.backend} ${record.command.slice(0, 120)}`,
    });
    return record;
  }

  async runStreamingLocal(
    command: string,
    callbacks?: {
      onStdout?: (chunk: string) => void;
      onStderr?: (chunk: string) => void;
    },
    timeoutMs?: number,
  ): Promise<TerminalCommandRecord> {
    this.healthCache = undefined;
    const settings = this.getSettings();
    const backendName = settings.execution.backend as ExecutionBackendName;
    if (backendName !== "local") {
      return this.run(command, timeoutMs);
    }

    const safeCommand = sanitizeCommand(command);
    const effectiveTimeoutMs =
      timeoutMs ?? settings.execution.commandTimeoutMs ?? 30_000;
    const backend = this.backends.get("local");
    if (!backend) {
      throw new Error("No local execution backend is available.");
    }
    const preview = backend.preview(safeCommand, {
      cwd: this.workspaceDir,
      timeoutMs: effectiveTimeoutMs,
      settings,
    });
    const startedAt = new Date().toISOString();
    const result = normalizeBackendError(
      await runCommandStreaming(["/bin/zsh", "-lc", safeCommand], {
        cwd: this.workspaceDir,
        timeoutMs: effectiveTimeoutMs,
        onStdout: callbacks?.onStdout,
        onStderr: callbacks?.onStderr,
      }),
    );

    const record: TerminalCommandRecord = {
      id: randomUUID(),
      command: safeCommand,
      backend: "local",
      backendMode: preview.mode,
      backendEngine: preview.engine,
      cloud: preview.cloud,
      cloudSession: preview.cloudSession,
      cloudSnapshot: preview.cloudSnapshot,
      cloudArtifacts: preview.cloudArtifacts,
      cloudSyncPlan: preview.cloudSyncPlan,
      executionTarget: preview.target ?? preview.cloud?.target,
      executionSessionId: preview.cloudSession?.sessionId,
      executionProfile: preview.cloud,
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
    this.events.emit("update", {
      kind: "command",
      commandId: record.id,
      backend: record.backend,
      exitCode: record.exitCode,
      detail: `${record.backend} ${record.command.slice(0, 120)}`,
    });
    return record;
  }

  onUpdate(
    listener: (event: {
      kind: "command";
      commandId: string;
      backend: ExecutionBackendName;
      exitCode: number;
      detail: string;
    }) => void,
  ): () => void {
    this.events.on("update", listener);
    return () => {
      this.events.off("update", listener);
    };
  }

  async health(): Promise<ExecutionBackendHealth[]> {
    const now = Date.now();
    if (this.healthCache && now - this.healthCache.capturedAt < 20_000) {
      return this.healthCache.value;
    }
    const settings = this.getSettings();
    const value = await Promise.all(
      Array.from(this.backends.values()).map((backend) =>
        backend.health(settings, this.workspaceDir),
      ),
    );
    this.healthCache = {
      capturedAt: now,
      value,
    };
    return value;
  }

  preview(command: string, timeoutMs?: number): ExecutionBackendPreview {
    const settings = this.getSettings();
    const backendName = settings.execution.backend as ExecutionBackendName;
    const backend =
      this.backends.get(backendName) ?? this.backends.get("local");
    if (!backend) {
      throw new Error("No execution backend is available.");
    }

    return backend.preview(sanitizeCommand(command), {
      cwd: this.workspaceDir,
      timeoutMs: timeoutMs ?? settings.execution.commandTimeoutMs ?? 30_000,
      settings,
    });
  }

  recent(limit = 10): TerminalCommandRecord[] {
    return this.read().commands.slice(-limit).reverse();
  }

  getHistory(limit = 10): TerminalCommandRecord[] {
    return this.recent(limit);
  }

  async status(): Promise<{
    configured: ExecutionBackendName;
    preview: ExecutionBackendPreview;
    health: ExecutionBackendHealth[];
  }> {
    const settings = this.getSettings();
    return {
      configured: settings.execution.backend as ExecutionBackendName,
      preview: this.preview("printf 'eliza-agent-status'"),
      health: await this.health(),
    };
  }

  cloudSnapshots(limit = 10): ExecutionCloudSnapshotRecord[] {
    return this.cloudState.listSnapshots(limit);
  }

  cloudArtifacts(limit = 10): ExecutionCloudArtifactRecord[] {
    return this.cloudState.listArtifacts(limit);
  }

  private read(): TerminalStore {
    return JSON.parse(readFileSync(this.filePath, "utf8")) as TerminalStore;
  }

  private write(store: TerminalStore): void {
    writeFileSync(this.filePath, JSON.stringify(store, null, 2), "utf8");
  }
}
