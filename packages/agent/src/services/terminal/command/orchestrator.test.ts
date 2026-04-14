import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  ExecutionBackendName,
  ExecutionBackendPreview,
} from "@/types/execution";
import type { RuntimeSettings } from "../../settings/runtime-settings";
import type { ExecutionBackend } from "../contracts/backend";
import { TerminalCommandHistoryStore } from "../records/history";
import {
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
      dockerImage: "oven/bun:latest",
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
      serverCommand: "",
      timeoutMs: 5_000,
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
