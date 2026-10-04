import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as processExecution from "@/services/process-execution";
import type {
  ExecutionBackendName,
  ExecutionBackendPreview,
} from "@/types/execution";
import type { RuntimeSettings } from "../../settings/runtime-settings";
import type { ExecutionBackend } from "../contracts/backend";
import { localShellInvocation } from "../execution/subprocess";
import { TerminalCommandHistoryStore } from "../records/history";
import {
  TerminalCancellationUnavailableError,
  type TerminalCommandUpdateEvent,
  TerminalServiceCommandOrchestrator,
} from "./orchestrator";

function makeSettings(): RuntimeSettings {
  return {
    model: {
      provider: "offline",
      model: "local",
      baseUrl: "http://localhost",
      temperature: 0.2,
      maxTokens: 400,
    },
    gateway: {
      sessionTimeoutMinutes: 120,
      mirrorResponsesToHistory: true,
    },
    execution: {
      backend: "local",
      remoteSyncMode: "mirror",
      remoteSyncInclude: ["packages/agent/src/**", "packages/skills/src/**"],
      remoteSyncExclude: [".git", ".doolittle", "node_modules"],
      remoteArtifactPaths: [".doolittle/remote-artifacts"],
      remoteArtifactPolicy: "metadata-only",
      remoteWorkspaceLabel: "doolittle-workspace",
      dockerImage: "ghcr.io/nubjs/nub:latest",
      dockerNetwork: "host",
      dockerWorkspacePath: "/workspace",
      dockerEnvPassthrough: ["PATH", "HOME"],
      singularityImage: "",
      daytonaTarget: "",
      daytonaCommand: "daytona",
      daytonaShell: "/bin/sh",
      daytonaWorkspacePath: "/workspace",
      daytonaSnapshot: "",
      daytonaBootstrapCommand: "",
      daytonaStatusCommand: "",
      daytonaInspectCommand: "",
      modalTarget: "",
      modalCommand: "modal",
      modalShell: "/bin/bash",
      modalWorkspacePath: "/workspace",
      modalEnvironment: "",
      modalBootstrapCommand: "",
      modalStatusCommand: "",
      modalInspectCommand: "",
      commandTimeoutMs: 30_000,
      healthTimeoutMs: 5_000,
      containerCpuLimit: "2",
      containerMemoryLimit: "2g",
      containerPidsLimit: 256,
      containerReadOnlyRoot: true,
      sshHost: "",
      sshUser: "",
      sshPath: "",
      sshPort: 22,
      sshKeyPath: "",
      sshStrictHostKeyChecking: false,
    },
    mcp: {
      servers: {},
      maxRetries: 2,
    },
    agent: {
      runDepth: "standard",
      maxIterations: 45,
      toolProgressMode: "new",
    },
    ui: {
      theme: "orange",
    },
  };
}

function createPreview(
  backend: ExecutionBackendName,
  mode: "local" | "container" | "remote",
  command: string,
  cwd: string,
  timeoutMs: number,
  engine?: "docker" | "podman" | "ssh" | "singularity",
): ExecutionBackendPreview {
  return {
    backend,
    mode,
    engine,
    ready: true,
    detail: `${backend} preview`,
    cwd,
    timeoutMs,
    command,
    argv: ["sh", "-lc", command],
    diagnostics: [],
    checks: [],
    bootstrap: [],
  };
}

function createFakeBackend(input: {
  name: ExecutionBackendName;
  mode: "local" | "container" | "remote";
  engine?: "docker" | "podman" | "ssh" | "singularity";
  onRun?: (command: string) => void;
  stdout?: string;
}): ExecutionBackend {
  return {
    name: input.name,
    preview(command, options) {
      return createPreview(
        input.name,
        input.mode,
        command,
        options.cwd,
        options.timeoutMs,
        input.engine,
      );
    },
    async health(settings) {
      return {
        backend: input.name,
        mode: input.mode,
        engine: input.engine,
        ready: true,
        detail: `${input.name} ready`,
        limits: {
          commandTimeoutMs: settings.execution.commandTimeoutMs ?? 30_000,
          healthTimeoutMs: settings.execution.healthTimeoutMs ?? 5_000,
          containerCpuLimit: settings.execution.containerCpuLimit ?? "2",
          containerMemoryLimit: settings.execution.containerMemoryLimit ?? "2g",
          containerPidsLimit: settings.execution.containerPidsLimit ?? 256,
          containerReadOnlyRoot:
            settings.execution.containerReadOnlyRoot ?? true,
        },
        diagnostics: [],
        checks: [],
        bootstrap: [],
      };
    },
    async run(command) {
      input.onRun?.(command);
      return {
        exitCode: 0,
        stdout: input.stdout ?? `${input.name}: ${command}`,
        stderr: "",
        timedOut: false,
        durationMs: 1,
      };
    },
  };
}

describe("command orchestrator", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });
  it.each([
    { mode: "local-safe", name: "local" },
    { mode: "cloud", name: "local" },
    { mode: "local-yolo", name: "docker" },
    { mode: "local-yolo", name: "ssh" },
  ] as const)(
    "refuses owned cancellation before preview/run for $mode/$name without changing public behavior",
    async ({ mode, name }) => {
      vi.stubEnv("ELIZA_RUNTIME_MODE", mode);
      const baseDir = mkdtempSync(
        join(tmpdir(), "doolittle-cancellation-capability-"),
      );
      const settings = makeSettings();
      settings.execution.backend = name;
      const backend = createFakeBackend({
        name,
        mode:
          name === "local"
            ? "local"
            : name === "docker"
              ? "container"
              : "remote",
      });
      const preview = vi.spyOn(backend, "preview");
      const run = vi.spyOn(backend, "run");
      const orchestrator = new TerminalServiceCommandOrchestrator({
        getWorkspaceDir: () => baseDir,
        getSettings: () => settings,
        backends: new Map([[name, backend]]),
        historyStore: new TerminalCommandHistoryStore(
          join(baseDir, "terminal-history.json"),
        ),
      });
      try {
        await expect(
          orchestrator.run("probe", 1000, new AbortController().signal, {
            requireCancellation: true,
          }),
        ).rejects.toBeInstanceOf(TerminalCancellationUnavailableError);
        expect(preview).not.toHaveBeenCalled();
        expect(run).not.toHaveBeenCalled();
        expect(process.env.ELIZA_RUNTIME_MODE === mode).toBe(true);
        await orchestrator.run("probe", 1000);
        expect(run).toHaveBeenCalledOnce();
      } finally {
        rmSync(baseDir, { recursive: true, force: true });
      }
    },
  );
  it("rechecks mutable SDK policy after preview before any backend work", async () => {
    vi.stubEnv("ELIZA_RUNTIME_MODE", "local-yolo");
    const baseDir = mkdtempSync(
      join(tmpdir(), "doolittle-cancellation-policy-"),
    );
    const backend = createFakeBackend({ name: "local", mode: "local" });
    const originalPreview = backend.preview.bind(backend);
    vi.spyOn(backend, "preview").mockImplementation((command, options) => {
      process.env.ELIZA_RUNTIME_MODE = "local-safe";
      return originalPreview(command, options);
    });
    const run = vi.spyOn(backend, "run");
    const orchestrator = new TerminalServiceCommandOrchestrator({
      getWorkspaceDir: () => baseDir,
      getSettings: makeSettings,
      backends: new Map([["local", backend]]),
      historyStore: new TerminalCommandHistoryStore(
        join(baseDir, "terminal-history.json"),
      ),
    });
    try {
      await expect(
        orchestrator.run("probe", 1000, new AbortController().signal, {
          requireCancellation: true,
        }),
      ).rejects.toBeInstanceOf(TerminalCancellationUnavailableError);
      expect(run).not.toHaveBeenCalled();
    } finally {
      rmSync(baseDir, { recursive: true, force: true });
    }
  });
  it.each(["docker", "unknown-backend"])(
    "does not admit configured %s through the existing public local fallback",
    async (configured) => {
      vi.stubEnv("ELIZA_RUNTIME_MODE", "local-yolo");
      const baseDir = mkdtempSync(
        join(tmpdir(), "doolittle-cancellation-fallback-"),
      );
      const settings = makeSettings();
      settings.execution.backend =
        configured as RuntimeSettings["execution"]["backend"];
      const backend = createFakeBackend({ name: "local", mode: "local" });
      const preview = vi.spyOn(backend, "preview");
      const run = vi.spyOn(backend, "run");
      const orchestrator = new TerminalServiceCommandOrchestrator({
        getWorkspaceDir: () => baseDir,
        getSettings: () => settings,
        backends: new Map([["local", backend]]),
        historyStore: new TerminalCommandHistoryStore(
          join(baseDir, "terminal-history.json"),
        ),
      });
      try {
        await expect(
          orchestrator.run("probe", 1000, new AbortController().signal, {
            requireCancellation: true,
          }),
        ).rejects.toBeInstanceOf(TerminalCancellationUnavailableError);
        expect(preview).not.toHaveBeenCalled();
        expect(run).not.toHaveBeenCalled();
        await orchestrator.run("probe", 1000);
        expect(run).toHaveBeenCalledOnce();
      } finally {
        rmSync(baseDir, { recursive: true, force: true });
      }
    },
  );
  it("rechecks configured backend mutations after preview", async () => {
    vi.stubEnv("ELIZA_RUNTIME_MODE", "local-yolo");
    const baseDir = mkdtempSync(
      join(tmpdir(), "doolittle-cancellation-settings-"),
    );
    const settings = makeSettings();
    const backend = createFakeBackend({ name: "local", mode: "local" });
    const originalPreview = backend.preview.bind(backend);
    vi.spyOn(backend, "preview").mockImplementation((command, options) => {
      settings.execution.backend = "docker";
      return originalPreview(command, options);
    });
    const run = vi.spyOn(backend, "run");
    const orchestrator = new TerminalServiceCommandOrchestrator({
      getWorkspaceDir: () => baseDir,
      getSettings: () => settings,
      backends: new Map([["local", backend]]),
      historyStore: new TerminalCommandHistoryStore(
        join(baseDir, "terminal-history.json"),
      ),
    });
    try {
      await expect(
        orchestrator.run("probe", 1000, new AbortController().signal, {
          requireCancellation: true,
        }),
      ).rejects.toBeInstanceOf(TerminalCancellationUnavailableError);
      expect(run).not.toHaveBeenCalled();
    } finally {
      rmSync(baseDir, { recursive: true, force: true });
    }
  });
  it("permits the explicitly abortable local-yolo capability with the supplied signal", async () => {
    vi.stubEnv("ELIZA_RUNTIME_MODE", "local-yolo");
    const baseDir = mkdtempSync(
      join(tmpdir(), "doolittle-cancellation-local-"),
    );
    const backend = createFakeBackend({ name: "local", mode: "local" });
    const run = vi.spyOn(backend, "run");
    const controller = new AbortController();
    const orchestrator = new TerminalServiceCommandOrchestrator({
      getWorkspaceDir: () => baseDir,
      getSettings: makeSettings,
      backends: new Map([["local", backend]]),
      historyStore: new TerminalCommandHistoryStore(
        join(baseDir, "terminal-history.json"),
      ),
    });
    try {
      await orchestrator.run("probe", 1000, controller.signal, {
        requireCancellation: true,
      });
      expect(run).toHaveBeenCalledWith(
        "probe",
        expect.objectContaining({ abortSignal: controller.signal }),
      );
    } finally {
      rmSync(baseDir, { recursive: true, force: true });
    }
  });
  it("resolves the workspace each time a command is prepared", () => {
    const first = mkdtempSync(
      join(tmpdir(), "doolittle-terminal-orchestrator-first-"),
    );
    const second = mkdtempSync(
      join(tmpdir(), "doolittle-terminal-orchestrator-second-"),
    );
    let workspaceDir = first;
    const orchestrator = new TerminalServiceCommandOrchestrator({
      getWorkspaceDir: () => workspaceDir,
      getSettings: makeSettings,
      backends: new Map([
        ["local", createFakeBackend({ name: "local", mode: "local" })],
      ]),
      historyStore: new TerminalCommandHistoryStore(
        join(first, "terminal-history.json"),
      ),
    });

    try {
      expect(orchestrator.preview("pwd").cwd).toBe(first);
      workspaceDir = second;
      expect(orchestrator.preview("pwd").cwd).toBe(second);
    } finally {
      rmSync(first, { recursive: true, force: true });
      rmSync(second, { recursive: true, force: true });
    }
  });

  it("falls back to the local backend when previewing an unavailable backend", () => {
    const root = mkdtempSync(
      join(tmpdir(), "doolittle-terminal-orchestrator-preview-"),
    );
    const historyStore = new TerminalCommandHistoryStore(
      join(root, "terminal-history.json"),
    );
    const settings = makeSettings();
    settings.execution.backend = "docker";
    const orchestrator = new TerminalServiceCommandOrchestrator({
      workspaceDir: root,
      getSettings: () => settings,
      backends: new Map([
        ["local", createFakeBackend({ name: "local", mode: "local" })],
      ]),
      historyStore,
    });

    try {
      const preview = orchestrator.preview("printf 'fallback'");

      expect(preview.backend).toBe("local");
      expect(preview.command).toBe("printf 'fallback'");
      expect(preview.timeoutMs).toBe(
        settings.execution.commandTimeoutMs ?? 30_000,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("runs through the configured backend, persists history, and emits updates", async () => {
    const root = mkdtempSync(
      join(tmpdir(), "doolittle-terminal-orchestrator-"),
    );
    const historyStore = new TerminalCommandHistoryStore(
      join(root, "terminal-history.json"),
    );
    const dockerRuns: string[] = [];
    const updates: TerminalCommandUpdateEvent[] = [];
    let mutationCount = 0;
    const settings = makeSettings();
    settings.execution.backend = "docker";
    const orchestrator = new TerminalServiceCommandOrchestrator({
      workspaceDir: root,
      getSettings: () => settings,
      backends: new Map([
        ["local", createFakeBackend({ name: "local", mode: "local" })],
        [
          "docker",
          createFakeBackend({
            name: "docker",
            mode: "container",
            engine: "docker",
            onRun: (command) => {
              dockerRuns.push(command);
            },
            stdout: "docker-ok",
          }),
        ],
      ]),
      historyStore,
      onMutation: () => {
        mutationCount += 1;
      },
      onCommand: (event) => {
        updates.push(event);
      },
    });

    try {
      const record = await orchestrator.run("printf 'docker-ok'");

      expect(mutationCount).toBe(1);
      expect(dockerRuns).toEqual(["printf 'docker-ok'"]);
      expect(record.backend).toBe("docker");
      expect(record.stdout).toBe("docker-ok");
      expect(historyStore.read().commands).toHaveLength(1);
      expect(updates).toHaveLength(1);
      expect(updates[0]?.commandId).toBe(record.id);
      expect(updates[0]?.backend).toBe("docker");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("streams local output, persists the record, and emits a single update", async () => {
    const root = mkdtempSync(
      join(tmpdir(), "doolittle-terminal-orchestrator-stream-"),
    );
    const historyStore = new TerminalCommandHistoryStore(
      join(root, "terminal-history.json"),
    );
    const updates: TerminalCommandUpdateEvent[] = [];
    let mutationCount = 0;
    let streamedStdout = "";
    const settings = makeSettings();
    settings.execution.backend = "local";
    const orchestrator = new TerminalServiceCommandOrchestrator({
      workspaceDir: root,
      getSettings: () => settings,
      backends: new Map([
        ["local", createFakeBackend({ name: "local", mode: "local" })],
      ]),
      historyStore,
      onMutation: () => {
        mutationCount += 1;
      },
      onCommand: (event) => {
        updates.push(event);
      },
    });

    try {
      const record = await orchestrator.runStreamingLocal(
        "printf 'stream-ok'",
        {
          onStdout: (chunk) => {
            streamedStdout += chunk;
          },
        },
        5_000,
      );

      expect(mutationCount).toBe(1);
      expect(streamedStdout).toBe("stream-ok");
      expect(record.backend).toBe("local");
      expect(record.stdout).toBe("stream-ok");
      expect(historyStore.read().commands).toHaveLength(1);
      expect(updates).toHaveLength(1);
      expect(updates[0]?.backend).toBe("local");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("routes local streaming through the shell router adapter", async () => {
    const root = mkdtempSync(
      join(tmpdir(), "doolittle-terminal-orchestrator-router-"),
    );
    const historyStore = new TerminalCommandHistoryStore(
      join(root, "terminal-history.json"),
    );
    const settings = makeSettings();
    const controller = new AbortController();
    const onStdout = vi.fn();
    const onStderr = vi.fn();
    const runTextProcess = vi
      .spyOn(processExecution, "runTextProcess")
      .mockResolvedValue({
        exitCode: 0,
        stdout: "router-ok",
        stderr: "",
        durationMs: 3,
        sandbox: "docker",
      });
    const orchestrator = new TerminalServiceCommandOrchestrator({
      workspaceDir: root,
      getSettings: () => settings,
      backends: new Map([
        ["local", createFakeBackend({ name: "local", mode: "local" })],
      ]),
      historyStore,
    });

    try {
      const record = await orchestrator.runStreamingLocal(
        "printf router-ok",
        { onStdout, onStderr },
        1_234,
        controller.signal,
      );

      const shell = localShellInvocation("printf router-ok");
      expect(runTextProcess).toHaveBeenCalledWith(
        shell.executable,
        shell.args,
        {
          cwd: root,
          timeoutMs: 1_234,
          onStdout,
          onStderr,
          abortSignal: controller.signal,
          toolName: "doolittle.terminal.streaming-local",
        },
      );
      expect(record).toMatchObject({
        backend: "local",
        stdout: "router-ok",
        exitCode: 0,
      });
      expect(historyStore.read().commands).toHaveLength(1);
    } finally {
      runTextProcess.mockRestore();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("delegates non-local streaming requests to the normal run path", async () => {
    const root = mkdtempSync(
      join(tmpdir(), "doolittle-terminal-orchestrator-delegate-"),
    );
    const historyStore = new TerminalCommandHistoryStore(
      join(root, "terminal-history.json"),
    );
    const dockerRuns: string[] = [];
    let mutationCount = 0;
    const settings = makeSettings();
    settings.execution.backend = "docker";
    const orchestrator = new TerminalServiceCommandOrchestrator({
      workspaceDir: root,
      getSettings: () => settings,
      backends: new Map([
        ["local", createFakeBackend({ name: "local", mode: "local" })],
        [
          "docker",
          createFakeBackend({
            name: "docker",
            mode: "container",
            engine: "docker",
            onRun: (command) => {
              dockerRuns.push(command);
            },
            stdout: "delegated-ok",
          }),
        ],
      ]),
      historyStore,
      onMutation: () => {
        mutationCount += 1;
      },
    });

    try {
      const record = await orchestrator.runStreamingLocal(
        "printf 'delegated-ok'",
      );

      expect(mutationCount).toBe(1);
      expect(dockerRuns).toEqual(["printf 'delegated-ok'"]);
      expect(record.backend).toBe("docker");
      expect(record.stdout).toBe("delegated-ok");
      expect(historyStore.read().commands).toHaveLength(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
